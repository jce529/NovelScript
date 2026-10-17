import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient, createTestUser, deleteTestUserStrict, pgPool, signedInClient,
} from '../helpers/db';
import { minimumReadingMs } from '../../lib/reader/completion';

/**
 * Real-DB regression suite for 0025_reader_completion.sql (03-12, READ-04).
 *
 * RESERVED FOR THE 03-19 CHECKPOINT: 0024 and 0025 must be applied to the target test project first
 * (`node --env-file=.env.local scripts/apply-migration.mjs 0025_reader_completion.sql`). Run with:
 *
 *   COMPLETION_DB_TEST=1 npx vitest run tests/reader/completion.database.test.ts
 *
 * Without the flag the suite is a visible `todo`. With the flag, a missing env or unapplied
 * 0024/0025 FAILS in beforeAll.
 *
 * Roles: the pg pool only creates fixtures, shifts DB clocks (session_started_at) and observes rows.
 * Every reading-state write and every completion call goes through a browser session, so the stored
 * values are produced by save_chapter_reading exactly as in production; only time is adjusted.
 */

const OPT_IN = process.env.COMPLETION_DB_TEST === '1';

type ChapterReadingState = {
  chapterId: string;
  workId: string;
  scrollRatio: number;
  maxScrollRatio: number;
  activeMs: number;
  completedAt: string | null;
  sessionId: string | null;
  sessionActiveMs: number;
  lastSequence: number;
};
type TestUser = { id: string; email?: string };

if (!OPT_IN) {
  describe('chapter completion (real DB, 0025)', () => {
    it.todo('reserved for 03-19: apply 0024 + 0025, then run with COMPLETION_DB_TEST=1');
  });
}

describe.runIf(OPT_IN)('chapter completion (real DB, 0025)', () => {
  const sql = pgPool(2);
  const users: TestUser[] = [];
  const workIds: string[] = [];

  let reader: TestUser;
  let other: TestUser;
  let author: TestUser;
  let sanctioned: TestUser;
  let readerDb: SupabaseClient;
  let otherDb: SupabaseClient;
  let sanctionedDb: SupabaseClient;

  let work: string;
  let otherWork: string;
  const FIVE_K = '가'.repeat(5000);
  const uuid = () => crypto.randomUUID();

  async function insertChapter(workId: string, order: number, opts: { price?: number | null; content?: string } = {}) {
    const id = uuid();
    await sql`insert into chapters (id, work_id, title, content, order_index, is_published, price_tier)
      values (${id}, ${workId}, ${'회차 ' + order}, ${opts.content ?? FIVE_K}, ${order}, true, ${opts.price ?? null})`;
    return id;
  }

  beforeAll(async () => {
    const missing = ['SUPABASE_DB_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`COMPLETION_DB_TEST=1 but missing env: ${missing.join(', ')}`);
    const [{ applied }] = await sql`select to_regprocedure('public.save_chapter_reading(uuid,uuid,uuid,bigint,numeric,bigint,integer)') is not null
      and to_regprocedure('public.complete_chapter(uuid,uuid,uuid)') is not null as applied`;
    if (!applied) throw new Error('0024/0025 are not applied to this database (03-19 Task 1)');

    [reader, other, author, sanctioned] = await Promise.all(Array.from({ length: 4 }, () => createTestUser()));
    users.push(reader, other, author, sanctioned);
    await sql`update profiles set role = 'writer', pen_name = ${'CP' + author.id.slice(0, 8)} where id = ${author.id}`;
    work = uuid();
    otherWork = uuid();
    await sql`insert into works (id, owner_id, title) values (${work}, ${author.id}, 'completion fixture'),
      (${otherWork}, ${author.id}, 'completion other')`;
    workIds.push(work, otherWork);

    [readerDb, otherDb, sanctionedDb] = await Promise.all([reader, other, sanctioned].map((u) => signedInClient(u)));
  });

  afterAll(async () => {
    const ids = users.map((u) => u.id);
    try {
      if (ids.length) {
        await sql`delete from chapter_reading_state where user_id = any(${ids}::uuid[])`;
        await sql`delete from reading_progress where user_id = any(${ids}::uuid[])`;
      }
      if (workIds.length) {
        await sql`delete from entitlements where work_id = any(${workIds}::uuid[])`;
        await sql`delete from chapters where work_id = any(${workIds}::uuid[])`;
        await sql`delete from works where id = any(${workIds}::uuid[])`;
      }
      for (const u of users) await deleteTestUserStrict(u.id);
    } finally {
      await sql.end();
    }
  });

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------
  async function rpcOk<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data as T;
  }
  async function errorOf(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    expect(error, 'expected the call to be rejected').not.toBeNull();
    return error!.message;
  }
  const open = (db: SupabaseClient, chapterId: string, session: string, workId = work) =>
    db.rpc('open_chapter_reading', { p_work_id: workId, p_chapter_id: chapterId, p_session_id: session });
  const save = (db: SupabaseClient, chapterId: string, session: string,
    a: { sequence: number; ratio: number; activeMs: number; endVisibleMs: number }) =>
    db.rpc('save_chapter_reading', {
      p_work_id: work, p_chapter_id: chapterId, p_session_id: session, p_sequence: a.sequence,
      p_scroll_ratio: a.ratio, p_session_active_ms: a.activeMs, p_end_visible_ms: a.endVisibleMs,
    });
  const complete = (db: SupabaseClient, chapterId: string, session: string, workId = work) =>
    db.rpc('complete_chapter', { p_work_id: workId, p_chapter_id: chapterId, p_session_id: session });

  async function row(userId: string, chapterId: string) {
    const rows = await sql`select * from chapter_reading_state where user_id = ${userId} and chapter_id = ${chapterId}`;
    return rows[0] as Record<string, unknown> | undefined;
  }
  async function ageSession(userId: string, chapterId: string, ms: number) {
    await sql`update chapter_reading_state
      set session_started_at = session_started_at - make_interval(secs => ${ms / 1000})
      where user_id = ${userId} and chapter_id = ${chapterId}`;
  }
  /** Opens a fresh visit of `chapterId`, ages its DB clock and stores one sample via the browser. */
  async function readTo(db: SupabaseClient, userId: string, chapterId: string,
    a: { ratio: number; activeMs: number; endVisibleMs: number }) {
    const session = uuid();
    await rpcOk(open(db, chapterId, session));
    await ageSession(userId, chapterId, a.activeMs + 60_000);
    await rpcOk(save(db, chapterId, session, { sequence: 1, ...a }));
    return session;
  }

  // ---------------------------------------------------------------------------
  // formula parity
  // ---------------------------------------------------------------------------
  it('chapter_minimum_reading_ms matches minimumReadingMs on fixture boundaries', async () => {
    for (const chars of [0, 1, 1199, 1200, 1201, 5000, 10_000, 123_457]) {
      const [{ ms }] = await sql`select chapter_minimum_reading_ms(${chars}::integer) as ms`;
      expect(Number(ms), String(chars)).toBe(minimumReadingMs(chars));
    }
  });

  it('the minimum-time helper is not callable by API roles', async () => {
    expect(await errorOf(readerDb.rpc('chapter_minimum_reading_ms', { p_char_count: 5000 })))
      .toMatch(/permission denied|Could not find/);
  });

  // ---------------------------------------------------------------------------
  // judgement boundaries (5,000 chars -> 125,000 ms)
  // ---------------------------------------------------------------------------
  it('124,999 ms is not complete; 125,000 ms + end 1000 + ratio .98 completes', async () => {
    const chapterId = await insertChapter(work, 1);
    const session = uuid();
    await rpcOk(open(readerDb, chapterId, session));
    await ageSession(reader.id, chapterId, 200_000);

    await rpcOk(save(readerDb, chapterId, session, { sequence: 1, ratio: 0.98, activeMs: 124_999, endVisibleMs: 1000 }));
    const short = await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, session));
    expect(short.completedAt).toBeNull();

    await rpcOk(save(readerDb, chapterId, session, { sequence: 2, ratio: 0.98, activeMs: 125_000, endVisibleMs: 1000 }));
    const done = await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, session));
    expect(done.completedAt).not.toBeNull();
    expect(done.activeMs).toBe(125_000);
    expect(Object.keys(done)).not.toContain('userId');
  });

  it('ratio .9799 or end sentinel 999 ms is not complete', async () => {
    const lowRatio = await insertChapter(work, 2);
    const s1 = await readTo(readerDb, reader.id, lowRatio, { ratio: 0.9799, activeMs: 200_000, endVisibleMs: 5000 });
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, lowRatio, s1))).completedAt).toBeNull();

    const shortEnd = await insertChapter(work, 3);
    const s2 = await readTo(readerDb, reader.id, shortEnd, { ratio: 1, activeMs: 200_000, endVisibleMs: 999 });
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, shortEnd, s2))).completedAt).toBeNull();
    expect((await row(reader.id, shortEnd))!.completed_at).toBeNull();
  });

  it('an empty chapter still needs the 30 s floor', async () => {
    const empty = await insertChapter(work, 4, { content: '' });
    const s1 = await readTo(readerDb, reader.id, empty, { ratio: 1, activeMs: 29_999, endVisibleMs: 1000 });
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, empty, s1))).completedAt).toBeNull();
    await rpcOk(save(readerDb, empty, s1, { sequence: 2, ratio: 1, activeMs: 30_000, endVisibleMs: 1000 }));
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, empty, s1))).completedAt).not.toBeNull();
  });

  // ---------------------------------------------------------------------------
  // idempotence
  // ---------------------------------------------------------------------------
  it('a second completion and a later visit keep the first completion time and active time', async () => {
    const chapterId = await insertChapter(work, 5);
    const s1 = await readTo(readerDb, reader.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    const first = await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, s1));
    expect(first.completedAt).not.toBeNull();

    const again = await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, s1));
    expect(again).toEqual(first);

    const concurrent = await Promise.all([complete(readerDb, chapterId, s1), complete(readerDb, chapterId, s1)]);
    for (const r of concurrent) expect((r.data as ChapterReadingState).completedAt).toBe(first.completedAt);

    const s2 = await readTo(readerDb, reader.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    const later = await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, s2));
    expect(later.completedAt).toBe(first.completedAt);
    // Only save adds active time (130 000 per visit); complete adds none.
    expect(later.activeMs).toBe(260_000);
  });

  // ---------------------------------------------------------------------------
  // spoofing / fake active time
  // ---------------------------------------------------------------------------
  it('caller-supplied active time / char count / completion time are not accepted', async () => {
    const chapterId = await insertChapter(work, 6);
    const session = uuid();
    await rpcOk(open(readerDb, chapterId, session));
    expect(await errorOf(readerDb.rpc('complete_chapter', {
      p_work_id: work, p_chapter_id: chapterId, p_session_id: session,
      p_active_ms: 999_999, p_char_count: 0, p_completed_at: new Date().toISOString(),
    }))).toMatch(/Could not find|function/);
    expect((await row(reader.id, chapterId))!.completed_at).toBeNull();
  });

  it('session time above DB elapsed + 5000 ms does not complete (clock moved forward)', async () => {
    const chapterId = await insertChapter(work, 7);
    const session = await readTo(readerDb, reader.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    // Time-only adjustment: pretend the visit started just now, so 130 000 ms exceeds elapsed + 5000.
    await sql`update chapter_reading_state set session_started_at = now()
      where user_id = ${reader.id} and chapter_id = ${chapterId}`;
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, session))).completedAt).toBeNull();
  });

  it('a previous or foreign session id does not complete', async () => {
    const chapterId = await insertChapter(work, 8);
    const s1 = await readTo(readerDb, reader.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    const s2 = uuid();
    await rpcOk(open(readerDb, chapterId, s2));
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, s1))).completedAt).toBeNull();
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, chapterId, uuid()))).completedAt).toBeNull();
    expect((await row(reader.id, chapterId))!.completed_at).toBeNull();
  });

  it('another reader using the reader session id gets a zero snapshot and changes nothing', async () => {
    const chapterId = await insertChapter(work, 9);
    const session = await readTo(readerDb, reader.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    const before = await row(reader.id, chapterId);
    const spoof = await rpcOk<ChapterReadingState>(complete(otherDb, chapterId, session));
    expect(spoof).toMatchObject({ sessionId: null, completedAt: null, activeMs: 0 });
    expect(await row(reader.id, chapterId)).toEqual(before);
    expect(await row(other.id, chapterId)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // access
  // ---------------------------------------------------------------------------
  it('anonymous callers cannot execute complete_chapter', async () => {
    const chapterId = await insertChapter(work, 10);
    expect(await errorOf(complete(anonClient(), chapterId, uuid()))).toMatch(/permission denied|authentication_required/);
  });

  it('rejects a mismatched work/chapter pair and invalid session', async () => {
    const chapterId = await insertChapter(work, 11);
    expect(await errorOf(complete(readerDb, chapterId, uuid(), otherWork))).toMatch(/chapter_unavailable/);
    expect(await errorOf(readerDb.rpc('complete_chapter', { p_work_id: work, p_chapter_id: chapterId, p_session_id: null })))
      .toMatch(/invalid_input/);
  });

  it('paid: locked rejected, entitled completes, revoked entitlement then rejected', async () => {
    const locked = await insertChapter(work, 12, { price: 30 });
    expect(await errorOf(complete(readerDb, locked, uuid()))).toMatch(/chapter_not_readable/);

    const paid = await insertChapter(work, 13, { price: 10 });
    await sql`insert into entitlements (user_id, work_id, chapter_id, entitlement_type, source_type, source_id)
      values (${reader.id}, ${work}, ${paid}, 'PERMANENT', 'TEST_FIXTURE', ${'completion-' + paid})`;
    const session = await readTo(readerDb, reader.id, paid, { ratio: 0.99, activeMs: 130_000, endVisibleMs: 1500 });

    await sql`update entitlements set revoked_at = now() where chapter_id = ${paid} and user_id = ${reader.id}`;
    expect(await errorOf(complete(readerDb, paid, session))).toMatch(/chapter_not_readable/);
    expect((await row(reader.id, paid))!.completed_at).toBeNull();

    await sql`update entitlements set revoked_at = null where chapter_id = ${paid} and user_id = ${reader.id}`;
    expect((await rpcOk<ChapterReadingState>(complete(readerDb, paid, session))).completedAt).not.toBeNull();
  });

  it('a blind after reading the end rejects completion (blind first)', async () => {
    const chapterId = await insertChapter(work, 14);
    const session = await readTo(readerDb, reader.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    await sql`select moderation_set_blind(${work}, ${chapterId}, '완독 테스트 블라인드')`;
    expect(await errorOf(complete(readerDb, chapterId, session))).toMatch(/chapter_not_readable/);
    expect((await row(reader.id, chapterId))!.completed_at).toBeNull();
  });

  it('a sanction after reading the end rejects completion', async () => {
    const chapterId = await insertChapter(work, 15);
    const session = await readTo(sanctionedDb, sanctioned.id, chapterId, { ratio: 1, activeMs: 130_000, endVisibleMs: 2000 });
    await sql.begin(async (tx) => {
      await tx`select set_config('app.sanction_cache_writer', 'on', true)`;
      await tx`update profiles set sanction_kind = 'suspension', sanctioned_until = now() + interval '1 hour'
        where id = ${sanctioned.id}`;
    });
    expect(await errorOf(complete(sanctionedDb, chapterId, session))).toMatch(/write_access_denied/);
    expect((await row(sanctioned.id, chapterId))!.completed_at).toBeNull();
  });

  it('direct completed_at forgery is still rejected for the owner', async () => {
    const chapterId = await insertChapter(work, 16);
    await rpcOk(open(readerDb, chapterId, uuid()));
    const forged = await readerDb.from('chapter_reading_state')
      .update({ completed_at: new Date().toISOString() }).eq('chapter_id', chapterId);
    expect(forged.error?.message).toMatch(/permission denied/);
    expect((await row(reader.id, chapterId))!.completed_at).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient, createTestUser, deleteTestUserStrict, pgPool, signedInClient,
} from '../helpers/db';

/**
 * Real-DB regression suite for 0024_chapter_reading_state.sql (03-11, READ-04).
 *
 * RESERVED FOR THE 03-19 CHECKPOINT: 0024 must be applied to the target test project first
 * (`node --env-file=.env.local scripts/apply-migration.mjs 0024_chapter_reading_state.sql`).
 * Run explicitly with:
 *
 *   READING_STATE_DB_TEST=1 npx vitest run tests/reader/reading-state.database.test.ts
 *
 * Without the opt-in flag the suite is reported as a visible `todo` (never a silent pass). With the
 * flag, a missing environment or an unapplied 0024 FAILS in beforeAll instead of skipping.
 *
 * Roles: the pg pool / service-role client only create fixtures, shift DB clocks and observe side
 * effects. Every SELECT/RPC/permission assertion runs through an anonymous, owner or other-reader
 * session. Session time is made deterministic by moving session_started_at back (no sleeps).
 * Cleanup order: chapter_reading_state -> reading_progress -> fixtures (entitlements, chapters,
 * works) -> auth users.
 */

const OPT_IN = process.env.READING_STATE_DB_TEST === '1';

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
type SaveArgs = { sequence: number; ratio: number; activeMs: number; endVisibleMs?: number | null };

if (!OPT_IN) {
  describe('chapter reading state (real DB, 0024)', () => {
    it.todo('reserved for 03-19: apply 0024, then run with READING_STATE_DB_TEST=1');
  });
}

describe.runIf(OPT_IN)('chapter reading state (real DB, 0024)', () => {
  const sql = pgPool(2);
  const users: TestUser[] = [];
  const workIds: string[] = [];
  const chapterIds: string[] = [];

  let reader: TestUser;
  let other: TestUser;
  let author: TestUser;
  let suspended: TestUser;
  let removed: TestUser;
  let readerDb: SupabaseClient;
  let otherDb: SupabaseClient;
  let authorDb: SupabaseClient;
  let suspendedDb: SupabaseClient;
  let removedDb: SupabaseClient;

  let work: string;
  let otherWork: string;
  const ch: Record<
    'free' | 'free2' | 'paid' | 'entitled' | 'draft' | 'deleted' | 'blinded' | 'otherWorkFree',
    string
  > = {} as never;

  const uuid = () => crypto.randomUUID();

  async function insertChapter(workId: string, order: number, opts: {
    published?: boolean; price?: number | null; deleted?: boolean; content?: string;
  } = {}) {
    const id = uuid();
    await sql`insert into chapters (id, work_id, title, content, order_index, is_published, price_tier, deleted_at)
      values (${id}, ${workId}, ${'회차 ' + order}, ${opts.content ?? '본문 가 나 다'}, ${order},
        ${opts.published ?? true}, ${opts.price ?? null}, ${opts.deleted ? sql`now()` : null})`;
    chapterIds.push(id);
    return id;
  }

  beforeAll(async () => {
    const missing = ['SUPABASE_DB_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']
      .filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`READING_STATE_DB_TEST=1 but missing env: ${missing.join(', ')}`);
    const [{ applied }] = await sql`select to_regprocedure('public.open_chapter_reading(uuid,uuid,uuid)') is not null
      and to_regprocedure('public.save_chapter_reading(uuid,uuid,uuid,bigint,numeric,bigint,integer)') is not null
      and to_regclass('public.chapter_reading_state') is not null as applied`;
    if (!applied) throw new Error('0024_chapter_reading_state.sql is not applied to this database (03-19 Task 1)');

    [reader, other, author, suspended, removed] = await Promise.all(
      Array.from({ length: 5 }, () => createTestUser())
    );
    users.push(reader, other, author, suspended, removed);
    await sql`update profiles set role = 'writer', pen_name = ${'RS' + author.id.slice(0, 8)} where id = ${author.id}`;

    work = uuid();
    otherWork = uuid();
    await sql`insert into works (id, owner_id, title) values (${work}, ${author.id}, 'reading-state fixture'),
      (${otherWork}, ${author.id}, 'reading-state other')`;
    workIds.push(work, otherWork);

    ch.free = await insertChapter(work, 0);
    ch.free2 = await insertChapter(work, 1);
    ch.paid = await insertChapter(work, 2, { price: 30 });
    ch.entitled = await insertChapter(work, 3, { price: 10 });
    ch.draft = await insertChapter(work, 4, { published: false });
    ch.deleted = await insertChapter(work, 5, { deleted: true });
    ch.blinded = await insertChapter(work, 6);
    ch.otherWorkFree = await insertChapter(otherWork, 0);

    await sql`insert into entitlements (user_id, work_id, chapter_id, entitlement_type, source_type, source_id)
      values (${reader.id}, ${work}, ${ch.entitled}, 'PERMANENT', 'TEST_FIXTURE', ${'reading-state-' + reader.id})`;
    await sql`select moderation_set_blind(${work}, ${ch.blinded}, '읽기 상태 테스트 블라인드')`;
    await sql.begin(async (tx) => {
      await tx`select set_config('app.sanction_cache_writer', 'on', true)`;
      await tx`update profiles set sanction_kind = 'suspension', sanctioned_until = now() + interval '1 hour'
        where id = ${suspended.id}`;
    });

    [readerDb, otherDb, authorDb, suspendedDb, removedDb] = await Promise.all(
      [reader, other, author, suspended, removed].map((u) => signedInClient(u))
    );
    // Deleted profile with a still-valid browser session.
    await sql`update profiles set deleted_at = now() where id = ${removed.id}`;
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
  // helpers (browser-session calls)
  // ---------------------------------------------------------------------------
  async function open(db: SupabaseClient, chapterId: string, sessionId: string, workId = work) {
    return db.rpc('open_chapter_reading', { p_work_id: workId, p_chapter_id: chapterId, p_session_id: sessionId });
  }
  async function openOk(db: SupabaseClient, chapterId: string, sessionId: string, workId = work) {
    const { data, error } = await open(db, chapterId, sessionId, workId);
    if (error) throw error;
    return data as ChapterReadingState;
  }
  async function save(db: SupabaseClient, chapterId: string, sessionId: string, a: SaveArgs, workId = work) {
    return db.rpc('save_chapter_reading', {
      p_work_id: workId, p_chapter_id: chapterId, p_session_id: sessionId, p_sequence: a.sequence,
      p_scroll_ratio: a.ratio, p_session_active_ms: a.activeMs, p_end_visible_ms: a.endVisibleMs ?? null,
    });
  }
  async function saveOk(db: SupabaseClient, chapterId: string, sessionId: string, a: SaveArgs) {
    const { data, error } = await save(db, chapterId, sessionId, a);
    if (error) throw error;
    return data as ChapterReadingState;
  }
  async function errorOf(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    expect(error, 'expected the call to be rejected').not.toBeNull();
    return error!.message;
  }

  // fixture-side observation / clock adjustment (pg, owner role)
  async function row(userId: string, chapterId: string) {
    const rows = await sql`select * from chapter_reading_state where user_id = ${userId} and chapter_id = ${chapterId}`;
    return rows[0] as Record<string, unknown> | undefined;
  }
  async function ageSession(userId: string, chapterId: string, ms: number) {
    await sql`update chapter_reading_state
      set session_started_at = session_started_at - make_interval(secs => ${ms / 1000})
      where user_id = ${userId} and chapter_id = ${chapterId}`;
  }
  async function pointer(userId: string, workId = work) {
    const rows = await sql`select chapter_id from reading_progress where user_id = ${userId} and work_id = ${workId}`;
    return rows[0]?.chapter_id as string | undefined;
  }
  async function resetState(userId: string) {
    await sql`delete from chapter_reading_state where user_id = ${userId}`;
    await sql`delete from reading_progress where user_id = ${userId}`;
  }

  // ---------------------------------------------------------------------------
  // open
  // ---------------------------------------------------------------------------
  it('anonymous callers cannot execute either RPC', async () => {
    const anon = anonClient();
    expect(await errorOf(open(anon, ch.free, uuid()))).toMatch(/permission denied|authentication_required/);
    expect(await errorOf(save(anon, ch.free, uuid(), { sequence: 1, ratio: 0.1, activeMs: 0 })))
      .toMatch(/permission denied|authentication_required/);
  });

  it('open is idempotent per session, keeps first opened_at and sets the work pointer', async () => {
    await resetState(reader.id);
    const session = uuid();
    const first = await openOk(readerDb, ch.free, session);
    expect(first).toMatchObject({ chapterId: ch.free, workId: work, sessionId: session, scrollRatio: 0,
      maxScrollRatio: 0, activeMs: 0, completedAt: null, sessionActiveMs: 0, lastSequence: 0 });
    expect(Object.keys(first)).not.toContain('userId');
    expect(await pointer(reader.id)).toBe(ch.free);

    await ageSession(reader.id, ch.free, 60_000);
    await saveOk(readerDb, ch.free, session, { sequence: 1, ratio: 0.3, activeMs: 10_000 });
    const before = await row(reader.id, ch.free);

    const again = await openOk(readerDb, ch.free, session);
    const after = await row(reader.id, ch.free);
    expect(again).toMatchObject({ sessionId: session, lastSequence: 1, sessionActiveMs: 10_000, activeMs: 10_000 });
    expect(after!.opened_at).toEqual(before!.opened_at);
    expect(after!.session_started_at).toEqual(before!.session_started_at);
  });

  it('concurrent duplicate opens of one session produce one row and one session clock', async () => {
    await resetState(reader.id);
    const session = uuid();
    const results = await Promise.all([open(readerDb, ch.free, session), open(readerDb, ch.free, session)]);
    for (const r of results) expect(r.error).toBeNull();
    const [{ count }] = await sql`select count(*)::int as count from chapter_reading_state
      where user_id = ${reader.id} and chapter_id = ${ch.free}`;
    expect(count).toBe(1);
  });

  it('a new session starts a fresh visit but keeps opened_at and accumulated totals', async () => {
    await resetState(reader.id);
    const s1 = uuid();
    await openOk(readerDb, ch.free, s1);
    await ageSession(reader.id, ch.free, 120_000);
    await saveOk(readerDb, ch.free, s1, { sequence: 3, ratio: 0.6, activeMs: 40_000 });
    const before = await row(reader.id, ch.free);

    const s2 = uuid();
    const reopened = await openOk(readerDb, ch.free, s2);
    expect(reopened).toMatchObject({ sessionId: s2, sessionActiveMs: 0, lastSequence: 0, activeMs: 40_000,
      maxScrollRatio: 0.6, scrollRatio: 0.6 });
    const after = await row(reader.id, ch.free);
    expect(after!.opened_at).toEqual(before!.opened_at);
    expect((after!.session_started_at as Date).getTime()).toBeGreaterThan((before!.session_started_at as Date).getTime());

    await ageSession(reader.id, ch.free, 30_000);
    const next = await saveOk(readerDb, ch.free, s2, { sequence: 1, ratio: 0.7, activeMs: 5_000 });
    expect(next).toMatchObject({ activeMs: 45_000, sessionActiveMs: 5_000, lastSequence: 1 });
  });

  // ---------------------------------------------------------------------------
  // save ordering / idempotence
  // ---------------------------------------------------------------------------
  it('a replayed sample does not add active time; ratio can go back while max is kept', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    await ageSession(reader.id, ch.free, 300_000);

    const a = await saveOk(readerDb, ch.free, session, { sequence: 1, ratio: 0.8, activeMs: 20_000 });
    expect(a).toMatchObject({ scrollRatio: 0.8, maxScrollRatio: 0.8, activeMs: 20_000, lastSequence: 1 });
    const replay = await saveOk(readerDb, ch.free, session, { sequence: 1, ratio: 0.8, activeMs: 20_000 });
    expect(replay).toEqual(a);

    const back = await saveOk(readerDb, ch.free, session, { sequence: 2, ratio: 0.2, activeMs: 25_000 });
    expect(back).toMatchObject({ scrollRatio: 0.2, maxScrollRatio: 0.8, activeMs: 25_000, lastSequence: 2 });
  });

  it('out-of-order samples (older sequence or lower session time) change nothing', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    await ageSession(reader.id, ch.free, 300_000);
    const latest = await saveOk(readerDb, ch.free, session, { sequence: 5, ratio: 0.5, activeMs: 50_000 });

    expect(await saveOk(readerDb, ch.free, session, { sequence: 4, ratio: 0.9, activeMs: 60_000 })).toEqual(latest);
    expect(await saveOk(readerDb, ch.free, session, { sequence: 6, ratio: 0.9, activeMs: 40_000 })).toEqual(latest);
    expect((await row(reader.id, ch.free))!.max_scroll_ratio).toBe('0.5000');
  });

  it('a late flush of a previous session or a never-opened chapter changes nothing', async () => {
    await resetState(reader.id);
    const s1 = uuid();
    const s2 = uuid();
    await openOk(readerDb, ch.free, s1);
    await ageSession(reader.id, ch.free, 300_000);
    await saveOk(readerDb, ch.free, s1, { sequence: 1, ratio: 0.4, activeMs: 10_000 });
    const current = await openOk(readerDb, ch.free, s2);

    expect(await saveOk(readerDb, ch.free, s1, { sequence: 9, ratio: 1, activeMs: 200_000 })).toEqual(current);

    const missing = await saveOk(readerDb, ch.free2, s1, { sequence: 1, ratio: 0.9, activeMs: 1_000 });
    expect(missing).toMatchObject({ chapterId: ch.free2, sessionId: null, activeMs: 0, lastSequence: 0 });
    expect(await row(reader.id, ch.free2)).toBeUndefined();
  });

  it('caps session active time at DB elapsed + 5000 ms', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    await ageSession(reader.id, ch.free, 10_000);

    expect(await errorOf(save(readerDb, ch.free, session, { sequence: 1, ratio: 0.5, activeMs: 60_000 })))
      .toMatch(/active_time_exceeds_elapsed/);
    expect((await row(reader.id, ch.free))!.active_ms).toBe('0');

    const ok = await saveOk(readerDb, ch.free, session, { sequence: 1, ratio: 0.5, activeMs: 14_000 });
    expect(ok.activeMs).toBe(14_000);
  });

  it('stores end_visible_ms only when non-negative and within the elapsed bound', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    await ageSession(reader.id, ch.free, 10_000);

    await saveOk(readerDb, ch.free, session, { sequence: 1, ratio: 1, activeMs: 9_000, endVisibleMs: 1_200 });
    expect((await row(reader.id, ch.free))!.end_visible_ms).toBe(1_200);
    await saveOk(readerDb, ch.free, session, { sequence: 2, ratio: 1, activeMs: 9_500, endVisibleMs: 999_999 });
    expect((await row(reader.id, ch.free))!.end_visible_ms).toBe(1_200);
    await saveOk(readerDb, ch.free, session, { sequence: 3, ratio: 1, activeMs: 9_600, endVisibleMs: -5 });
    expect((await row(reader.id, ch.free))!.end_visible_ms).toBe(1_200);
  });

  it('concurrent saves of the same sample add active time once', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    await ageSession(reader.id, ch.free, 60_000);
    const sample = { sequence: 1, ratio: 0.5, activeMs: 30_000 };
    const results = await Promise.all([save(readerDb, ch.free, session, sample), save(readerDb, ch.free, session, sample)]);
    for (const r of results) expect(r.error).toBeNull();
    expect((await row(reader.id, ch.free))!.active_ms).toBe('30000');
  });

  it('a late flush of chapter A does not rewind the pointer that chapter B moved', async () => {
    await resetState(reader.id);
    const sa = uuid();
    const sb = uuid();
    await openOk(readerDb, ch.free, sa);
    await ageSession(reader.id, ch.free, 60_000);
    await openOk(readerDb, ch.free2, sb);
    expect(await pointer(reader.id)).toBe(ch.free2);

    await saveOk(readerDb, ch.free, sa, { sequence: 1, ratio: 0.9, activeMs: 20_000 });
    expect(await pointer(reader.id)).toBe(ch.free2);
  });

  it('rejects invalid input', async () => {
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    for (const bad of [
      { sequence: 0, ratio: 0.5, activeMs: 0 },
      { sequence: 1, ratio: 1.5, activeMs: 0 },
      { sequence: 1, ratio: -0.1, activeMs: 0 },
      { sequence: 1, ratio: 0.5, activeMs: -1 },
    ]) {
      expect(await errorOf(save(readerDb, ch.free, session, bad))).toMatch(/invalid_input/);
    }
  });

  // ---------------------------------------------------------------------------
  // access gate
  // ---------------------------------------------------------------------------
  it('rejects a chapter/work pair that does not match', async () => {
    expect(await errorOf(open(readerDb, ch.otherWorkFree, uuid(), work))).toMatch(/chapter_unavailable/);
    expect(await errorOf(open(readerDb, ch.free, uuid(), otherWork))).toMatch(/chapter_unavailable/);
    expect(await errorOf(open(readerDb, uuid(), uuid(), work))).toMatch(/chapter_unavailable/);
  });

  it('rejects paid-locked, blinded, unpublished and deleted chapters; allows entitled paid', async () => {
    for (const chapterId of [ch.paid, ch.blinded, ch.draft, ch.deleted]) {
      expect(await errorOf(open(readerDb, chapterId, uuid())), chapterId).toMatch(/chapter_not_readable/);
      expect(await row(reader.id, chapterId)).toBeUndefined();
    }
    expect((await openOk(readerDb, ch.entitled, uuid())).chapterId).toBe(ch.entitled);
  });

  it('a blind after open stops further saves', async () => {
    const session = uuid();
    const chapterId = await insertChapter(work, 20);
    await openOk(readerDb, chapterId, session);
    await sql`select moderation_set_blind(${work}, ${chapterId}, '중간 블라인드')`;
    expect(await errorOf(save(readerDb, chapterId, session, { sequence: 1, ratio: 0.5, activeMs: 0 })))
      .toMatch(/chapter_not_readable/);
  });

  it('the author reads their own published paid chapter, but not a blinded one', async () => {
    expect((await openOk(authorDb, ch.paid, uuid())).chapterId).toBe(ch.paid);
    expect(await errorOf(open(authorDb, ch.blinded, uuid()))).toMatch(/chapter_not_readable/);
  });

  it('suspended and deleted profiles cannot record reading state', async () => {
    expect(await errorOf(open(suspendedDb, ch.free, uuid()))).toMatch(/write_access_denied/);
    expect(await errorOf(open(removedDb, ch.free, uuid()))).toMatch(/authentication_required/);
    expect(await row(suspended.id, ch.free)).toBeUndefined();
    expect(await row(removed.id, ch.free)).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // ownership / direct DML
  // ---------------------------------------------------------------------------
  it('another reader sees zero rows and cannot write through the reader session id', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);
    await ageSession(reader.id, ch.free, 60_000);
    await saveOk(readerDb, ch.free, session, { sequence: 1, ratio: 0.3, activeMs: 3_000 });
    const before = await row(reader.id, ch.free);

    const { data: visible, error } = await otherDb.from('chapter_reading_state').select('*').eq('user_id', reader.id);
    expect(error).toBeNull();
    expect(visible).toEqual([]);

    const spoof = await saveOk(otherDb, ch.free, session, { sequence: 2, ratio: 1, activeMs: 50_000 });
    expect(spoof.sessionId).toBeNull();
    expect(await row(reader.id, ch.free)).toEqual(before);

    const own = await readerDb.from('chapter_reading_state').select('chapter_id, scroll_ratio').eq('chapter_id', ch.free);
    expect(own.error).toBeNull();
    expect(own.data).toHaveLength(1);
  });

  it('direct INSERT/UPDATE/DELETE and completed_at forgery are rejected for the owner', async () => {
    await resetState(reader.id);
    const session = uuid();
    await openOk(readerDb, ch.free, session);

    const insert = await readerDb.from('chapter_reading_state').insert({
      user_id: reader.id, chapter_id: ch.free2, work_id: work, session_id: uuid(), completed_at: new Date().toISOString(),
    });
    expect(insert.error?.message).toMatch(/permission denied/);

    const update = await readerDb.from('chapter_reading_state')
      .update({ completed_at: new Date().toISOString(), active_ms: 999_999, max_scroll_ratio: 1 })
      .eq('chapter_id', ch.free);
    expect(update.error?.message).toMatch(/permission denied/);

    const del = await readerDb.from('chapter_reading_state').delete().eq('chapter_id', ch.free);
    expect(del.error?.message).toMatch(/permission denied/);

    const stored = await row(reader.id, ch.free);
    expect(stored).toMatchObject({ completed_at: null, active_ms: '0', max_scroll_ratio: '0.0000' });
    expect(await row(reader.id, ch.free2)).toBeUndefined();
  });

  it('char_count stays private to browser sessions', async () => {
    const { error } = await readerDb.from('chapters').select('char_count').eq('id', ch.free);
    expect(error?.message).toMatch(/permission denied/);
    const [{ char_count }] = await sql`select char_count from chapters where id = ${ch.free}`;
    expect(char_count).toBe('본문가나다'.length);
  });
});

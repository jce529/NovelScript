import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient,
  createTestUser,
  deleteTestUserStrict,
  pgPool,
  signedInClient,
} from '../helpers/db';
import { MIN_SAMPLE_READERS } from '../../lib/reader/completion';

/**
 * Real-DB regression suite for 0054_work_reading_metrics.sql (26-02, RDATA-03).
 *
 * RESERVED FOR MANUAL DB GATE: 0024, 0025, 0052, 0053, and 0054 must be applied to the target
 * disposable test project first. Run explicitly with:
 *
 *   WORK_READING_METRICS_DB_TEST=1 npx vitest run tests/reader/work-reading-metrics.database.test.ts
 *
 * Without the flag the suite is reported as a visible `todo`. With the flag, a missing env or
 * unapplied migration FAILS in beforeAll.
 */

const OPT_IN = process.env.WORK_READING_METRICS_DB_TEST === '1';

type WorkReadingMetricsDto = {
  workId: string;
  reachedReaders: number;
  completionRate: number | null;
  retentionRate: number | null;
  sampleSufficient: boolean;
};

type WorkChapterMetricDto = {
  chapterId: string;
  orderIndex: number;
  reached: number;
  completed: number;
  completionRate: number | null;
  nextOpened: number;
  retentionRate: number | null;
};

type TestUser = { id: string; email?: string };

if (!OPT_IN) {
  describe('work reading metrics (real DB, 0054)', () => {
    it.todo(
      'reserved for manual DB gate: apply 0024 + 0025 + 0052 + 0053 + 0054, then run with WORK_READING_METRICS_DB_TEST=1'
    );
  });
}

describe.runIf(OPT_IN)('work reading metrics (real DB, 0054)', () => {
  const sql = pgPool(2);
  const users: TestUser[] = [];
  const workIds: string[] = [];

  let author: TestUser;
  let otherAuthor: TestUser;
  let readers: TestUser[]; // 5 verified readers
  let unverifiedReader: TestUser;
  let deletedReader: TestUser;

  let authorDb: SupabaseClient;
  let otherAuthorDb: SupabaseClient;
  let readerDb: SupabaseClient;

  const uuid = () => crypto.randomUUID();

  async function createWork(ownerId: string, title: string, opts: { deleted?: boolean; blinded?: boolean } = {}) {
    const id = uuid();
    await sql`
      insert into works (id, owner_id, title, deleted_at, admin_blinded, admin_blind_reason, admin_blinded_at)
      values (${id}, ${ownerId}, ${title}, ${opts.deleted ? sql`now()` : null}, ${opts.blinded ?? false}, ${opts.blinded ? '테스트 블라인드' : null}, ${opts.blinded ? sql`now()` : null})
    `;
    workIds.push(id);
    return id;
  }

  async function createChapter(
    workId: string,
    orderIndex: number,
    opts: { published?: boolean; deleted?: boolean; blinded?: boolean; content?: string } = {}
  ) {
    const id = uuid();
    await sql`
      insert into chapters (id, work_id, title, content, order_index, is_published, deleted_at, admin_blinded, admin_blind_reason, admin_blinded_at)
      values (
        ${id},
        ${workId},
        ${'회차 ' + orderIndex},
        ${opts.content ?? '본문 테스트'},
        ${orderIndex},
        ${opts.published ?? true},
        ${opts.deleted ? sql`now()` : null},
        ${opts.blinded ?? false},
        ${opts.blinded ? '테스트 블라인드' : null},
        ${opts.blinded ? sql`now()` : null}
      )
    `;
    return id;
  }

  async function putReadingState(
    userId: string,
    workId: string,
    chapterId: string,
    opts: {
      openedAtOffsetSec?: number;
      completedAtOffsetSec?: number | null;
      scrollRatio?: number;
      maxScrollRatio?: number;
    } = {}
  ) {
    const openedSec = opts.openedAtOffsetSec ?? 0;
    const completedSec = opts.completedAtOffsetSec ?? null;
    const ratio = opts.scrollRatio ?? (completedSec !== null ? 1 : 0.4);
    const maxRatio = opts.maxScrollRatio ?? Math.max(ratio, completedSec !== null ? 1 : 0.4);
    await sql`
      insert into chapter_reading_state (
        user_id, chapter_id, work_id, session_id,
        opened_at, last_seen_at, scroll_ratio, max_scroll_ratio,
        active_ms, session_active_ms, last_sequence, end_visible_ms, completed_at
      )
      values (
        ${userId},
        ${chapterId},
        ${workId},
        ${uuid()},
        now() + make_interval(secs => ${openedSec}),
        now() + make_interval(secs => ${openedSec}),
        ${ratio},
        ${maxRatio},
        ${completedSec !== null ? 130_000 : 10_000},
        ${completedSec !== null ? 130_000 : 10_000},
        1,
        ${completedSec !== null ? 1500 : 0},
        ${completedSec !== null ? sql`now() + make_interval(secs => ${completedSec})` : null}
      )
      on conflict (user_id, chapter_id) do update set
        opened_at = excluded.opened_at,
        completed_at = excluded.completed_at,
        scroll_ratio = excluded.scroll_ratio,
        max_scroll_ratio = excluded.max_scroll_ratio
    `;
  }

  async function rpcOk<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return data as T;
  }

  async function errorOf(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    expect(error, 'expected RPC call to be rejected').not.toBeNull();
    return error!.message;
  }

  beforeAll(async () => {
    const missing = [
      'SUPABASE_DB_URL',
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ].filter((name) => !process.env[name]);
    if (missing.length) throw new Error(`WORK_READING_METRICS_DB_TEST=1 but missing env: ${missing.join(', ')}`);

    const [{ applied }] = await sql`
      select to_regprocedure('public.work_reading_metrics(uuid)') is not null
        and to_regprocedure('public.work_chapter_metrics(uuid)') is not null
        and to_regprocedure('public.reading_completion_config()') is not null
        and to_regclass('public.chapter_reading_state_completed_chapter_idx') is not null as applied
    `;
    if (!applied) throw new Error('0024/0025/0052/0053/0054 are not applied to this database');

    const created = await Promise.all(Array.from({ length: 9 }, () => createTestUser()));
    users.push(...created);
    [author, otherAuthor, unverifiedReader, deletedReader, ...readers] = created;

    const verifiedIds = [author.id, otherAuthor.id, deletedReader.id, ...readers.map((r) => r.id)];
    await sql`update auth.users set phone_confirmed_at = now() where id = any(${verifiedIds}::uuid[])`;
    await sql`update profiles set role = 'writer', pen_name = ${'WM1_' + author.id.slice(0, 6)} where id = ${author.id}`;
    await sql`update profiles set role = 'writer', pen_name = ${'WM2_' + otherAuthor.id.slice(0, 6)} where id = ${otherAuthor.id}`;
    await sql`update profiles set deleted_at = now() where id = ${deletedReader.id}`;

    [authorDb, otherAuthorDb, readerDb] = await Promise.all(
      [author, otherAuthor, readers[0]].map((u) => signedInClient(u))
    );
  });

  afterAll(async () => {
    const ids = users.map((u) => u.id);
    try {
      if (ids.length) {
        await sql`delete from chapter_reading_state where user_id = any(${ids}::uuid[])`;
        await sql`delete from reading_progress where user_id = any(${ids}::uuid[])`;
      }
      if (workIds.length) {
        await sql`delete from chapters where work_id = any(${workIds}::uuid[])`;
        await sql`delete from works where id = any(${workIds}::uuid[])`;
      }
      for (const u of users) await deleteTestUserStrict(u.id);
    } finally {
      await sql.end();
    }
  });

  it('computes weighted work completionRate = sum(completed)/sum(reached) and retentionRate = sum(nextOpened)/sum(pair completed)', async () => {
    const workId = await createWork(author.id, 'weighted metrics fixture');
    const ch1 = await createChapter(workId, 0);
    const ch2 = await createChapter(workId, 1);
    const ch3 = await createChapter(workId, 2);

    // ch1: 5 reached (r0..r4), 4 completed (r0..r3) -> completionRate = 0.8
    for (let i = 0; i < 4; i++) {
      await putReadingState(readers[i].id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: 20 });
    }
    await putReadingState(readers[4].id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: null });

    // ch2: 2 reached (r0, r1), 1 completed (r0) -> completionRate = 0.5; ch1 nextOpened = 2, ch1 retentionRate = 2/4 = 0.5
    await putReadingState(readers[0].id, workId, ch2, { openedAtOffsetSec: 30, completedAtOffsetSec: 40 });
    await putReadingState(readers[1].id, workId, ch2, { openedAtOffsetSec: 30, completedAtOffsetSec: null });

    // ch3: 1 reached (r0), 1 completed (r0) -> completionRate = 1.0; ch2 nextOpened = 1, ch2 retentionRate = 1/1 = 1.0; ch3 retentionRate = null
    await putReadingState(readers[0].id, workId, ch3, { openedAtOffsetSec: 50, completedAtOffsetSec: 60 });

    const summary = await rpcOk<WorkReadingMetricsDto>(
      anonClient().rpc('work_reading_metrics', { p_work_id: workId })
    );
    expect(summary).toEqual({
      workId,
      reachedReaders: 5,
      completionRate: 6 / 8, // 0.75 (NOT simple chapter average (0.8 + 0.5 + 1.0) / 3)
      retentionRate: 3 / 5, // 0.6 (NOT simple pair average 0.75 and NOT 3/6)
      sampleSufficient: true,
    });

    const detail = await rpcOk<WorkChapterMetricDto[]>(
      authorDb.rpc('work_chapter_metrics', { p_work_id: workId })
    );
    expect(detail).toEqual([
      {
        chapterId: ch1,
        orderIndex: 0,
        reached: 5,
        completed: 4,
        completionRate: 0.8,
        nextOpened: 2,
        retentionRate: 0.5,
      },
      {
        chapterId: ch2,
        orderIndex: 1,
        reached: 2,
        completed: 1,
        completionRate: 0.5,
        nextOpened: 1,
        retentionRate: 1,
      },
      {
        chapterId: ch3,
        orderIndex: 2,
        reached: 1,
        completed: 1,
        completionRate: 1,
        nextOpened: 0,
        retentionRate: null,
      },
    ]);
  });

  it('hides summary rates below MIN_SAMPLE_READERS (5) and excludes author, deleted profile, and unverified accounts from all counts', async () => {
    expect(MIN_SAMPLE_READERS).toBe(5);
    const workId = await createWork(author.id, 'sample threshold & filter fixture');
    const ch1 = await createChapter(workId, 0);
    const ch2 = await createChapter(workId, 1);

    // 4 valid readers complete ch1 and open ch2.
    for (let i = 0; i < 4; i++) {
      await putReadingState(readers[i].id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: 20 });
      await putReadingState(readers[i].id, workId, ch2, { openedAtOffsetSec: 30, completedAtOffsetSec: null });
    }
    // Ineligible rows: work owner, deleted profile, unverified reader.
    await putReadingState(author.id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: 20 });
    await putReadingState(author.id, workId, ch2, { openedAtOffsetSec: 30, completedAtOffsetSec: 40 });
    await putReadingState(deletedReader.id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: 20 });
    await putReadingState(deletedReader.id, workId, ch2, { openedAtOffsetSec: 30, completedAtOffsetSec: 40 });
    await putReadingState(unverifiedReader.id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: null });
    await putReadingState(unverifiedReader.id, workId, ch2, { openedAtOffsetSec: 30, completedAtOffsetSec: null });

    const underSample = await rpcOk<WorkReadingMetricsDto>(
      readerDb.rpc('work_reading_metrics', { p_work_id: workId })
    );
    expect(underSample).toEqual({
      workId,
      reachedReaders: 4,
      completionRate: null,
      retentionRate: null,
      sampleSufficient: false,
    });

    // Owner detail still exposes chapter rates with only the 4 valid readers counted.
    const detail = await rpcOk<WorkChapterMetricDto[]>(
      authorDb.rpc('work_chapter_metrics', { p_work_id: workId })
    );
    expect(detail[0]).toEqual({
      chapterId: ch1,
      orderIndex: 0,
      reached: 4,
      completed: 4,
      completionRate: 1,
      nextOpened: 4,
      retentionRate: 1,
    });

    // Adding the 5th verified reader crosses the threshold.
    await putReadingState(readers[4].id, workId, ch1, { openedAtOffsetSec: 10, completedAtOffsetSec: null });
    const sufficient = await rpcOk<WorkReadingMetricsDto>(
      readerDb.rpc('work_reading_metrics', { p_work_id: workId })
    );
    // SQL numeric 나눗셈은 소수 15자리까지라 JS 4/9와 마지막 자리가 다르다 → 허용 오차 비교.
    expect(sufficient.completionRate).toBeCloseTo(4 / 9, 12);
    expect(sufficient).toEqual({
      workId,
      reachedReaders: 5,
      completionRate: sufficient.completionRate,
      retentionRate: 1,
      sampleSufficient: true,
    });
  });

  it('counts pre-opened N+1 in nextOpened and never forms a retention pair across unpublished, deleted, or blinded chapters', async () => {
    const workId = await createWork(author.id, 'pair & pre-open fixture');
    const ch1 = await createChapter(workId, 0, { published: true });
    const ch2 = await createChapter(workId, 1, { published: true });
    await createChapter(workId, 2, { published: false }); // draft gap at order 2
    const ch4 = await createChapter(workId, 3, { published: true });
    await createChapter(workId, 4, { published: true, deleted: true }); // deleted gap at order 4
    const ch6 = await createChapter(workId, 5, { published: true });

    // r0 opens ch2 BEFORE opening and completing ch1 (pre-open N+1).
    await putReadingState(readers[0].id, workId, ch2, { openedAtOffsetSec: -300, completedAtOffsetSec: -200 });
    await putReadingState(readers[0].id, workId, ch1, { openedAtOffsetSec: -100, completedAtOffsetSec: -50 });
    for (let i = 1; i < 5; i++) {
      await putReadingState(readers[i].id, workId, ch1, { openedAtOffsetSec: -100, completedAtOffsetSec: null });
    }
    // r0 also opens ch4 and ch6, but ch2->ch4 and ch4->ch6 are separated by draft/deleted chapters.
    await putReadingState(readers[0].id, workId, ch4, { openedAtOffsetSec: -10, completedAtOffsetSec: -5 });
    await putReadingState(readers[0].id, workId, ch6, { openedAtOffsetSec: 0, completedAtOffsetSec: null });

    const detail = await rpcOk<WorkChapterMetricDto[]>(
      authorDb.rpc('work_chapter_metrics', { p_work_id: workId })
    );
    expect(detail).toEqual([
      {
        chapterId: ch1,
        orderIndex: 0,
        reached: 5,
        completed: 1,
        completionRate: 0.2,
        nextOpened: 1,
        retentionRate: 1,
      },
      {
        chapterId: ch2,
        orderIndex: 1,
        reached: 1,
        completed: 1,
        completionRate: 1,
        nextOpened: 0,
        retentionRate: null,
      },
      {
        chapterId: ch4,
        orderIndex: 3,
        reached: 1,
        completed: 1,
        completionRate: 1,
        nextOpened: 0,
        retentionRate: null,
      },
      {
        chapterId: ch6,
        orderIndex: 5,
        reached: 1,
        completed: 0,
        completionRate: 0,
        nextOpened: 0,
        retentionRate: null,
      },
    ]);

    const summary = await rpcOk<WorkReadingMetricsDto>(
      authorDb.rpc('work_reading_metrics', { p_work_id: workId })
    );
    expect(summary).toEqual({
      workId,
      reachedReaders: 5,
      completionRate: 3 / 8,
      retentionRate: 1, // Only ch1->ch2 is a valid pair (1/1)
      sampleSufficient: true,
    });
  });

  it('enforces public summary visibility (null for unpublished/blinded/deleted/missing works) and owner-only chapter detail access', async () => {
    const unpublishedWork = await createWork(author.id, 'unpublished work');
    await createChapter(unpublishedWork, 0, { published: false });
    const blindedWork = await createWork(author.id, 'blinded work', { blinded: true });
    await createChapter(blindedWork, 0, { published: true });
    const deletedWork = await createWork(author.id, 'deleted work', { deleted: true });
    await createChapter(deletedWork, 0, { published: true });

    // Non-owner and anon receive null without error for unpublished, blinded, deleted, missing, or null work.
    for (const target of [unpublishedWork, blindedWork, deletedWork, uuid(), null]) {
      expect(await rpcOk(anonClient().rpc('work_reading_metrics', { p_work_id: target }))).toBeNull();
      expect(await rpcOk(otherAuthorDb.rpc('work_reading_metrics', { p_work_id: target }))).toBeNull();
    }

    // Owner querying their own unpublished work gets zeroed summary and empty chapter array.
    expect(await rpcOk(authorDb.rpc('work_reading_metrics', { p_work_id: unpublishedWork }))).toEqual({
      workId: unpublishedWork,
      reachedReaders: 0,
      completionRate: null,
      retentionRate: null,
      sampleSufficient: false,
    });
    expect(await rpcOk(authorDb.rpc('work_chapter_metrics', { p_work_id: unpublishedWork }))).toEqual([]);

    // Detail RPC rejects anon, other authors, readers, deleted works, missing works, and null input.
    expect(await errorOf(anonClient().rpc('work_chapter_metrics', { p_work_id: unpublishedWork }))).toMatch(
      /permission denied|authentication_required/
    );
    expect(await errorOf(otherAuthorDb.rpc('work_chapter_metrics', { p_work_id: unpublishedWork }))).toMatch(
      /forbidden/
    );
    expect(await errorOf(readerDb.rpc('work_chapter_metrics', { p_work_id: unpublishedWork }))).toMatch(
      /forbidden/
    );
    expect(await errorOf(authorDb.rpc('work_chapter_metrics', { p_work_id: deletedWork }))).toMatch(
      /work_not_found/
    );
    expect(await errorOf(authorDb.rpc('work_chapter_metrics', { p_work_id: uuid() }))).toMatch(
      /work_not_found/
    );
    expect(await errorOf(authorDb.rpc('work_chapter_metrics', { p_work_id: null }))).toMatch(
      /invalid_input/
    );
  });

  it('registers the completed-reader partial index for completion/retention lookups', async () => {
    const planRows = await sql`
      explain (format json)
      select user_id
      from chapter_reading_state
      where chapter_id = ${uuid()} and completed_at is not null
    `;
    expect(planRows).toHaveLength(1);
  });
});

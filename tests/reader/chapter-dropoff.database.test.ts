import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonClient,
  createTestUser,
  deleteTestUserStrict,
  pgPool,
  signedInClient,
} from '../helpers/db';
import {
  DROPOFF_BUCKET_COUNT,
  isValidChapterDropoff,
  type ChapterDropoffDto,
} from '../../lib/reader/reading-metrics';

/**
 * Real-DB regression suite for 0055_chapter_dropoff.sql (26-03, RDATA-04).
 *
 * RESERVED FOR MANUAL DB GATE: 0024, 0025, 0052, 0053, 0054, and 0055 must be applied to the
 * target disposable test project first. Run explicitly with:
 *
 *   CHAPTER_DROPOFF_DB_TEST=1 npx vitest run tests/reader/chapter-dropoff.database.test.ts
 *
 * Without the flag the suite is reported as a visible `todo`. With the flag, a missing env or
 * unapplied migration FAILS in beforeAll.
 */

const OPT_IN = process.env.CHAPTER_DROPOFF_DB_TEST === '1';

type TestUser = { id: string; email?: string };

if (!OPT_IN) {
  describe('chapter dropoff (real DB, 0055)', () => {
    it.todo(
      'reserved for manual DB gate: apply 0024 + 0025 + 0052 + 0053 + 0054 + 0055, then run with CHAPTER_DROPOFF_DB_TEST=1'
    );
  });
}

describe.runIf(OPT_IN)('chapter dropoff (real DB, 0055)', () => {
  const sql = pgPool(2);
  const users: TestUser[] = [];
  const workIds: string[] = [];

  let author: TestUser;
  let otherAuthor: TestUser;
  let readers: TestUser[]; // 7 verified readers
  let unverifiedReader: TestUser;
  let deletedReader: TestUser;

  let authorDb: SupabaseClient;
  let otherAuthorDb: SupabaseClient;
  let readerDb: SupabaseClient;

  const uuid = () => crypto.randomUUID();

  async function createWork(ownerId: string, title: string, opts: { deleted?: boolean; blinded?: boolean } = {}) {
    const id = uuid();
    await sql`
      insert into works (id, owner_id, title, deleted_at, admin_blinded)
      values (${id}, ${ownerId}, ${title}, ${opts.deleted ? sql`now()` : null}, ${opts.blinded ?? false})
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
      insert into chapters (id, work_id, title, content, order_index, is_published, deleted_at, admin_blinded)
      values (
        ${id},
        ${workId},
        ${'회차 ' + orderIndex},
        ${opts.content ?? '본문 테스트'},
        ${orderIndex},
        ${opts.published ?? true},
        ${opts.deleted ? sql`now()` : null},
        ${opts.blinded ?? false}
      )
    `;
    return id;
  }

  async function putReadingState(
    userId: string,
    workId: string,
    chapterId: string,
    opts: {
      maxScrollRatio: number;
      scrollRatio?: number;
      completed?: boolean;
    }
  ) {
    const maxRatio = opts.maxScrollRatio;
    const ratio = opts.scrollRatio ?? maxRatio;
    const completed = opts.completed ?? false;
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
        now(),
        now(),
        ${ratio},
        ${maxRatio},
        ${completed ? 130_000 : 10_000},
        ${completed ? 130_000 : 10_000},
        1,
        ${completed ? 1500 : 0},
        ${completed ? sql`now()` : null}
      )
      on conflict (user_id, chapter_id) do update set
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
    if (missing.length) throw new Error(`CHAPTER_DROPOFF_DB_TEST=1 but missing env: ${missing.join(', ')}`);

    const [{ applied }] = await sql`
      select to_regprocedure('public.chapter_dropoff(uuid)') is not null
        and to_regprocedure('public.work_reading_metrics(uuid)') is not null
        and to_regprocedure('public.work_chapter_metrics(uuid)') is not null
        and to_regprocedure('public.reading_completion_config()') is not null as applied
    `;
    if (!applied) throw new Error('0024/0025/0052/0053/0054/0055 are not applied to this database');

    const created = await Promise.all(Array.from({ length: 11 }, () => createTestUser()));
    users.push(...created);
    [author, otherAuthor, unverifiedReader, deletedReader, ...readers] = created;

    const verifiedIds = [author.id, otherAuthor.id, deletedReader.id, ...readers.map((r) => r.id)];
    await sql`update auth.users set phone_confirmed_at = now() where id = any(${verifiedIds}::uuid[])`;
    await sql`update profiles set role = 'writer', pen_name = ${'CD1_' + author.id.slice(0, 6)} where id = ${author.id}`;
    await sql`update profiles set role = 'writer', pen_name = ${'CD2_' + otherAuthor.id.slice(0, 6)} where id = ${otherAuthor.id}`;
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

  it('places 0, 0.0499, 0.05, 0.95, and 1.0 into buckets 0, 0, 1, 19, and 19, excludes completed readers from buckets, and keeps sum(buckets) === reached - completed', async () => {
    const workId = await createWork(author.id, 'dropoff boundary fixture');
    const chapterId = await createChapter(workId, 0);

    // 5 incomplete valid readers at exact boundaries:
    await putReadingState(readers[0].id, workId, chapterId, { maxScrollRatio: 0, completed: false });
    await putReadingState(readers[1].id, workId, chapterId, { maxScrollRatio: 0.0499, completed: false });
    await putReadingState(readers[2].id, workId, chapterId, { maxScrollRatio: 0.05, completed: false });
    await putReadingState(readers[3].id, workId, chapterId, { maxScrollRatio: 0.95, completed: false });
    await putReadingState(readers[4].id, workId, chapterId, { maxScrollRatio: 1.0, completed: false });

    // 2 completed valid readers:
    await putReadingState(readers[5].id, workId, chapterId, { maxScrollRatio: 0.98, completed: true });
    await putReadingState(readers[6].id, workId, chapterId, { maxScrollRatio: 1.0, completed: true });

    // Ineligible accounts (author, unverified, deleted profile):
    await putReadingState(author.id, workId, chapterId, { maxScrollRatio: 0.2, completed: false });
    await putReadingState(unverifiedReader.id, workId, chapterId, { maxScrollRatio: 0.3, completed: false });
    await putReadingState(deletedReader.id, workId, chapterId, { maxScrollRatio: 0.4, completed: false });

    const dropoff = await rpcOk<ChapterDropoffDto>(
      authorDb.rpc('chapter_dropoff', { p_chapter_id: chapterId })
    );

    expect(isValidChapterDropoff(dropoff)).toBe(true);
    expect(dropoff.chapterId).toBe(chapterId);
    expect(dropoff.bucketCount).toBe(DROPOFF_BUCKET_COUNT);
    expect(dropoff.buckets).toHaveLength(20);
    expect(dropoff.reached).toBe(7);
    expect(dropoff.completed).toBe(2);

    const expectedBuckets = Array.from({ length: 20 }, () => 0);
    expectedBuckets[0] = 2; // 0 and 0.0499
    expectedBuckets[1] = 1; // 0.05
    expectedBuckets[19] = 2; // 0.95 and 1.0
    expect(dropoff.buckets).toEqual(expectedBuckets);
    expect(dropoff.buckets.reduce((sum, n) => sum + n, 0)).toBe(dropoff.reached - dropoff.completed);
  });

  it('returns 20 zeros and reached = completed = 0 for a live chapter with zero reached readers', async () => {
    const workId = await createWork(author.id, 'zero reach dropoff fixture');
    const emptyChapterId = await createChapter(workId, 0);

    const dropoff = await rpcOk<ChapterDropoffDto>(
      authorDb.rpc('chapter_dropoff', { p_chapter_id: emptyChapterId })
    );

    expect(dropoff).toEqual({
      chapterId: emptyChapterId,
      bucketCount: 20,
      buckets: Array.from({ length: 20 }, () => 0),
      reached: 0,
      completed: 0,
    });
  });

  it('rejects non-live chapters (unpublished, deleted, blinded, or parent work blinded/deleted) and non-owner/anonymous callers', async () => {
    const liveWork = await createWork(author.id, 'access & live-chapter dropoff fixture');
    const liveChapter = await createChapter(liveWork, 0, { published: true });
    const draftChapter = await createChapter(liveWork, 1, { published: false });
    const deletedChapter = await createChapter(liveWork, 2, { published: true, deleted: true });
    const blindedChapter = await createChapter(liveWork, 3, { published: true, blinded: true });

    const blindedWork = await createWork(author.id, 'blinded work', { blinded: true });
    const chapterInBlindedWork = await createChapter(blindedWork, 0, { published: true });

    const deletedWork = await createWork(author.id, 'deleted work', { deleted: true });
    const chapterInDeletedWork = await createChapter(deletedWork, 0, { published: true });

    // Seed historical reading state rows on non-live chapters as if they had been read before unpublishing/deletion/blinding.
    for (const chId of [draftChapter, deletedChapter, blindedChapter]) {
      await putReadingState(readers[0].id, liveWork, chId, { maxScrollRatio: 0.5, completed: false });
    }

    // Anonymous, other author, and reader callers are rejected on live chapters.
    expect(await errorOf(anonClient().rpc('chapter_dropoff', { p_chapter_id: liveChapter }))).toMatch(
      /permission denied|authentication_required/
    );
    expect(await errorOf(otherAuthorDb.rpc('chapter_dropoff', { p_chapter_id: liveChapter }))).toMatch(
      /forbidden/
    );
    expect(await errorOf(readerDb.rpc('chapter_dropoff', { p_chapter_id: liveChapter }))).toMatch(
      /forbidden/
    );
    // Non-owner calling a draft chapter of another author's work also gets forbidden before live state is inspected.
    expect(await errorOf(otherAuthorDb.rpc('chapter_dropoff', { p_chapter_id: draftChapter }))).toMatch(
      /forbidden/
    );

    // Owner calling non-live chapters (or missing/null chapter) receives no detail numbers.
    for (const nonLive of [
      draftChapter,
      deletedChapter,
      blindedChapter,
      chapterInBlindedWork,
      chapterInDeletedWork,
      uuid(),
    ]) {
      expect(await errorOf(authorDb.rpc('chapter_dropoff', { p_chapter_id: nonLive }))).toMatch(
        /chapter_not_found/
      );
    }
    expect(await errorOf(authorDb.rpc('chapter_dropoff', { p_chapter_id: null }))).toMatch(
      /invalid_input/
    );
  });
});

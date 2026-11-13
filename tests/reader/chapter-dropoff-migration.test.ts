import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  DROPOFF_BUCKET_COUNT,
  dropoffBucketIndex,
  isValidChapterDropoff,
  type ChapterDropoff,
  type DropoffBuckets,
} from '../../lib/reader/reading-metrics';

// Static (no DB connection) contract checks for 0055_chapter_dropoff.sql (26-03, RDATA-04).
// Real PostgreSQL behaviour lives in tests/reader/chapter-dropoff.database.test.ts (manual gate only).

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8').replaceAll('\r', '');
/** SQL without `--` comments, so contract checks are not satisfied by prose. */
const code = (sql: string) => sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

const MIGRATION_0055 = 'supabase/migrations/0055_chapter_dropoff.sql';
const sql = code(read(MIGRATION_0055));

function fnBody(name: string, source = sql): string {
  const match = source.match(new RegExp(`create or replace function ${name}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`));
  if (!match) throw new Error(`function ${name} not found`);
  return match[1];
}
function fnHeader(name: string, source = sql): string {
  const match = source.match(new RegExp(`create or replace function ${name}\\(([\\s\\S]*?)\\$\\$`));
  if (!match) throw new Error(`function ${name} not found`);
  return match[1];
}

// ---------------------------------------------------------------------------
// Pure reference implementation mirroring 0055 SQL semantics for fixture proofs
// (D-03, D-05, D-06, D-08, D-10)
// ---------------------------------------------------------------------------
type FixtureWork = {
  id: string;
  ownerId: string;
  deletedAt: string | null;
  adminBlinded?: boolean;
};
type FixtureChapter = {
  id: string;
  workId: string;
  isPublished: boolean;
  deletedAt: string | null;
  adminBlinded?: boolean;
};
type FixtureReader = {
  id: string;
  verified: boolean;
  deletedAt: string | null;
};
type FixtureState = {
  userId: string;
  chapterId: string;
  workId: string;
  maxScrollRatio: number;
  completedAt: number | null;
};

function evaluateChapterDropoffFixture(input: {
  chapterId: string | null;
  callerId: string | null;
  callerDeletedAt?: string | null;
  works: FixtureWork[];
  chapters: FixtureChapter[];
  readers: FixtureReader[];
  states: FixtureState[];
}): ChapterDropoff {
  if (!input.callerId) {
    throw new Error('authentication_required');
  }
  if (!input.chapterId) {
    throw new Error('invalid_input');
  }
  if (input.callerDeletedAt) {
    throw new Error('authentication_required');
  }

  const chapter = input.chapters.find((c) => c.id === input.chapterId);
  const work = chapter ? input.works.find((w) => w.id === chapter.workId && w.deletedAt === null) : undefined;
  if (!chapter || !work) {
    throw new Error('chapter_not_found');
  }

  // Threat model / D-10: compare caller against works.owner_id BEFORE checking live status or reading state.
  if (input.callerId !== work.ownerId) {
    throw new Error('forbidden');
  }

  const isLive =
    !work.adminBlinded &&
    chapter.isPublished &&
    chapter.deletedAt === null &&
    !chapter.adminBlinded;
  if (!isLive) {
    throw new Error('chapter_not_found');
  }

  // D-06: exclude work owner, unverified accounts, and deleted profiles.
  const validReaderIds = new Set(
    input.readers
      .filter((r) => r.deletedAt === null && r.verified && r.id !== work.ownerId)
      .map((r) => r.id)
  );

  const validStates = input.states.filter(
    (s) =>
      s.chapterId === chapter.id &&
      s.workId === work.id &&
      validReaderIds.has(s.userId)
  );

  const buckets = Array.from({ length: DROPOFF_BUCKET_COUNT }, () => 0) as DropoffBuckets;
  let completed = 0;

  for (const row of validStates) {
    if (row.completedAt !== null) {
      completed += 1;
    } else {
      const idx = dropoffBucketIndex(row.maxScrollRatio);
      buckets[idx] += 1;
    }
  }

  return {
    chapterId: chapter.id,
    bucketCount: DROPOFF_BUCKET_COUNT,
    buckets,
    reached: validStates.length,
    completed,
  };
}

describe('0055 file placement and D-05 real-time scope', () => {
  it('uses only the 0055 migration number, one transaction, and schema reload', () => {
    const files = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.startsWith('0055_'));
    expect(files).toEqual(['0055_chapter_dropoff.sql']);
    expect(sql.trimStart().startsWith('begin;')).toBe(true);
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*commit;\s*$/);
  });

  it('creates no summary table, materialized view, view, or cron job (D-05 real-time RPC only)', () => {
    expect(sql).not.toMatch(/create table|alter table|create policy|drop policy|create (materialized )?view|cron\./i);
  });

  it('does not replace existing reading/completion/metrics/popularity functions', () => {
    for (const existing of [
      'open_chapter_reading',
      'save_chapter_reading',
      'complete_chapter',
      'reading_completion_config',
      'chapter_minimum_reading_ms',
      'assert_chapter_reading_access',
      'chapter_reading_snapshot',
      'user_is_verified',
      'work_reading_metrics',
      'work_chapter_metrics',
      'world_tree_work_metrics',
      'increment_chapter_view',
    ]) {
      expect(sql).not.toMatch(new RegExp(`create (or replace )?function (public\\.)?${existing}\\(`));
      expect(sql).not.toMatch(new RegExp(`drop function[^;]*\\b${existing}\\b`));
    }
  });

  it('never grants direct table writes or char_count', () => {
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapter_reading_state/i);
    expect(sql).not.toMatch(/grant[^;]*char_count/i);
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapters\b/i);
  });
});

describe('chapter_dropoff(p_chapter_id uuid) owner-only RPC contract', () => {
  const header = fnHeader('chapter_dropoff');
  const body = fnBody('chapter_dropoff');

  it('has signature (p_chapter_id uuid) -> jsonb, STABLE SECURITY DEFINER, fixed search_path = public', () => {
    expect(header).toMatch(
      /^p_chapter_id uuid\)\s+returns jsonb\s+language plpgsql stable security definer set search_path = public as/
    );
  });

  it('revokes all from public/anon/authenticated/service_role and grants execute to authenticated only', () => {
    expect(sql).toMatch(
      /revoke all on function chapter_dropoff\(uuid\)\s+from public, anon, authenticated, service_role;/
    );
    expect(sql).toMatch(
      /grant execute on function chapter_dropoff\(uuid\)\s+to authenticated;/
    );
    const grants = [...sql.matchAll(/grant execute on function ([^;]*);/g)].map((g) =>
      g[1].trim().replace(/\s+/g, ' ')
    );
    expect(grants).toEqual(['chapter_dropoff(uuid) to authenticated']);
  });

  it('checks auth.uid(), live profile, chapter/work lookup, auth.uid() = works.owner_id, and live chapter state before accessing chapter_reading_state', () => {
    const order = [
      /if v_uid is null then\s+raise exception 'authentication_required';/,
      /if p_chapter_id is null then\s+raise exception 'invalid_input';/,
      /from profiles p where p\.id = v_uid and p\.deleted_at is null/,
      /from chapters c\s+join works w on w\.id = c\.work_id\s+where c\.id = p_chapter_id\s+and w\.deleted_at is null;/,
      /if not found then\s+raise exception 'chapter_not_found';/,
      /if not \(auth\.uid\(\) = v_owner_id\) then\s+raise exception 'forbidden' using errcode = '42501';/,
      /if not v_is_live then\s+raise exception 'chapter_not_found';/,
      /from chapter_reading_state s/,
    ].map((re) => body.search(re));
    expect(order.every((i) => i >= 0), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('applies D-06 valid reader filter and live chapter filter in valid_state and reuses it for reached, completed, and buckets', () => {
    expect(body).toMatch(
      /where s\.chapter_id = p_chapter_id\s+and s\.work_id = v_work_id\s+and c\.is_published = true\s+and c\.deleted_at is null\s+and not coalesce\(c\.admin_blinded, false\)\s+and p\.deleted_at is null\s+and s\.user_id <> v_owner_id\s+and public\.user_is_verified\(s\.user_id\)/
    );
    expect(body).toMatch(/\(select count\(\*\)::integer from valid_state\)/);
    expect(body).toMatch(/\(select count\(\*\) filter \(where completed_at is not null\)::integer from valid_state\)/);
    expect(body).toMatch(/from valid_state vs\s+where vs\.completed_at is null/);
  });

  it('computes 20 buckets (0..19) via floor(least(max_scroll_ratio, 1) * 20) clamped to 19 and generate_series(0, 19)', () => {
    expect(body).toMatch(
      /least\(\s*19,\s*greatest\(\s*0,\s*floor\(least\(vs\.max_scroll_ratio, 1\) \* 20\)::integer\s*\)\s*\) as bucket_idx/
    );
    expect(body).toMatch(
      /from generate_series\(0, 19\) as g\(bucket_idx\)\s+left join incomplete_buckets ib on ib\.bucket_idx = g\.bucket_idx/
    );
    expect(body).toMatch(/jsonb_agg\(bs\.cnt order by bs\.bucket_idx\)/);
  });

  it('returns the fixed camelCase DTO keys: chapterId, bucketCount: 20, buckets, reached, completed', () => {
    expect(body).toMatch(
      /jsonb_build_object\(\s*'chapterId', p_chapter_id,\s*'bucketCount', 20,\s*'buckets', v_buckets,\s*'reached', v_reached,\s*'completed', v_completed\s*\)/
    );
  });
});

describe('D-03 / D-06 / D-08 / D-10 dropoff boundary & security fixtures', () => {
  const baseWorks: FixtureWork[] = [
    { id: 'work-1', ownerId: 'owner-1', deletedAt: null },
  ];
  const baseChapters: FixtureChapter[] = [
    { id: 'ch-live', workId: 'work-1', isPublished: true, deletedAt: null },
    { id: 'ch-empty', workId: 'work-1', isPublished: true, deletedAt: null },
    { id: 'ch-draft', workId: 'work-1', isPublished: false, deletedAt: null },
    { id: 'ch-deleted', workId: 'work-1', isPublished: true, deletedAt: '2026-11-13T00:00:00Z' },
    { id: 'ch-blinded', workId: 'work-1', isPublished: true, deletedAt: null, adminBlinded: true },
  ];
  const verifiedReaders: FixtureReader[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
    id: `reader-${n}`,
    verified: true,
    deletedAt: null,
  }));

  it('maps 0, 0.0499, 0.05, 0.95, and 1.0 to buckets 0, 0, 1, 19, and 19, and keeps sum(buckets) === reached - completed', () => {
    expect(dropoffBucketIndex(0)).toBe(0);
    expect(dropoffBucketIndex(0.0499)).toBe(0);
    expect(dropoffBucketIndex(0.05)).toBe(1);
    expect(dropoffBucketIndex(0.95)).toBe(19);
    expect(dropoffBucketIndex(1.0)).toBe(19);

    const states: FixtureState[] = [
      // Incomplete valid readers at exact boundaries:
      { userId: 'reader-1', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0, completedAt: null },
      { userId: 'reader-2', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.0499, completedAt: null },
      { userId: 'reader-3', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.05, completedAt: null },
      { userId: 'reader-4', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.95, completedAt: null },
      { userId: 'reader-5', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 1.0, completedAt: null },
      // Completed valid readers (must NOT appear in any dropoff bucket):
      { userId: 'reader-6', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.98, completedAt: 100 },
      { userId: 'reader-7', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 1.0, completedAt: 120 },
    ];

    const res = evaluateChapterDropoffFixture({
      chapterId: 'ch-live',
      callerId: 'owner-1',
      works: baseWorks,
      chapters: baseChapters,
      readers: verifiedReaders,
      states,
    });

    expect(isValidChapterDropoff(res)).toBe(true);
    expect(res.bucketCount).toBe(20);
    expect(res.buckets).toHaveLength(20);
    expect(res.reached).toBe(7);
    expect(res.completed).toBe(2);
    expect(res.buckets[0]).toBe(2); // 0 and 0.0499
    expect(res.buckets[1]).toBe(1); // 0.05
    expect(res.buckets[19]).toBe(2); // 0.95 and 1.0 (incomplete)
    expect(res.buckets.reduce((acc, n) => acc + n, 0)).toBe(res.reached - res.completed);
  });

  it('excludes completed readers, work owner, unverified accounts, and deleted profiles from dropoff buckets', () => {
    const readers: FixtureReader[] = [
      ...verifiedReaders.slice(0, 2),
      { id: 'owner-1', verified: true, deletedAt: null },
      { id: 'unverified-reader', verified: false, deletedAt: null },
      { id: 'deleted-reader', verified: true, deletedAt: '2026-11-13T00:00:00Z' },
    ];
    const states: FixtureState[] = [
      // 1 incomplete valid reader at 0.25 (bucket 5) and 1 completed valid reader
      { userId: 'reader-1', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.25, completedAt: null },
      { userId: 'reader-2', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 1.0, completedAt: 50 },
      // Ineligible rows (owner, unverified, deleted profile) with completedAt = null:
      { userId: 'owner-1', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.1, completedAt: null },
      { userId: 'unverified-reader', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.4, completedAt: null },
      { userId: 'deleted-reader', chapterId: 'ch-live', workId: 'work-1', maxScrollRatio: 0.6, completedAt: null },
    ];

    const res = evaluateChapterDropoffFixture({
      chapterId: 'ch-live',
      callerId: 'owner-1',
      works: baseWorks,
      chapters: baseChapters,
      readers,
      states,
    });

    const expectedBuckets = Array.from({ length: 20 }, (_, i) => (i === 5 ? 1 : 0));
    expect(res).toEqual({
      chapterId: 'ch-live',
      bucketCount: 20,
      buckets: expectedBuckets,
      reached: 2,
      completed: 1,
    });
  });

  it('returns 20 zeros and reached = completed = 0 for a live chapter that no valid reader has reached', () => {
    const res = evaluateChapterDropoffFixture({
      chapterId: 'ch-empty',
      callerId: 'owner-1',
      works: baseWorks,
      chapters: baseChapters,
      readers: verifiedReaders,
      states: [],
    });

    expect(res).toEqual({
      chapterId: 'ch-empty',
      bucketCount: 20,
      buckets: Array.from({ length: 20 }, () => 0),
      reached: 0,
      completed: 0,
    });
  });

  it('rejects anonymous callers, other authors/readers, and non-live chapters (unpublished, deleted, or blinded)', () => {
    const historicalStates: FixtureState[] = [
      { userId: 'reader-1', chapterId: 'ch-draft', workId: 'work-1', maxScrollRatio: 0.3, completedAt: null },
      { userId: 'reader-1', chapterId: 'ch-deleted', workId: 'work-1', maxScrollRatio: 0.3, completedAt: null },
      { userId: 'reader-1', chapterId: 'ch-blinded', workId: 'work-1', maxScrollRatio: 0.3, completedAt: null },
    ];

    // Anonymous caller rejected
    expect(() =>
      evaluateChapterDropoffFixture({
        chapterId: 'ch-live',
        callerId: null,
        works: baseWorks,
        chapters: baseChapters,
        readers: verifiedReaders,
        states: historicalStates,
      })
    ).toThrow('authentication_required');

    // Other author or reader rejected with forbidden
    for (const nonOwner of ['other-author', 'reader-1']) {
      expect(() =>
        evaluateChapterDropoffFixture({
          chapterId: 'ch-live',
          callerId: nonOwner,
          works: baseWorks,
          chapters: baseChapters,
          readers: verifiedReaders,
          states: historicalStates,
        })
      ).toThrow('forbidden');
    }

    // Non-live chapters (draft, deleted, blinded) never return detail numbers even to the owner
    for (const nonLiveId of ['ch-draft', 'ch-deleted', 'ch-blinded']) {
      expect(() =>
        evaluateChapterDropoffFixture({
          chapterId: nonLiveId,
          callerId: 'owner-1',
          works: baseWorks,
          chapters: baseChapters,
          readers: verifiedReaders,
          states: historicalStates,
        })
      ).toThrow('chapter_not_found');
    }
  });
});

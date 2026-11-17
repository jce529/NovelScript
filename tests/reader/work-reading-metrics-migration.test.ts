import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { MIN_SAMPLE_READERS } from '../../lib/reader/completion';

// Static (no DB connection) contract checks for 0054_work_reading_metrics.sql (26-02, RDATA-03).
// Real PostgreSQL behaviour lives in tests/reader/work-reading-metrics.database.test.ts (manual gate only).

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8').replaceAll('\r', '');
/** SQL without `--` comments, so contract checks are not satisfied by prose. */
const code = (sql: string) => sql.split('\n').map((line) => line.replace(/--.*$/, '')).join('\n');

const MIGRATION_0053 = 'supabase/migrations/0053_reader_completion_config.sql';
const MIGRATION_0054 = 'supabase/migrations/0054_work_reading_metrics.sql';
const sql0053 = code(read(MIGRATION_0053));
const sql = code(read(MIGRATION_0054));

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
// Pure reference implementation mirroring 0054 SQL CTE semantics for fixture proofs
// (D-04, D-06, D-07, D-09, D-10)
// ---------------------------------------------------------------------------
type FixtureChapter = {
  id: string;
  orderIndex: number;
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
  openedAt: number;
  completedAt: number | null;
};

function evaluateMetricsFixture(input: {
  workId: string;
  ownerId: string;
  workDeletedAt?: string | null;
  workAdminBlinded?: boolean;
  callerId?: string | null;
  callerDeletedAt?: string | null;
  minSampleReaders?: number;
  chapters: FixtureChapter[];
  readers: FixtureReader[];
  states: FixtureState[];
}) {
  const minSample = input.minSampleReaders ?? MIN_SAMPLE_READERS;
  if (!input.workId || input.workDeletedAt || input.workAdminBlinded) {
    return { summary: null, chapters: null as null | unknown[] };
  }

  // Order all chapters by (order_index, id) first, then determine live status and immediate successor.
  const ordered = [...input.chapters].sort((a, b) =>
    a.orderIndex !== b.orderIndex ? a.orderIndex - b.orderIndex : a.id.localeCompare(b.id)
  );
  const withLead = ordered.map((ch, idx) => {
    const isLive = ch.isPublished && ch.deletedAt === null && !ch.adminBlinded;
    const next = ordered[idx + 1];
    const nextIsLive = Boolean(next && next.isPublished && next.deletedAt === null && !next.adminBlinded);
    return {
      chapterId: ch.id,
      orderIndex: ch.orderIndex,
      isLive,
      validNextChapterId: isLive && nextIsLive ? next!.id : null,
    };
  });

  const liveChapters = withLead.filter((ch) => ch.isLive);
  const hasLiveChapter = liveChapters.length > 0;
  const callerIsLiveOwner =
    Boolean(input.callerId) && input.callerId === input.ownerId && !input.callerDeletedAt;

  if (!hasLiveChapter && !callerIsLiveOwner) {
    return { summary: null, chapters: null as null | unknown[] };
  }

  // D-06 valid readers: non-deleted profile, verified, not work owner.
  const validReaderIds = new Set(
    input.readers
      .filter((r) => r.deletedAt === null && r.verified && r.id !== input.ownerId)
      .map((r) => r.id)
  );
  const liveChapterIds = new Set(liveChapters.map((c) => c.chapterId));
  const validStates = input.states.filter(
    (s) => validReaderIds.has(s.userId) && liveChapterIds.has(s.chapterId)
  );

  const chapterMetrics = liveChapters.map((lc) => {
    const rows = validStates.filter((s) => s.chapterId === lc.chapterId);
    const completedRows = rows.filter((s) => s.completedAt !== null);
    const reached = rows.length;
    const completed = completedRows.length;
    let nextOpened = 0;
    if (lc.validNextChapterId !== null) {
      const nextUsers = new Set(
        validStates.filter((s) => s.chapterId === lc.validNextChapterId).map((s) => s.userId)
      );
      // D-04: intersection of N completers and N+1 openers regardless of openedAt/completedAt order.
      nextOpened = completedRows.filter((s) => nextUsers.has(s.userId)).length;
    }
    return {
      chapterId: lc.chapterId,
      orderIndex: lc.orderIndex,
      reached,
      completed,
      completionRate: reached > 0 ? completed / reached : null,
      nextOpened,
      retentionRate: lc.validNextChapterId !== null && completed > 0 ? nextOpened / completed : null,
      _validNextChapterId: lc.validNextChapterId,
    };
  });

  const reachedReaders = new Set(validStates.map((s) => s.userId)).size;
  const totalReached = chapterMetrics.reduce((acc, c) => acc + c.reached, 0);
  const totalCompleted = chapterMetrics.reduce((acc, c) => acc + c.completed, 0);
  const pairCompleted = chapterMetrics
    .filter((c) => c._validNextChapterId !== null)
    .reduce((acc, c) => acc + c.completed, 0);
  const pairNextOpened = chapterMetrics
    .filter((c) => c._validNextChapterId !== null)
    .reduce((acc, c) => acc + c.nextOpened, 0);

  const sampleSufficient = reachedReaders >= minSample;

  return {
    summary: {
      workId: input.workId,
      reachedReaders,
      completionRate: sampleSufficient && totalReached > 0 ? totalCompleted / totalReached : null,
      retentionRate: sampleSufficient && pairCompleted > 0 ? pairNextOpened / pairCompleted : null,
      sampleSufficient,
    },
    chapters: callerIsLiveOwner
      ? chapterMetrics.map((row) => {
          const rest: Record<string, unknown> = { ...row };
          delete rest._validNextChapterId;
          return rest;
        })
      : null,
  };
}

describe('0054 file placement and D-05 real-time scope', () => {
  it('uses only the 0054 migration number, one transaction, and schema reload', () => {
    const files = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.startsWith('0054_'));
    expect(files).toEqual(['0054_work_reading_metrics.sql']);
    expect(sql.trimStart().startsWith('begin;')).toBe(true);
    expect(sql).toMatch(/notify pgrst, 'reload schema';\s*commit;\s*$/);
  });

  it('creates no summary table, materialized view, view, or cron job (D-05 real-time RPC only)', () => {
    expect(sql).not.toMatch(/create table|alter table|create policy|drop policy|create (materialized )?view|cron\./i);
    // chapter_dropoff belongs to 26-03 (0055).
    expect(sql).not.toMatch(/chapter_dropoff/i);
  });

  it('does not replace existing reading/completion/visibility functions or popularity score', () => {
    for (const existing of [
      'open_chapter_reading',
      'save_chapter_reading',
      'complete_chapter',
      'reading_completion_config',
      'chapter_minimum_reading_ms',
      'assert_chapter_reading_access',
      'chapter_reading_snapshot',
      'user_is_verified',
      'world_tree_work_metrics',
      'increment_chapter_view',
    ]) {
      expect(sql).not.toMatch(new RegExp(`create (or replace )?function (public\\.)?${existing}\\(`));
      expect(sql).not.toMatch(new RegExp(`drop function[^;]*\\b${existing}\\b`));
    }
  });

  it('adds the completed-reader partial index candidate on chapter_reading_state', () => {
    expect(sql).toMatch(
      /create index if not exists chapter_reading_state_completed_chapter_idx\s+on chapter_reading_state \(chapter_id, user_id\)\s+where completed_at is not null;/
    );
  });

  it('never grants direct table writes or char_count', () => {
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapter_reading_state/i);
    expect(sql).not.toMatch(/grant[^;]*char_count/i);
    expect(sql).not.toMatch(/grant[^;]*on (table )?chapters\b/i);
  });
});

describe('work_reading_metrics(p_work_id uuid) public summary RPC contract', () => {
  const header = fnHeader('work_reading_metrics');
  const body = fnBody('work_reading_metrics');

  it('has signature (p_work_id uuid) -> jsonb, STABLE SECURITY DEFINER, fixed search_path = public', () => {
    expect(header).toMatch(
      /^p_work_id uuid\)\s+returns jsonb\s+language plpgsql stable security definer set search_path = public as/
    );
  });

  it('revokes all from public/anon/authenticated/service_role and grants execute to anon, authenticated', () => {
    expect(sql).toMatch(
      /revoke all on function work_reading_metrics\(uuid\)\s+from public, anon, authenticated, service_role;/
    );
    expect(sql).toMatch(
      /grant execute on function work_reading_metrics\(uuid\)\s+to anon, authenticated;/
    );
  });

  it('reads min_sample_readers from 0053 reading_completion_config() without hardcoding 5', () => {
    expect(sql0053).toMatch(/out min_sample_readers integer/);
    expect(body).toMatch(/select cfg\.min_sample_readers\s+into v_min_sample_readers\s+from reading_completion_config\(\) cfg;/);
    expect(body).toMatch(/v_sample_sufficient := v_reached_readers >= v_min_sample_readers;/);
    expect(body).not.toMatch(/>=\s*5\b|<\s*5\b/);
  });

  it('returns null without raising when work is null, missing, deleted, blinded, or unpublished for non-owners', () => {
    expect(body).toMatch(/if p_work_id is null then\s+return null;\s+end if;/);
    expect(body).toMatch(/if not found or v_deleted_at is not null or v_admin_blinded then\s+return null;\s+end if;/);
    expect(body).toMatch(/if not v_has_live_chapter then[\s\S]*?return null;\s+end if;\s+end if;/);
    expect(body).not.toMatch(/raise exception/);
  });

  it('returns only the fixed camelCase summary DTO keys and never exposes per-chapter arrays', () => {
    expect(body).toMatch(
      /jsonb_build_object\(\s*'workId', p_work_id,\s*'reachedReaders', v_reached_readers,\s*'completionRate',[\s\S]*?'retentionRate',[\s\S]*?'sampleSufficient', v_sample_sufficient\s*\)/
    );
    expect(body).not.toMatch(/'chapterId'|'orderIndex'|'nextOpened'|jsonb_agg/);
  });

  it('computes work completionRate as sum(completed)/sum(reached) and work retentionRate as sum(next_opened)/sum(completed) of valid adjacent pairs', () => {
    expect(body).toMatch(/coalesce\(\(select count\(distinct vs\.user_id\)::integer from valid_state vs\), 0\)/);
    expect(body).toMatch(/coalesce\(sum\(cc\.reached\), 0\)::bigint/);
    expect(body).toMatch(/coalesce\(sum\(cc\.completed\), 0\)::bigint/);
    expect(body).toMatch(/coalesce\(sum\(cc\.completed\) filter \(where cc\.valid_next_chapter_id is not null\), 0\)::bigint/);
    expect(body).toMatch(/coalesce\(sum\(cc\.next_opened\) filter \(where cc\.valid_next_chapter_id is not null\), 0\)::bigint/);
    expect(body).toMatch(/when v_sample_sufficient and v_total_reached > 0\s+then to_jsonb\(\(v_total_completed::numeric \/ v_total_reached::numeric\)::double precision\)\s+else 'null'::jsonb/);
    expect(body).toMatch(/when v_sample_sufficient and v_pair_completed > 0\s+then to_jsonb\(\(v_pair_next_opened::numeric \/ v_pair_completed::numeric\)::double precision\)\s+else 'null'::jsonb/);
  });
});

describe('work_chapter_metrics(p_work_id uuid) owner-only detail RPC contract', () => {
  const header = fnHeader('work_chapter_metrics');
  const body = fnBody('work_chapter_metrics');

  it('has signature (p_work_id uuid) -> jsonb, STABLE SECURITY DEFINER, fixed search_path = public', () => {
    expect(header).toMatch(
      /^p_work_id uuid\)\s+returns jsonb\s+language plpgsql stable security definer set search_path = public as/
    );
  });

  it('revokes all from public/anon/authenticated/service_role and grants execute to authenticated only', () => {
    expect(sql).toMatch(
      /revoke all on function work_chapter_metrics\(uuid\)\s+from public, anon, authenticated, service_role;/
    );
    expect(sql).toMatch(
      /grant execute on function work_chapter_metrics\(uuid\)\s+to authenticated;/
    );
    const grants = [...sql.matchAll(/grant execute on function ([^;]*);/g)].map((g) => g[1].trim().replace(/\s+/g, ' '));
    expect(grants).toEqual([
      'work_reading_metrics(uuid) to anon, authenticated',
      'work_chapter_metrics(uuid) to authenticated',
    ]);
  });

  it('checks auth.uid(), live profile, work existence, and auth.uid() = works.owner_id before accessing chapters or chapter_reading_state', () => {
    const order = [
      /if v_uid is null then\s+raise exception 'authentication_required';/,
      /if p_work_id is null then\s+raise exception 'invalid_input';/,
      /from profiles p where p\.id = v_uid and p\.deleted_at is null/,
      /select w\.owner_id\s+into v_owner_id\s+from works w\s+where w\.id = p_work_id\s+and w\.deleted_at is null;/,
      /if not \(auth\.uid\(\) = v_owner_id\) then\s+raise exception 'forbidden' using errcode = '42501';/,
      /from chapters c/,
      /from chapter_reading_state s/,
    ].map((re) => body.search(re));
    expect(order.every((i) => i >= 0), String(order)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('applies identical D-06 filter (deleted_at is null, user_id <> owner_id, user_is_verified) and D-09 non-skipping lead() pair rule in both RPCs', () => {
    for (const fn of ['work_reading_metrics', 'work_chapter_metrics']) {
      const b = fnBody(fn);
      // D-09: lead() is computed over all chapters of p_work_id ordered by order_index, id BEFORE filtering to is_live.
      expect(b).toMatch(
        /lead\(c\.id\) over \(order by c\.order_index, c\.id\) as next_chapter_id,\s*lead\(c\.is_published = true and c\.deleted_at is null and not coalesce\(c\.admin_blinded, false\)\)\s*over \(order by c\.order_index, c\.id\) as next_is_live\s*from chapters c\s*where c\.work_id = p_work_id/
      );
      expect(b).toMatch(
        /case when coalesce\(oc\.next_is_live, false\) then oc\.next_chapter_id else null end as valid_next_chapter_id\s+from ordered_chapters oc\s+where oc\.is_live/
      );
      // D-06: shared valid_state CTE used for reached, completed, and next_opened.
      expect(b).toMatch(
        /where s\.work_id = p_work_id\s+and p\.deleted_at is null\s+and s\.user_id <> v_owner_id\s+and public\.user_is_verified\(s\.user_id\)/
      );
      // D-04: next_opened joins valid_state cur (completed_at is not null) with valid_state nxt on user_id and valid_next_chapter_id, with no timestamp comparison.
      expect(b).toMatch(
        /from valid_state cur\s+join valid_state nxt\s+on nxt\.user_id = cur\.user_id\s+and nxt\.chapter_id = lc\.valid_next_chapter_id\s+where cur\.chapter_id = lc\.chapter_id\s+and cur\.completed_at is not null/
      );
      expect(b).not.toMatch(/opened_at\s*[<>]=?|last_seen_at\s*[<>]=?/);
    }
  });

  it('returns the fixed camelCase chapter DTO array and only nulls chapter rates when the denominator is 0 or no valid adjacent pair exists', () => {
    expect(body).toMatch(
      /jsonb_build_object\(\s*'chapterId', cc\.chapter_id,\s*'orderIndex', cc\.order_index,\s*'reached', cc\.reached,\s*'completed', cc\.completed,\s*'completionRate', case\s+when cc\.reached > 0\s+then to_jsonb\(\(cc\.completed::numeric \/ cc\.reached::numeric\)::double precision\)\s+else 'null'::jsonb\s+end,\s*'nextOpened', cc\.next_opened,\s*'retentionRate', case\s+when cc\.valid_next_chapter_id is not null and cc\.completed > 0\s+then to_jsonb\(\(cc\.next_opened::numeric \/ cc\.completed::numeric\)::double precision\)\s+else 'null'::jsonb\s+end\s*\)/
    );
    expect(body).not.toMatch(/v_min_sample_readers|sampleSufficient/);
  });
});

describe('D-04 / D-06 / D-07 / D-09 / D-10 aggregation formula fixtures', () => {
  const chapters: FixtureChapter[] = [
    { id: 'ch-1', orderIndex: 0, isPublished: true, deletedAt: null },
    { id: 'ch-2', orderIndex: 1, isPublished: true, deletedAt: null },
    { id: 'ch-3', orderIndex: 2, isPublished: true, deletedAt: null },
  ];
  const verifiedReaders: FixtureReader[] = [1, 2, 3, 4, 5].map((n) => ({
    id: `reader-${n}`,
    verified: true,
    deletedAt: null,
  }));

  it('proves work completionRate is sum(completed)/sum(reached) and work retentionRate is sum(nextOpened)/sum(pair completed), not simple averages', () => {
    // ch-1: 5 reached, 4 completed (r1..r4) -> chapter completionRate = 4/5 = 0.8
    // ch-2: 2 reached (r1, r2), 1 completed (r1) -> chapter completionRate = 1/2 = 0.5; ch-1 nextOpened = 2 -> ch-1 retentionRate = 2/4 = 0.5
    // ch-3: 1 reached (r1), 1 completed (r1) -> chapter completionRate = 1/1 = 1.0; ch-2 nextOpened = 1 -> ch-2 retentionRate = 1/1 = 1.0; ch-3 retentionRate = null
    // Simple average completionRate would be (0.8 + 0.5 + 1.0) / 3 = 0.7666..., weighted is (4 + 1 + 1) / (5 + 2 + 1) = 6 / 8 = 0.75.
    // Simple average retentionRate would be (0.5 + 1.0) / 2 = 0.75, weighted over valid pairs is (2 + 1) / (4 + 1) = 3 / 5 = 0.6.
    const states: FixtureState[] = [
      { userId: 'reader-1', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'reader-2', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'reader-3', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'reader-4', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'reader-5', chapterId: 'ch-1', openedAt: 10, completedAt: null },
      { userId: 'reader-1', chapterId: 'ch-2', openedAt: 30, completedAt: 40 },
      { userId: 'reader-2', chapterId: 'ch-2', openedAt: 30, completedAt: null },
      { userId: 'reader-1', chapterId: 'ch-3', openedAt: 50, completedAt: 60 },
    ];

    const res = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'owner-1',
      chapters,
      readers: verifiedReaders,
      states,
    });

    expect(res.summary).toEqual({
      workId: 'work-1',
      reachedReaders: 5,
      completionRate: 6 / 8,
      retentionRate: 3 / 5,
      sampleSufficient: true,
    });
    expect(res.summary!.completionRate).not.toBeCloseTo((0.8 + 0.5 + 1.0) / 3, 4);
    expect(res.summary!.retentionRate).not.toBeCloseTo((0.5 + 1.0) / 2, 4);
    expect(res.chapters).toEqual([
      {
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 5,
        completed: 4,
        completionRate: 0.8,
        nextOpened: 2,
        retentionRate: 0.5,
      },
      {
        chapterId: 'ch-2',
        orderIndex: 1,
        reached: 2,
        completed: 1,
        completionRate: 0.5,
        nextOpened: 1,
        retentionRate: 1.0,
      },
      {
        chapterId: 'ch-3',
        orderIndex: 2,
        reached: 1,
        completed: 1,
        completionRate: 1.0,
        nextOpened: 0,
        retentionRate: null,
      },
    ]);
  });

  it('hides summary rates when reachedReaders < 5 (sampleSufficient=false) while keeping chapter rates for the owner', () => {
    const fourStates: FixtureState[] = [1, 2, 3, 4].flatMap((n) => [
      { userId: `reader-${n}`, chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: `reader-${n}`, chapterId: 'ch-2', openedAt: 30, completedAt: 40 },
    ]);

    const res = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'owner-1',
      chapters,
      readers: verifiedReaders,
      states: fourStates,
    });

    expect(res.summary).toEqual({
      workId: 'work-1',
      reachedReaders: 4,
      completionRate: null,
      retentionRate: null,
      sampleSufficient: false,
    });
    expect(res.chapters?.[0]).toMatchObject({
      chapterId: 'ch-1',
      reached: 4,
      completed: 4,
      completionRate: 1,
      nextOpened: 4,
      retentionRate: 1,
    });
  });

  it('excludes owner, deleted profiles, and unverified accounts from both denominator and numerator (D-06)', () => {
    const readers: FixtureReader[] = [
      ...verifiedReaders.slice(0, 4),
      { id: 'owner-1', verified: true, deletedAt: null },
      { id: 'deleted-reader', verified: true, deletedAt: '2026-11-13T00:00:00Z' },
      { id: 'unverified-reader', verified: false, deletedAt: null },
    ];
    const states: FixtureState[] = [
      ...[1, 2, 3, 4].map((n) => ({
        userId: `reader-${n}`,
        chapterId: 'ch-1',
        openedAt: 10,
        completedAt: 20,
      })),
      // Ineligible accounts reaching and completing chapters must not push reachedReaders to 5 or pollute counts.
      { userId: 'owner-1', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'deleted-reader', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'unverified-reader', chapterId: 'ch-1', openedAt: 10, completedAt: null },
    ];

    const res = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'owner-1',
      chapters,
      readers,
      states,
    });

    expect(res.summary).toEqual({
      workId: 'work-1',
      reachedReaders: 4,
      completionRate: null,
      retentionRate: null,
      sampleSufficient: false,
    });
    expect(res.chapters?.[0]).toMatchObject({
      chapterId: 'ch-1',
      reached: 4,
      completed: 4,
      completionRate: 1,
    });
  });

  it('does not form a retention pair across an unpublished, deleted, or blinded chapter, and counts pre-opened N+1 as retained (D-04, D-09)', () => {
    const gappedChapters: FixtureChapter[] = [
      { id: 'ch-1', orderIndex: 0, isPublished: true, deletedAt: null },
      { id: 'ch-2', orderIndex: 1, isPublished: true, deletedAt: null },
      { id: 'ch-3-draft', orderIndex: 2, isPublished: false, deletedAt: null },
      { id: 'ch-4', orderIndex: 3, isPublished: true, deletedAt: null },
    ];
    // reader-1 opened ch-2 at t=5 BEFORE completing ch-1 at t=20 (pre-opened N+1).
    // ch-2 -> ch-4 is broken by ch-3-draft, so even though reader-1..5 opened ch-4 after completing ch-2, ch-2 has nextOpened=0 and retentionRate=null.
    const states: FixtureState[] = [
      { userId: 'reader-1', chapterId: 'ch-2', openedAt: 5, completedAt: 30 },
      { userId: 'reader-1', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'reader-2', chapterId: 'ch-1', openedAt: 10, completedAt: 20 },
      { userId: 'reader-3', chapterId: 'ch-1', openedAt: 10, completedAt: null },
      { userId: 'reader-4', chapterId: 'ch-1', openedAt: 10, completedAt: null },
      { userId: 'reader-5', chapterId: 'ch-1', openedAt: 10, completedAt: null },
      { userId: 'reader-1', chapterId: 'ch-4', openedAt: 40, completedAt: null },
    ];

    const res = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'owner-1',
      chapters: gappedChapters,
      readers: verifiedReaders,
      states,
    });

    expect(res.chapters).toEqual([
      {
        chapterId: 'ch-1',
        orderIndex: 0,
        reached: 5,
        completed: 2,
        completionRate: 0.4,
        nextOpened: 1,
        retentionRate: 0.5,
      },
      {
        chapterId: 'ch-2',
        orderIndex: 1,
        reached: 1,
        completed: 1,
        completionRate: 1.0,
        nextOpened: 0,
        retentionRate: null,
      },
      {
        chapterId: 'ch-4',
        orderIndex: 3,
        reached: 1,
        completed: 0,
        completionRate: 0,
        nextOpened: 0,
        retentionRate: null,
      },
    ]);
    // Only (ch-1 -> ch-2) is a valid adjacent pair, so work retentionRate is 1/2 = 0.5.
    expect(res.summary).toEqual({
      workId: 'work-1',
      reachedReaders: 5,
      completionRate: 3 / 7,
      retentionRate: 0.5,
      sampleSufficient: true,
    });
  });

  it('handles 0 live chapters, 0 denominator, and 0 valid adjacent pairs with null rates', () => {
    const unpublishedForReader = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'reader-1',
      chapters: [{ id: 'ch-draft', orderIndex: 0, isPublished: false, deletedAt: null }],
      readers: verifiedReaders,
      states: [],
    });
    expect(unpublishedForReader.summary).toBeNull();

    const unpublishedForOwner = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'owner-1',
      chapters: [{ id: 'ch-draft', orderIndex: 0, isPublished: false, deletedAt: null }],
      readers: verifiedReaders,
      states: [],
    });
    expect(unpublishedForOwner.summary).toEqual({
      workId: 'work-1',
      reachedReaders: 0,
      completionRate: null,
      retentionRate: null,
      sampleSufficient: false,
    });
    expect(unpublishedForOwner.chapters).toEqual([]);

    // Single live chapter with 5 reached readers and 5 completions -> completionRate = 1, retentionRate = null (0 valid pairs).
    const singleChapter = evaluateMetricsFixture({
      workId: 'work-1',
      ownerId: 'owner-1',
      callerId: 'owner-1',
      chapters: [{ id: 'ch-1', orderIndex: 0, isPublished: true, deletedAt: null }],
      readers: verifiedReaders,
      states: verifiedReaders.map((r) => ({
        userId: r.id,
        chapterId: 'ch-1',
        openedAt: 10,
        completedAt: 20,
      })),
    });
    expect(singleChapter.summary).toEqual({
      workId: 'work-1',
      reachedReaders: 5,
      completionRate: 1,
      retentionRate: null,
      sampleSufficient: true,
    });
  });
});

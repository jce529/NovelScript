---
phase: 03-reader-core-reading-loop-no-payment
plan: 02
subsystem: api
tags: [supabase, discovery-feed, trending-score, content-leak-guard, rls, vitest]

# Dependency graph
requires:
  - phase: 03-01
    provides: "works/chapters public-read RLS policies, view_count column, work_likes table"
provides:
  - "lib/discovery/actions.ts: listFeed (genre filter, latest/popular sort with 4 sort bases) + computeTrendingScores (0-100 composite score)"
  - "lib/format/korean-count.ts: formatKoreanCount compact-number formatter"
  - "lib/chapters/actions.ts: getPublicChapter + listPublicChapters (content-leak-safe public reads)"
  - "lib/works/actions.ts: getPublicWork (no-ownership-gate public read)"
affects: [03-05-feed-ui, 03-06-detail-ui, 03-07-viewer-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Public read functions (getPublicX) live alongside owner-scoped equivalents (getX) in the same lib file, never merged, to keep the ownership gate un-ambiguous at a glance"
    - "Content-leak defense: explicit column select + server-side null-out of `content` for locked rows, never select('*') on chapters in reader-facing code"
    - "Batch .in() queries over unbounded ID sets to avoid PostgREST/HTTP header overflow at scale"
    - "Defensive normalize(): filter non-finite inputs before Math.max, fall back per-row score to 0 on non-finite result, so one malformed/transient row can't NaN-poison every row's score"

key-files:
  created:
    - lib/discovery/actions.ts
    - lib/format/korean-count.ts
    - tests/discovery/feed.test.ts
    - tests/viewer/chapter-read.test.ts
    - tests/viewer/paid-lock.test.ts
  modified:
    - lib/chapters/actions.ts
    - lib/works/actions.ts

key-decisions:
  - "Batched work_likes .in() query (150 IDs/batch) instead of one unbounded IN clause — the live dev DB already has 460+ works and a single unbatched query hits the 16KB HTTP header limit and fails silently if the error is discarded"
  - "Hardened computeTrendingScores/normalize against non-finite inputs rather than trusting every row in a large, concurrently-mutated table to be well-formed"

patterns-established:
  - "Pattern: getPublicX functions (getPublicWork, getPublicChapter, listPublicChapters) are additive, never modify existing owner-scoped functions (getWork, listChapters)"
  - "Pattern: paid-chapter content-leak regression tests assert `'content' in row === false`, not just `row.content === undefined`, to catch an accidental select('*') regression"

requirements-completed: [READ-01, READ-02]

# Metrics
duration: 15min
completed: 2026-08-30
---

# Phase 3 Plan 2: Discovery Feed & Public Reader Guards Summary

**Discovery feed aggregation (`listFeed`, 4-basis sort, 0-100 trending score) and content-leak-safe public work/chapter readers (`getPublicWork`/`getPublicChapter`/`listPublicChapters`) that never ship a locked chapter's prose to the client.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-29T23:55:00Z
- **Completed:** 2026-08-30T00:09:39Z
- **Tasks:** 2 completed
- **Files modified:** 7 (2 created lib files + 1 created format file + 2 modified lib files + 3 test files created, some overlap in count above)

## Accomplishments

- `listFeed` excludes works with zero published chapters, filters by genre (reusing `GENRES` verbatim), and sorts by latest/trending/views/likes/CTR — proven by 10 integration tests plus 1 unit regression test against the live shared dev Supabase project
- `getPublicChapter`/`listPublicChapters` never leak a paid chapter's `content` even though the row itself is publicly readable once published (RLS is row-level, not column-level) — proven by an explicit `'content' in row === false` assertion, not just an `undefined` check
- `getPublicWork` added as a genuinely separate, non-ownership-gated function alongside the existing owner-scoped `getWork`
- Found and fixed two real correctness bugs in the plan's own provided reference code before they could reach Wave 3 UI plans (see Deviations)

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: Discovery feed lib — listFeed + trending score + korean-count formatter**
   - `af046d6` test(03-02): add failing test for discovery feed listFeed
   - `43b1a5b` feat(03-02): implement discovery feed listFeed + trending score + korean-count formatter
2. **Task 2: Public work/chapter readers — content-leak guard for paid chapters**
   - `7b015ab` test(03-02): add failing tests for public chapter/work readers and paid-lock guard
   - `63620b4` feat(03-02): implement getPublicChapter/listPublicChapters/getPublicWork content-leak guards

_Note: both tasks are TDD (test → feat), no refactor commit was needed._

## Files Created/Modified

- `lib/discovery/actions.ts` - `listFeed`, `computeTrendingScores`, `FeedWork`/`FeedSortMode`/`FeedSortBasis` types; batched like-count query; defensive normalize()
- `lib/format/korean-count.ts` - `formatKoreanCount` compact-number formatter (e.g. `12000` → `"1.2만"`)
- `lib/chapters/actions.ts` - added `getPublicChapter`, `listPublicChapters`, `PublicChapter`, `PublicChapterListItem` (all pre-existing exports untouched)
- `lib/works/actions.ts` - added `getPublicWork`, `PublicWork` (all pre-existing exports untouched)
- `tests/discovery/feed.test.ts` - 10 integration tests + 1 unit regression test for `computeTrendingScores`
- `tests/viewer/chapter-read.test.ts` - 6 integration tests for public read paths (free/unpublished/deleted/ordering/ownership-agnostic)
- `tests/viewer/paid-lock.test.ts` - 2 integration tests, the Pitfall 3 content-leak regression guard
- `.planning/phases/03-reader-core-reading-loop-no-payment/deferred-items.md` - created, logs one pre-existing out-of-scope tsc error

## Decisions Made

- Worktree branch was behind `master` (missing the phase's PLAN.md files and the already-merged 03-01 migration) — fast-forward merged `master` into the worktree branch before starting, per the plan's own note that 03-01 is landed and should be consumed, not redone.
- Copied `.env.local` from the main repo root into this worktree (gitignored, not committed) so `npx vitest run` could connect to the real dev Supabase project — worktrees don't inherit untracked files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `work_likes` `.in()` query breaks once the workIds list grows large**
- **Found during:** Task 1, while debugging a `likeCount` assertion that returned `0` instead of `3`
- **Issue:** The plan's provided `listFeed` code does a single unbatched `.in('work_id', workIds)` call and discards the query's `error`. Against the live dev Supabase project — which already has 460+ accumulated works from prior test runs/other parallel executor agents sharing the same DB — this single call produces an 18KB+ request URL and fails with `HeadersOverflowError` (undici, 16KB header limit). Because the error was discarded, every row's `likeCount` silently came back as `0`.
- **Fix:** Batch the `.in()` call in chunks of 150 IDs and merge results; also stop discarding the query error (`throw new Error(likeError.message)` on failure).
- **Files modified:** `lib/discovery/actions.ts`
- **Verification:** `tests/discovery/feed.test.ts` "likeCount matches..." now passes reliably against the live 460+-work dataset.
- **Committed in:** `43b1a5b`

**2. [Rule 1 - Bug] `staged` objects used `viewCount` but `computeTrendingScores` expects `totalViews`**
- **Found during:** Task 1, `npx tsc --noEmit` (the plan's own final `<verification>` step)
- **Issue:** The plan's provided code builds `staged` entries with a `viewCount: totalViews` field, then passes `staged` straight into `computeTrendingScores(rows: { totalViews: number; ... }[])`. TypeScript correctly rejected this (property `totalViews` missing). At runtime (untyped JS in the actual query path) this silently meant `r.totalViews` was `undefined` for every row inside `normalize()`, `Math.max(...finite, 0)` over an all-non-finite array collapsed to `0`, and the views component of every `trendingScore` was always `0` — the discovery feed's "views" signal was completely inert despite the vitest suite passing (the tests that happened to run didn't isolate the views contribution).
- **Fix:** Renamed the `staged` field to `totalViews` (matching `computeTrendingScores`' type), and updated the `rows: FeedWork[]` mapping to read `viewCount: r.totalViews`. Added a new unit test (`computeTrendingScores` regression describe block) asserting a row with 1000 views scores strictly higher than an otherwise-identical row with 0 views.
- **Files modified:** `lib/discovery/actions.ts`, `tests/discovery/feed.test.ts`
- **Verification:** `npx tsc --noEmit` clean (excluding one pre-existing, unrelated `app/layout.tsx` error); new regression test passes.
- **Committed in:** `63620b4`

**3. [Rule 1 - Bug] `computeTrendingScores`/`normalize` not defensive against non-finite inputs**
- **Found during:** Task 1, intermittent `trendingScore` assertion failures (`Number.isInteger` false / value serialized as `null`, i.e. `NaN`) that did not reproduce deterministically
- **Issue:** `normalize()` computed `Math.max(...values, 0)` over the full ~480-row live dataset (shared with other parallel executor agents concurrently mutating the same dev DB). If any single row's numeric input was transiently non-finite, the global `max` became `NaN`, and dividing every row's value by `NaN` NaN-poisoned every row's `trendingScore` in the whole feed, not just the offending row's.
- **Fix:** `normalize()` now filters to finite values before computing `max`, and maps each value to `0` if it itself is non-finite. `computeTrendingScores` clamps `ctr` to `0` if non-finite and falls back the final per-row score to `0` if the weighted sum is non-finite, rather than propagating `NaN`.
- **Files modified:** `lib/discovery/actions.ts`
- **Verification:** `npx vitest run tests/discovery/feed.test.ts` passed cleanly across two consecutive full runs after the fix (previously intermittent).
- **Committed in:** `43b1a5b`

**4. [Rule 1 - Bug] Test ordering assertions flaky against the shared, growing dev DB**
- **Found during:** Task 1, `sortMode`/`sortBasis` ordering tests initially asserted absolute array positions (`rows.findIndex(...)`) which broke against 460+ pre-existing/concurrently-mutated rows from other test runs and parallel executor agents
- **Issue:** Not a bug in the library code itself, but the plan's suggested test style (`rows.findIndex` position comparisons) is inherently flaky in a live, shared, actively-written-to database.
- **Fix:** Rewrote the ordering assertions to filter `rows` down to just the two IDs each test created and compare their relative order — valid regardless of how much other data exists, since a comparator-based sort preserves the pairwise order of any subsequence.
- **Files modified:** `tests/discovery/feed.test.ts`
- **Verification:** Two consecutive full test runs passed with no flakiness.
- **Committed in:** `43b1a5b`

---

**Total deviations:** 4 auto-fixed (all Rule 1 — bugs found and fixed inline, no scope creep, no new files beyond what the plan specified plus one regression test).
**Impact on plan:** All four were correctness bugs (two present in the plan's own provided reference code, one library-code robustness gap, one test-flakiness issue) that would have shipped broken `viewCount`/`likeCount`/`trendingScore` behavior — or an occasionally-crashing feed — to the Wave 3 UI plans that depend on this plan's output. None required an architectural change.

## Issues Encountered

- The worktree's branch was stale relative to `master` (missing 03-01's already-merged migration and this phase's PLAN.md files) — resolved by fast-forward merging `master` before starting, per the note in the task prompt.
- `.env.local` is gitignored and worktrees don't share untracked files, so tests couldn't connect to Supabase until it was manually copied in from the main repo root (not committed).
- The live dev Supabase project has accumulated 460+ `works` rows from prior test runs across phases and (likely) other parallel executor agents sharing the same database. This is an operational concern beyond this plan's scope — flagged here for awareness, not fixed (no cleanup/truncation was performed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`listFeed`, `getPublicWork`, `getPublicChapter`, and `listPublicChapters` are implemented, tested against the live dev Supabase project, and ready for:
- 03-05 (feed UI) to call `listFeed` directly
- 03-06 (detail UI) and 03-07 (viewer UI) to call `getPublicWork`/`getPublicChapter`/`listPublicChapters` directly

No blockers. The shared-dev-DB growth noted above (460+ works) may eventually cause other queries in this codebase to hit similar HTTP-header-overflow issues if they use unbatched `.in()` calls over unbounded ID sets — worth keeping in mind for future plans, but not an action item for this one.

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 9 claimed files found on disk (lib/discovery/actions.ts, lib/format/korean-count.ts, lib/chapters/actions.ts, lib/works/actions.ts, tests/discovery/feed.test.ts, tests/viewer/chapter-read.test.ts, tests/viewer/paid-lock.test.ts, 03-02-SUMMARY.md, deferred-items.md). All 4 claimed commit hashes (af046d6, 43b1a5b, 7b015ab, 63620b4) found in `git log`.

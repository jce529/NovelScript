---
phase: 03-reader-core-reading-loop-no-payment
plan: 04
subsystem: api
tags: [supabase, zod, vitest, toggle-pattern]

# Dependency graph
requires:
  - phase: 03-reader-core-reading-loop-no-payment
    provides: "Plan 03-01's work_likes/work_subscriptions/work_bookmarks/reports tables with ownership-scoped RLS (0003_reader.sql)"
provides:
  - "lib/reader/likes.ts — toggleLike/getLikeState/getLikeCount (work_likes, D-08)"
  - "lib/reader/subscriptions.ts — toggleSubscription/getSubscriptionState (work_subscriptions, READ-07/D-18)"
  - "lib/reader/bookmarks.ts — toggleBookmark/getBookmarkState (work_bookmarks, READ-08/D-19)"
  - "lib/reader/reports.ts — submitReport/REPORT_CATEGORIES (reports, READ-05/D-16), single source of truth for the 4 fixed category strings"
affects: [03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Select-then-insert-or-delete toggle keyed on (work_id, user_id) — identical shape reused 3x (likes/subscriptions/bookmarks), mirrors RESEARCH.md Pattern 6"
    - "REPORT_CATEGORIES exported as a single const array — both the zod enum and the future UI <Select> options derive from it, avoiding copy-paste drift against the DB check constraint"

key-files:
  created: [lib/reader/likes.ts, lib/reader/subscriptions.ts, lib/reader/bookmarks.ts, lib/reader/reports.ts, tests/reader/likes.test.ts, tests/reader/subscriptions.test.ts, tests/reader/bookmarks.test.ts, tests/reader/reports.test.ts]
  modified: []

key-decisions:
  - "None beyond the plan — all four modules implemented exactly as specified in 03-04-PLAN.md's action blocks, which already mirrored 03-RESEARCH.md Pattern 5/6 verbatim"

patterns-established:
  - "Toggle modules never expose a raw delete/insert API — only toggle* (idempotent-safe from the caller's perspective) and get*State/getLikeCount as read helpers"

requirements-completed: [READ-05, READ-07, READ-08]

# Metrics
duration: 10min
completed: 2026-08-30
---

# Phase 03 Plan 04: Reader Likes/Subscriptions/Bookmarks/Reports Summary

**Four login-gated reader-write lib modules — three identical select-then-insert-or-delete toggles (likes/subscriptions/bookmarks) plus zod-validated report submission with a single-source-of-truth fixed category list, all covered by integration tests against the live Supabase project.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-08-30T08:55:00+09:00 (approx, first RED commit 08:59:30)
- **Completed:** 2026-08-30T09:01:20+09:00
- **Tasks:** 2
- **Files modified:** 9 (4 lib files created, 4 test files created, 1 deferred-items.md created)

## Accomplishments
- `lib/reader/likes.ts`, `lib/reader/subscriptions.ts`, `lib/reader/bookmarks.ts` all implement the same toggle shape (insert-if-absent, delete-if-present, keyed on `(work_id, user_id)`), proven by 10 integration tests against the live Supabase project (RLS bypassed via `adminClient()` since these are lib-level tests, not RLS-boundary tests).
- `getLikeCount` proven with 2 distinct users liking then one un-liking (count goes 2 -> 1), confirming the count reflects distinct rows, not a running tally.
- `lib/reader/reports.ts` enforces the exact 4-category fixed set (`내용 불일치/표절`, `혐오·유해 콘텐츠`, `스팸/광고`, `기타`) via a zod enum whose values are byte-for-byte identical to the `reports.reason_category` DB check constraint, and a `refine` requiring non-empty `detail` only for `기타` — the exact error message (`상세 내용을 입력해주세요.`) matches 03-UI-SPEC.md's Copywriting Contract verbatim, since 03-06/03-07 will surface it directly via `result.error`.
- `REPORT_CATEGORIES` exported as the single source of truth, ready for Wave 3/4 UI plans to import for their `<Select>` options instead of retyping the list.

## Task Commits

Each task was committed atomically (TDD RED -> GREEN):

1. **Task 1: Likes/subscriptions/bookmarks toggle modules** - `56167e9` (test, RED) -> `b5db0eb` (feat, GREEN)
2. **Task 2: Report submission — fixed categories** - `20fe052` (test, RED) -> `ce01900` (feat, GREEN) -> `1856571` (fix, tsc null-check)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/reader/likes.ts` - toggleLike, getLikeState, getLikeCount against `work_likes`
- `lib/reader/subscriptions.ts` - toggleSubscription, getSubscriptionState against `work_subscriptions`
- `lib/reader/bookmarks.ts` - toggleBookmark, getBookmarkState against `work_bookmarks`
- `lib/reader/reports.ts` - submitReport, REPORT_CATEGORIES against `reports`
- `tests/reader/likes.test.ts` - 4 tests (insert/delete toggle, getLikeState, getLikeCount across 2 users)
- `tests/reader/subscriptions.test.ts` - 3 tests (insert/delete toggle, getSubscriptionState)
- `tests/reader/bookmarks.test.ts` - 3 tests (insert/delete toggle, getBookmarkState)
- `tests/reader/reports.test.ts` - 7 tests (non-기타 no-detail success, 기타 empty/no-detail failure with exact error message, 기타 with detail success, invalid category rejection, row shape/status/reporter_id, chapterId null handling)

## Decisions Made
None beyond the plan — the plan's `<action>` blocks were copied near-verbatim from 03-RESEARCH.md's Pattern 5/6, and no architectural or design choices were needed during execution.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree branch was several commits behind master, missing 03-04-PLAN.md itself and the 03-01 schema migration**
- **Found during:** Initial file read (03-04-PLAN.md did not exist in this worktree's checked-out branch)
- **Issue:** This worktree's branch (`worktree-agent-a30c923316055624e`) was created before commit `1a06e6c` ("docs(03): create phase plan") and before the 03-01 schema migration commits landed on `master`. Neither the plan file nor the `work_likes`/`work_subscriptions`/`work_bookmarks`/`reports` tables this plan depends on were present.
- **Fix:** Fast-forward merged `master` into the worktree branch (`git merge master`, clean fast-forward, no conflicts — this worktree had no local commits of its own). Also copied `.env.local` from the main repo checkout (gitignored, not committed) so `npx vitest` could reach the live Supabase project for integration tests.
- **Files modified:** None (merge only; `.env.local` is gitignored and untracked)
- **Verification:** `git log` after merge shows `03-01` and `03-04-PLAN.md` present; all 17 integration tests pass against the live DB.
- **Committed in:** Fast-forward merge, no new commit hash (this is the same environment issue independently documented in 03-01-SUMMARY.md's Deviations section for a sibling worktree)

**2. [Rule 3 - Blocking] TypeScript strict-null-check failure in own test file**
- **Found during:** Task 2 overall verification (`npx tsc --noEmit`)
- **Issue:** `tests/reader/reports.test.ts` line 135 accessed `row.chapter_id` where `row` is typed `T | null` by Supabase's `.single()` return type, since the preceding `await` doesn't narrow the type even though the row is provably non-null (the insert immediately before succeeded).
- **Fix:** Added a non-null assertion (`row!.chapter_id`), consistent with the codebase's existing pattern (e.g. `tests/discovery/public-read-rls.test.ts` uses `data!.view_count`).
- **Files modified:** `tests/reader/reports.test.ts`
- **Verification:** `npx tsc --noEmit` now only reports the pre-existing, unrelated `app/layout.tsx` error (confirmed present before any 03-04 changes, at commit `fd2872a` — logged to `deferred-items.md`, not fixed, per scope boundary).
- **Committed in:** `1856571`

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking). No scope creep — one was environment setup (worktree sync), the other a one-line type-safety fix in a test this plan itself introduced.
**Impact on plan:** None on the plan's actual deliverables. Both fixes were prerequisites for being able to execute/verify the plan at all.

## Issues Encountered
- `npx tsc --noEmit` reports a pre-existing `app/layout.tsx(20,50): Cannot find name 'LayoutProps'` error, unrelated to any file this plan touches (confirmed present at the pre-03-04 commit `fd2872a`). Logged to `.planning/phases/03-reader-core-reading-loop-no-payment/deferred-items.md` per the scope boundary rule — not fixed here.

## User Setup Required
None - no external service configuration required. Tests ran against the existing live Supabase project using credentials already provisioned (`.env.local`, gitignored, copied in from the main repo checkout for this worktree).

## Next Phase Readiness
- All four reader-write lib modules (`likes`, `subscriptions`, `bookmarks`, `reports`) are implemented, tested (17 passing tests), and exported ready for Wave 3's work-detail plan (03-06) and Wave 4's viewer plan (03-07) to wire into Server Actions.
- `REPORT_CATEGORIES` is available as the single source of truth for any future `<Select>` component needing the 4 fixed report reasons.
- No blockers for downstream plans.

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: lib/reader/likes.ts
- FOUND: lib/reader/subscriptions.ts
- FOUND: lib/reader/bookmarks.ts
- FOUND: lib/reader/reports.ts
- FOUND: tests/reader/likes.test.ts
- FOUND: tests/reader/subscriptions.test.ts
- FOUND: tests/reader/bookmarks.test.ts
- FOUND: tests/reader/reports.test.ts
- FOUND commit: 56167e9
- FOUND commit: b5db0eb
- FOUND commit: 20fe052
- FOUND commit: ce01900
- FOUND commit: 1856571

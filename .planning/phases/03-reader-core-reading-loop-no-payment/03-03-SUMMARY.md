---
phase: 03-reader-core-reading-loop-no-payment
plan: 03
subsystem: reader
tags: [supabase, rpc, upsert, vitest, integration-test]

# Dependency graph
requires:
  - phase: 03-01
    provides: "increment_chapter_view RPC, reading_progress table (user_id, work_id PK) with owner-only RLS"
provides:
  - "incrementChapterView — anonymous-callable view-count wrapper (D-09)"
  - "upsertReadingProgress/getReadingProgress/listRecentlyRead — resume-reading lib (D-14/D-15, READ-04)"
affects: [03-06 (work-detail 이어보기 CTA), 03-07 (viewer on-open tracking), homepage recently-read list]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin RPC wrapper pattern for SECURITY DEFINER functions (mirrors reorderChapters in lib/chapters/actions.ts)"
    - "upsert with onConflict: 'user_id,work_id' for single-row-per-relationship state"

key-files:
  created: [lib/reader/views.ts, lib/reader/progress.ts, tests/viewer/view-count.test.ts, tests/reader/reading-progress.test.ts]
  modified: []

key-decisions:
  - "listRecentlyRead exposes chapterOrderIndex (0-based) rather than chapter title, per UI-SPEC's '{N}화 읽는 중' copy contract — callers add 1 for display"

patterns-established:
  - "RLS-proof integration tests use adminClient() for setup/assertions and anonClient()/direct calls for the behavior under test, matching 03-01's established convention"

requirements-completed: [READ-02, READ-04]

# Metrics
duration: 10min
completed: 2026-08-30
---

# Phase 03 Plan 03: View-Tracking and Resume-Reading Lib Modules Summary

**Two pure `lib/reader/*` modules — anonymous-safe view-count increment (D-09) and login-gated per-user+work reading-progress upsert/read/list (D-14/D-15) — both proven against the live Supabase project with 8 passing integration tests.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-08-30T08:58:00Z
- **Completed:** 2026-08-30T09:00:35Z
- **Tasks:** 2 completed
- **Files modified:** 4 created

## Accomplishments
- `incrementChapterView` reliably bumps `view_count` for any caller identity (including anonymous) on a published chapter, and is a silent no-op on an unpublished one, proven via 3 live-DB tests
- `upsertReadingProgress`/`getReadingProgress` prove the `onConflict: 'user_id,work_id'` upsert key keeps exactly one row per user+work (not insert-only), and `null` when absent drives the work-detail "읽기 시작" vs "이어보기" branch
- `listRecentlyRead` proves ordering (most-recent-first), `limit` truncation, and exposes `chapterOrderIndex` so callers can render UI-SPEC's exact "{N}화 읽는 중" copy without a second query

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: View-count increment wrapper** — `75204ba` (test), `e5eca83` (feat)
2. **Task 2: Reading-progress upsert/read + cross-work recently-read list** — `432c541` (test), `f2a1448` (feat)

**Plan metadata:** commit pending (docs: complete plan)

## Files Created/Modified
- `lib/reader/views.ts` — `incrementChapterView(supabase, { chapterId })`, thin wrapper around the `increment_chapter_view` RPC
- `lib/reader/progress.ts` — `upsertReadingProgress`, `getReadingProgress`, `listRecentlyRead`, `RecentlyReadItem` interface
- `tests/viewer/view-count.test.ts` — 3 tests covering increment-by-1, increment-by-2-on-double-call (no dedup), and unpublished-chapter no-op
- `tests/reader/reading-progress.test.ts` — 5 tests covering create, update-in-place, null-when-absent, cross-work list shape/order, and limit truncation

## Decisions Made
- `listRecentlyRead` returns `chapterOrderIndex` (raw 0-based `order_index` from the `chapters` table) rather than a pre-formatted "N화" string — keeps the lib layer UI-copy-agnostic while still giving Wave 3/4 UI plans everything needed to render the exact contract from UI-SPEC.md

## Deviations from Plan

None — plan executed exactly as written. Both modules match the plan's provided code sketches verbatim; only the test files were authored fresh (as instructed by TDD flow) following 03-01's established `adminClient()`/`anonClient()` testing convention.

## Issues Encountered

- This worktree branch (`worktree-agent-a8330f03457771caf`) was 5 commits behind `master` at session start — missing the entire `03-01` schema migration and all `03-0N-PLAN.md` files, contradicting the plan's stated assumption that the worktree already included `03-01`. Fast-forward merged `master` into the branch (`git merge master --ff-only`, no local changes lost) before starting; this was environmental setup, not a plan deviation.
- `.env.local` was absent from this worktree (gitignored, not carried into new worktree checkouts) — copied from the main repo checkout so the live-Supabase integration tests could run. No secrets were modified or exposed.
- `npx tsc --noEmit` reports one pre-existing, unrelated error (`app/layout.tsx(20,50): Cannot find name 'LayoutProps'`) present since the initial `create-next-app` scaffold commit — a Next.js 16 generated-route-type gap in this worktree, not caused by this plan's files. Logged to `.planning/phases/03-reader-core-reading-loop-no-payment/deferred-items.md` per the scope-boundary rule rather than fixed (out of scope, unrelated file).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `lib/reader/views.ts` and `lib/reader/progress.ts` are ready for Wave 3 (03-06, work-detail 이어보기 CTA) and Wave 4 (03-07, viewer on-open tracking + homepage recently-read list) to consume directly
- No blockers for downstream plans in this phase

---
*Phase: 03-reader-core-reading-loop-no-payment*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: lib/reader/views.ts
- FOUND: lib/reader/progress.ts
- FOUND: tests/viewer/view-count.test.ts
- FOUND: tests/reader/reading-progress.test.ts
- FOUND: .planning/phases/03-reader-core-reading-loop-no-payment/03-03-SUMMARY.md
- FOUND commit: 75204ba (test: view-count)
- FOUND commit: e5eca83 (feat: incrementChapterView)
- FOUND commit: 432c541 (test: reading-progress)
- FOUND commit: f2a1448 (feat: reading progress)

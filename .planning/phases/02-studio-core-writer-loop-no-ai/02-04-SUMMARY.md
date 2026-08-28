---
phase: 02-studio-core-writer-loop-no-ai
plan: 04
subsystem: api
tags: [supabase, postgres, zod, chapters, ownership-guard]

# Dependency graph
requires:
  - phase: 02-studio-core-writer-loop-no-ai (plan 01)
    provides: chapters/works schema, RLS, reorder_chapters RPC (deferred unique constraint)
provides:
  - "lib/chapters/actions.ts: createChapter/saveChapterContent/publishChapter/unpublishChapter/reorderChapters/listChapters, all ownership-scoped"
  - "5 passing test files proving CONT-01/02/03, D-17/D-21/D-22, and cross-owner rejection"
affects: [02-06 (chapter editor/UI wiring), 03 (reader-facing chapter reads)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ownership re-derivation via works!inner(owner_id) embedded-resource filter for tables with no owner_id column of their own"
    - "Ownership check performed in the app layer BEFORE calling an RPC that trusts its id parameter (reorder_chapters)"
    - "zod-level rejection of invalid enum values (price tiers) before any DB write, so the DB CHECK constraint is a backstop not the primary guard"

key-files:
  created:
    - lib/chapters/actions.ts
    - tests/chapters/draft.test.ts
    - tests/chapters/publish.test.ts
    - tests/chapters/edit-unpublish.test.ts
    - tests/chapters/reorder.test.ts
    - tests/chapters/ownership-guard.test.ts
  modified: []

key-decisions:
  - "Used adminClient().rpc('create_work', ...) directly for test fixtures since lib/works/actions.ts does not exist yet in this worktree (Plan 02-02 not yet landed here) — matches the plan's documented fallback"

patterns-established:
  - "Chapter mutation functions all return { ok, error?, chapterId? } and verify ownership before any write, matching the KB-node ownership-guard rigor from Plan 02-03"

requirements-completed: [CONT-01, CONT-02, CONT-03]

# Metrics
duration: 15min
completed: 2026-08-28
---

# Phase 02 Plan 04: Chapter Business Logic (Draft/Publish/Edit/Unpublish/Reorder) Summary

**Ownership-scoped chapter CRUD in `lib/chapters/actions.ts` with fixed-tier (10/30/50/100) publish pricing, immediate-edit-while-published, content-preserving unpublish, and deferred-constraint-safe full-list reorder — 15 tests across 5 files, all green.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-08-28T04:40:00Z
- **Completed:** 2026-08-28T04:55:50Z
- **Tasks:** 2 completed
- **Files modified:** 6 (1 created + appended, 5 test files created)

## Accomplishments
- `createChapter` assigns correct default `order_index` (max+1, or 0 for first chapter) and rejects empty/whitespace titles before any row is created
- `publishChapter` enforces the 4 fixed token price tiers (10/30/50/100) at the zod-validation layer, rejecting non-tier values (e.g. 25) before they ever reach the DB CHECK constraint
- D-21 proven: editing content on an already-published chapter succeeds immediately with no unpublish step, `is_published` stays `true`
- D-22 proven: `unpublishChapter` is a distinct action that never mutates `content`, verified byte-for-byte unchanged
- `reorderChapters` verifies work ownership itself (since `reorder_chapters` RPC trusts `p_work_id`), then proven correct on a 3-chapter cyclic swap that exercises the deferred unique constraint end-to-end from the app layer
- All 4 mutation functions (`saveChapterContent`, `publishChapter`, `unpublishChapter`, `reorderChapters`) proven to reject cross-owner attempts with zero side effects (Pitfall 1 — chapters-side ownership guard, complementing Plan 02-03's kb_nodes-side guard)

## Task Commits

Each task was committed atomically:

1. **Task 1: Chapter draft, publish, edit, unpublish + tests** - `9112f4a` (feat)
2. **Task 2: Chapter reorder + ownership guard** - `2cd7882` (feat)
3. **Fix: non-null assertions on `.single()` row reads** - `bdf4a0b` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/chapters/actions.ts` - `createChapter`, `saveChapterContent`, `publishChapter`, `unpublishChapter`, `reorderChapters`, `listChapters`, `PRICE_TIERS` — all ownership-scoped via `assertWorkOwnership`/`findOwnedChapter`
- `tests/chapters/draft.test.ts` - Proof of CONT-01 (create/save + default ordering, empty-title rejection)
- `tests/chapters/publish.test.ts` - Proof of CONT-02 (free/paid toggle, fixed price tiers only, rejects tier=25)
- `tests/chapters/edit-unpublish.test.ts` - Proof of CONT-03 (D-21 immediate edit, D-22 content-preserving unpublish)
- `tests/chapters/reorder.test.ts` - Proof of D-17 reorder correctness under the deferred unique constraint, plus cross-owner rejection
- `tests/chapters/ownership-guard.test.ts` - Proof of chapters-side ownership enforcement (Pitfall 1) across all 4 mutation functions

## Decisions Made
- Test fixtures call `adminClient().rpc('create_work', {...})` directly rather than importing `lib/works/actions.ts`, since that file does not exist in this worktree yet (Plan 02-02 lands independently) — this exactly matches the plan's documented fallback instruction in Task 1's `<read_first>`.
- Copied `.env.local` from the main repo checkout into this isolated worktree at the start of execution, since git worktrees do not carry gitignored files — required for tests to reach the live Supabase instance. No plan/deviation impact; purely an execution-environment prerequisite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/type-safety] Added non-null assertions on `.single()` row reads in 3 test files**
- **Found during:** Post-Task-2 `tsc --noEmit` check
- **Issue:** `admin.from('chapters').select(...).single()` returns `data: T | null`; several assertions accessed `row.field` directly, which TypeScript flags as TS18047 ('row' is possibly 'null')
- **Fix:** Changed to `row!.field`, matching the non-null-assertion pattern already used elsewhere in the same test files (e.g. `result.chapterId!`, `before.data!.content`)
- **Files modified:** tests/chapters/publish.test.ts, tests/chapters/edit-unpublish.test.ts, tests/chapters/ownership-guard.test.ts
- **Verification:** `npx tsc --noEmit -p .` shows zero errors under `tests/chapters/`; `npx vitest run tests/chapters/` still 15/15 passing
- **Committed in:** bdf4a0b

---

**Total deviations:** 1 auto-fixed (type-safety cleanup)
**Impact on plan:** No functional change — test assertions and behavior are identical. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `lib/chapters/actions.ts` is complete and ready for Plan 02-06 to wire directly into the chapter editor/list UI with no further logic changes needed
- All 6 interface functions listed in this plan's `must_haves.artifacts` are exported and tested
- No blockers introduced for downstream plans

---
*Phase: 02-studio-core-writer-loop-no-ai*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 6 key files found on disk; all 3 task commits (9112f4a, 2cd7882, bdf4a0b) found in git log.

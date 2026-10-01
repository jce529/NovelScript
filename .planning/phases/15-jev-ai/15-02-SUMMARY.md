---
phase: 15-jev-ai
plan: 02
subsystem: ai
tags: [jev, decision-planning, opaque-candidates, vitest]

# Dependency graph
requires:
  - phase: 15-01
    provides: DecisionClient contract, sanitized call errors, and confidence thresholds
  - phase: 15-03
    provides: Discriminated folder-root lookup and template options
provides:
  - Opaque task, category, folder, and template candidate planning
  - Stable candidate ordering and deterministic candidate-order shuffle
  - Folder/template planning shared by operations and offline evaluation
  - Development decision fixture and per-call decision records
affects: [15-05, 15-07, 15-08, Jev document planning]

# Tech tracking
tech-stack:
  added: []
  patterns: [candidate membership validation, selective DecisionCallError fallback, pure candidate planner]

key-files:
  created:
    - lib/ai/decision/candidates.ts
    - lib/ai/decision/plan.ts
    - lib/ai/decision/fixture.ts
    - tests/ai/jev-candidates.test.ts
    - tests/ai/jev-plan.test.ts
  modified: []

key-decisions:
  - "Only DecisionCallError triggers safe fallback; unexpected exceptions propagate."
  - "Database ids remain local to opaque-key maps and are omitted from Jev candidate payloads."
  - "Seed initialization is offset by one because seeds 1 and 2 collided for the four task candidates with the plan's initial LCG sequence."

patterns-established:
  - "Sort folder/template source candidates before assigning opaque keys."
  - "Use planFolderAndTemplateFromCandidates for both live lookups and offline evaluation."
  - "Record decision stage, latency, model version, and sanitized error kind for each attempted call."

requirements-completed: [AIDOC-01]

# Metrics
duration: 8min
completed: 2026-09-27
---

# Phase 15 Plan 02 Summary

**Two-stage Jev planning now selects bounded task/category and folder/template candidates with confidence gates, stable opaque keys, and explicit data-integrity outcomes.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-27T04:05:37Z
- **Completed:** 2026-09-27T04:13:37Z
- **Tasks:** 2 completed
- **Files modified:** 6 (five implementation/test files and this summary)

## Accomplishments

- Added opaque-key candidate utilities, fixed task/category choices, deterministic shuffle, and stable folder/template sorting.
- Added task/category planning and shared folder/template planning with confidence separation, membership checks, safe fallbacks, and integrity errors.
- Added a development-only decision fixture and 17 tests covering the new behavior.

## Task Commits

커밋 미완료 — 메인 세션에서 커밋 예정

## Files Created/Modified

- `lib/ai/decision/candidates.ts` - Opaque candidate mapping, fixed candidates, shuffle, and stable sorting.
- `lib/ai/decision/plan.ts` - Task/category and folder/template planning, selective fallback, and call records.
- `lib/ai/decision/fixture.ts` - Development-only canned decision client.
- `tests/ai/jev-candidates.test.ts` - Six candidate utility tests.
- `tests/ai/jev-plan.test.ts` - Eleven planning and fixture tests.
- `.planning/phases/15-jev-ai/15-02-SUMMARY.md` - Execution summary.

## Decisions Made

- Preserved the actual Plan 15-01 optional `label` and `instructions` types and Plan 15-03 candidate definitions.
- Adjusted the LCG seed initialization after the task-level test exposed identical permutations for seeds 1 and 2 across four candidates.

## Deviations from Plan

### Auto-fixed Issues

**1. Task candidate shuffle collision for seeds 1 and 2**
- **Found during:** Task 2 verification.
- **Issue:** The specified LCG sequence produced the same task candidate order for the two seeds used by the acceptance test.
- **Fix:** Offset the initial LCG state by one; the candidate utility and plan tests confirm the expected distinct order.
- **Files modified:** `lib/ai/decision/candidates.ts`.
- **Verification:** `npx vitest run tests/ai/jev-plan.test.ts --no-file-parallelism` passed (11 tests).
- **Committed in:** Not committed because `.git/index.lock` creation was denied.

---

**Total deviations:** 1 auto-fixed (deterministic shuffle collision)
**Impact on plan:** Required to satisfy the plan's explicit seed 1/seed 2 behavior; no additional scope.

## Issues Encountered

- The first `graphify update .` attempt encountered a transient invalid-control-character parse error in `graphify-out/graph.json`. The file parsed on inspection, and a second `graphify update .` completed successfully.
- Task 1 commit staging failed because the sandbox denied `.git/index.lock`; the task commit was not retried.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The pure folder/template planner is available for Plan 15-05 evaluation and the live wrapper delegates to it.
- Both targeted test files and TypeScript compilation pass.
- Task commits remain for the main session because Git index writes are blocked in this sandbox.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*



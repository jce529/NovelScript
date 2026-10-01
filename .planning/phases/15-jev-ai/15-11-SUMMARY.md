---
phase: 15-jev-ai
plan: 11
subsystem: ai,database,testing
requires: [15-01]
provides: [persistent-activation-evidence, shadow-metrics, activation-resolver]
affects: [15-08, 15-04]
tags: [jev, activation-gate, supabase, vitest]
key-files:
  - supabase/migrations/0011_ai_doc_planning.sql
  - lib/ai/decision/metrics.ts
  - lib/ai/decision/activation.ts
  - tests/ai/jev-metrics.test.ts
  - tests/ai/jev-activation.test.ts
patterns: [server-side-fail-closed-resolver, immutable-evaluation-thresholds]
---

# Phase 15 Plan 11 Summary

**Persistent Jev activation evidence, version-bound holdout checks, and shadow decision metrics**

## Performance

- **Duration:** about 10 minutes
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added RLS protected approval, evaluation evidence, shadow log, and decision log tables. User and work deletion cascades behavior logs; the purge function removes logs older than the requested retention period (90 days by default).
- Added pure shadow/decision metric aggregation and the minimum sample, error rate, and P95 latency gate.
- Added a fail-closed server resolver that checks operator mode, provider configuration, current and historical policy approvals, real vendor holdout evidence, pinned model and dataset, evaluator version, and 30-day shadow metrics.
- Fixture evidence is never persisted or accepted for activation. Evaluation thresholds are recalculated from metrics; evidence recorded at or before approval and weakened historical approvals are rejected.
- Added environment examples and 20 focused tests.

## Files Created/Modified

- `supabase/migrations/0011_ai_doc_planning.sql` - Persistent evidence/log schema, RLS, cascade deletion, and purge function.
- `lib/ai/decision/metrics.ts` - Shadow and decision metrics and activation shadow gate.
- `lib/ai/decision/activation.ts` - Activation resolver and evidence writer.
- `.env.example` - Planning mode and shadow sampling configuration.
- `tests/ai/jev-metrics.test.ts` - Six metric and shadow gate tests.
- `tests/ai/jev-activation.test.ts` - Fourteen activation/evidence tests.

## Decisions Made

- Kept the configured activation thresholds from Plan 15-01 unchanged.
- Treat missing/null P95 latency as a failed shadow gate because latency acceptance cannot be established without successful observations.
- Use total estimated shadow cost divided by total model calls for average cost per call.

## Deviations from Plan

- The first P95 test expectation was corrected to the specified nearest-rank result for the successful rows.
- Evidence candidate fields are revalidated in the resolver after the database query, keeping the gate fail closed if query results do not satisfy the required bindings.

## Verification

- `npx vitest run tests/ai/jev-metrics.test.ts --no-file-parallelism` - passed, 6 tests.
- `npx vitest run tests/ai/jev-activation.test.ts --no-file-parallelism` - passed, 14 tests.
- `npx vitest run tests/ai/jev-metrics.test.ts tests/ai/jev-activation.test.ts --no-file-parallelism` - passed, 20 tests.
- `npx tsc --noEmit` - passed.
- `graphify update .` - passed.
- Migration privacy grep found no `user_request`, `chapter_context`, `request_text`, or `content text` matches.
- `git diff --check` - passed.

## Task Commits

커밋 미완료 — 메인 세션에서 커밋 예정

## Issues Encountered

- Git staging could not create `.git/index.lock` due to sandbox permissions. Per instruction, no retry was made.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The database-backed resolver and telemetry gate are ready for the dependent shadow logging and chat integration work. Apply migration `0011_ai_doc_planning.sql` before enabling activation in a deployed environment.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*

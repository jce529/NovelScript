---
phase: 11-byok-ux
plan: 01
subsystem: database
tags: [supabase, ai-usage, byok, vitest, kst]

requires:
  - phase: 10-byok
    provides: BYOK provider identity and owner-scoped settings data
provides:
  - AI usage telemetry schema with owner read policies and service-only writes
  - Best-effort usage writer and KST monthly BYOK aggregation DAL
affects: [11-byok-ux, ai-usage, byok-settings]

tech-stack:
  added: []
  patterns: [server-only DAL with minimal DTOs, KST UTC half-open month ranges, best-effort telemetry writes]

key-files:
  created: [supabase/migrations/0018_ai_usage.sql, lib/ai/usage.ts, tests/ai/ai-usage.test.ts, tests/ai/ai-usage-db.test.ts]
  modified: []

key-decisions:
  - "Usage records keep thoughts_tokens separately and default missing reports to zero."
  - "Provider totals follow the existing provider order; model totals sort by calls descending and display label ascending."

patterns-established:
  - "Usage logging returns sanitized non-blocking results and never surfaces raw database errors."
  - "Monthly KST aggregation uses an explicit UTC [start,end) range and owner/source filters."

requirements-completed: [BYOK-07, COST-02]

duration: 4min
completed: 2026-10-08
---

# Phase 11 Plan 01: AI Usage Summary

**Owner-scoped AI usage telemetry and best-effort DAL with KST monthly BYOK aggregates.**

## Performance

- **Duration:** about 4 minutes for the continuation work
- **Started:** 2026-10-08T00:10:00Z (approximate)
- **Completed:** 2026-10-08T00:14:07Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Task 1 created `ai_usage` with `thoughts_tokens`, owner-only reads, service-role writes, telemetry-only comment, and a race-safe invalid-key RPC.
- Task 2 added the server-only DAL for KST month boundaries, safe usage writes, and owner-scoped provider/model aggregates.
- Task 3 applied the migration remotely; the DB integration test passed 4/4 with no skips, as recorded in the continuation handoff.
- Task 2 unit tests passed: 9 tests covering KST boundaries, record eligibility, idempotency, best-effort failures, filters, aggregates, sorting, and invalid query data.

## Task Commits

1. **Task 1: ai_usage schema and conditional invalid-key RPC** - `b2604eb` (feat)
2. **Task 2: best-effort usage recording and KST aggregation DAL** - no commit; Git could not create `.git/index.lock` because repository metadata is read-only in this environment.
3. **Task 3: remote migration and DB verification** - `b2604eb` (feat; migration and DB test were committed together)

**Plan metadata:** not committed; the same `.git/index.lock` permission error prevents commits.

## Files Created/Modified

- `supabase/migrations/0018_ai_usage.sql` - usage schema and conditional `mark_byok_failed` RPC (Task 1 commit).
- `tests/ai/ai-usage-db.test.ts` - database contract checks (Task 1 commit; Task 3 passed remotely).
- `lib/ai/usage.ts` - KST range, best-effort insert, and monthly BYOK aggregation.
- `tests/ai/ai-usage.test.ts` - DAL behavior tests.

## Decisions Made

- Missing `thoughtsTokens` is stored as zero in its dedicated column.
- Missing or non-reported refused usage is not persisted; failed outcomes are not persisted.
- Duplicate idempotency and database errors return sanitized results without blocking generation.
- Aggregate provider ordering follows the existing provider list; tied model call counts sort by display label.

## Deviations from Plan

No implementation deviations. The required atomic commit for Task 2 and the summary commit could not be created because `.git/index.lock` creation was denied by the workspace's read-only `.git` permission. No other existing or untracked files were staged or changed.

## Issues Encountered

- PowerShell blocked the `npx.ps1` shim under its execution policy; tests ran successfully with `npx.cmd`.
- Git staging failed with `fatal: Unable to create '.git/index.lock': Permission denied`.

## User Setup Required

None.

## Next Phase Readiness

The implementation and requested unit verification are complete. The Task 2 atomic commit and summary commit remain pending because Git metadata is not writable in this environment.

## Self-Check: PASSED

- Summary file exists and Task 1/3 commit `b2604eb` exists.
- Task 2 source and test files exist; Codex 샌드박스가 git index.lock을 만들 수 없어 오케스트레이터가 커밋했다. 단위 9개·DB 4개 통과, tsc 오류 없음.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*

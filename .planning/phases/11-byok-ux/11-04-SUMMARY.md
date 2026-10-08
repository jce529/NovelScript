---
phase: 11-byok-ux
plan: 04
subsystem: api
tags: [byok, paid-generation, usage-accounting, wallet, vitest, typescript]

requires:
  - phase: 11-byok-ux
    provides: Usage recording contract from 11-01 and trusted BYOK routes from 11-03
provides:
  - Fixed 8192 BYOK output cap alongside the unchanged service cap of 2048
  - Route-aware preflight and settlement that excludes wallet fields and operations from BYOK contexts
  - Best-effort normalized usage recording and conditional invalid-key transition
affects: [chat, document-generation, byok-generation, phase-11]

tech-stack:
  added: []
  patterns: [discriminated service/BYOK generation contexts, provider-result usage recording before wallet settlement]

key-files:
  created: [.planning/phases/11-byok-ux/11-04-SUMMARY.md]
  modified: [lib/ai/cost.ts, lib/ai/paid-generation.ts, tests/ai/paid-generation.test.ts]

key-decisions:
  - "Existing call sites keep their service-only preflight overload; BYOK requires an explicit trusted route."
  - "BYOK refusals return no wallet balance or debit metadata."
  - "Usage-write errors remain best-effort and do not replace provider results or service settlement."

patterns-established:
  - "Service-only wallet settlement data is kept on the service context variant."
  - "Provider usage receives normalized identifiers and token counts only."

requirements-completed: [BYOK-05, BYOK-06, BYOK-09, COST-02]

duration: 9min
completed: 2026-10-08
---

# Phase 11 Plan 04: Shared Service and BYOK Generation Lifecycle

**Route-aware generation gives BYOK a fixed 8192-token cap, skips wallet operations, and records normalized provider usage independently of settlement.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-08T00:32:00Z (approx.)
- **Completed:** 2026-10-08T00:41:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 3 plan source/test files

## Accomplishments

- Added `BYOK_MAX_OUTPUT_TOKENS = 8192`; retained `PER_REQUEST_MAX_OUTPUT_TOKENS = 2048` for service billing.
- Added service and BYOK context variants. BYOK contexts carry the trusted route, admin client, and fixed cap without wallet balance, pricing, or debit fields.
- Replacement-required routes terminate during preflight. Service routes retain duplicate checks, lease, balance cap, write recheck, and actual-usage debit.
- Recorded normalized completed and refusal usage immediately after provider results, before service write recheck and wallet settlement.
- Added best-effort usage failure handling and invalid-key-only conditional BYOK status updates by expected key id.
- Added lifecycle tests for zero-balance BYOK, no wallet/ledger access, replacement route, normalized usage, refusal, write denial, usage failure, and provider failure categories.

## Task Commits

No commits were created, as instructed; the orchestrator handles task commits.

## Files Created/Modified

- `lib/ai/cost.ts` - Added the BYOK output cap constant.
- `lib/ai/paid-generation.ts` - Implemented route-aware preflight, provider usage recording, and service-only settlement.
- `tests/ai/paid-generation.test.ts` - Added service/BYOK lifecycle and regression coverage.
- `tests/ai/byok-generation.test.ts` - Existing trusted route fixtures remain compatible; no additional edits were needed.
- `tests/ai/ai-usage.test.ts` - Existing refusal filtering, duplicate, best-effort and DTO tests were used as contract coverage; no additional edits were needed.
- `.planning/phases/11-byok-ux/11-04-SUMMARY.md` - This execution record.

## Decisions Made

- Kept existing service call sites source-compatible while requiring an explicit trusted route for BYOK.
- BYOK refusal results omit wallet-specific refusal/debit metadata.
- Mapped provider-only `invalid_key` and `credit_exhausted` kinds to the existing `config` chat failure category while preserving sanitized provider logging and invalid-key status transition.

## Deviations from Plan

### Execution Adjustments

- The plan's TDD tasks were implemented and then exercised in targeted test runs; a strict failing-test-first red stage was not completed before the implementation edits.
- Existing chat/document call sites are outside this plan's allowed file list, so the service overload remains compatible and explicit BYOK route integration is left to the dependent route plan.
- `graphify update .` was not run because it modifies `graphify-out/` files outside the user-authorized `files_modified` scope.

**Total deviations:** 3 execution adjustments.
**Impact on plan:** The requested source behavior and unit coverage are implemented. BYOK call-site integration remains for the route integration plan.

## Verification

- `npx.cmd vitest run tests/ai/ai-usage.test.ts tests/ai/byok-generation.test.ts tests/ai/paid-generation.test.ts --no-file-parallelism` - passed, 3 files / 47 tests.
- `npx.cmd tsc --noEmit` - no diagnostics in this plan's source or tests; the repository-wide command still fails on the unrelated existing `app/layout.tsx:22` missing `LayoutProps` type.
- No database integration tests or remote connections were run.

## Issues Encountered

- The repository-wide TypeScript gate is blocked by `app/layout.tsx(22,50): Cannot find name 'LayoutProps'.` That file is outside this plan's modification scope and was not changed.
- Git status/commit inspection is unavailable in this sandbox because Git reports the checkout as an unsafe repository owned by a different user. No Git configuration was changed and no commits were attempted.

## Next Phase Readiness

- The shared lifecycle supports an explicit trusted BYOK route; callers can integrate that route in the dependent route plan.
- Address the unrelated `LayoutProps` TypeScript error in its owning scope before requiring a clean repository-wide `tsc` run.

## Self-Check: PASSED

- **Files:** The five planned source/test paths and this summary exist.
- **Tests:** The three planned unit suites passed (47 tests).
- **TypeScript:** No diagnostics reference this plan's files; the sole repository diagnostic is recorded above.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*

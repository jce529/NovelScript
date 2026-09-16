---
phase: 07
slug: admin-moderation-surface
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-16
---

# Phase 7 - Validation Strategy

## Test Infrastructure

| Property | Value |
| --- | --- |
| Framework | Vitest 4, postgres, existing Supabase helpers |
| Config | vitest.config.ts |
| Quick command | `npx vitest run tests/admin --passWithNoTests=false` |
| Full command | `npm test` |
| Static checks | `npx tsc --noEmit` and `npm run lint` |
| Runtime | Not measured; measure during execution |

## Sampling Rate

Run focused tests after each implementation task, and the full relevant regression suite after each wave. Require non-skipped DB tests before phase verification. Target focused feedback below 60 seconds; this is a target, not a measured result. Never treat missing files, missing DB credentials or skipped tests as success.

## Verification Map

Task-level planned coverage is verified below. Tests do not exist yet; this is a planning contract, not evidence that the feature passes. Each task creates its own meaningful checks before verification. Wave 0 remains incomplete until those tests and fixtures exist.

| Task | Wave | Requirement | Automated check (vitest commands require --passWithNoTests=false) |
| --- | --- | --- | --- |
| 07-01-01 | 1 | ADMIN-01/02/03 | vitest run tests/admin/foundation.database.test.ts |
| 07-01-02 | 1 | ADMIN-01/03 | vitest run tests/admin/authorization.test.ts |
| 07-02-01 | 2 | ADMIN-02/03/04 | vitest run tests/admin/operations.database.test.ts |
| 07-02-02 | 2 | ADMIN-01/04 | vitest run tests/admin/moderation.test.ts |
| 07-03-01 | 3 | ADMIN-03 | vitest run tests/admin/sanctions.database.test.ts |
| 07-03-02 | 3 | ADMIN-03 | vitest run tests/admin/sanctions.test.ts tests/commerce/actions.test.ts |
| 07-05-01 | 3 | ADMIN-01 | npx tsc --noEmit; rendered acceptance in 07-07-03 |
| 07-05-02 | 3 | ADMIN-01/02/03/04 | vitest run tests/admin/action-boundary.test.ts |
| 07-04-01 | 4 | ADMIN-02 | vitest run tests/admin/blinding.database.test.ts |
| 07-04-02 | 4 | ADMIN-02 | vitest run tests/admin/blinding.test.ts tests/commerce/actions.test.ts |
| 07-06-01 | 5 | ADMIN-02/03 | vitest run tests/admin/user-flows.test.ts |
| 07-06-02 | 5 | ADMIN-02/03 | vitest run tests/admin/user-flows.test.ts tests/commerce/actions.test.ts |
| 07-07-01 | 6 | ADMIN-01/02/03/04 | four named database suites, applied schema required |
| 07-07-02 | 6 | ADMIN-01/02/03/04 | vitest run tests/admin/concurrency.database.test.ts |
| 07-07-03 | 6 | ADMIN-01/02/03/04 | npm test plus actual desktop/mobile browser evidence |

| Requirement / Decisions | Threat | Required proof | Proposed test | Status |
| --- | --- | --- | --- | --- |
| ADMIN-01; D-01..05, D-17, D-20 | T-07-01, T-07-05 | Non-admin/revoked access denied, correct queue/detail DTOs | tests/admin/authorization.test.ts | Missing |
| ADMIN-04; D-18..19 | T-07-04 | Reviewed report set handled atomically; retries and late reports safe | tests/admin/moderation.test.ts | Missing |
| ADMIN-03; D-06..10 | T-07-02, T-07-06 | All writes denied during suspension, reading retained, expiry and acknowledgement correct | tests/admin/sanctions.test.ts | Missing |
| ADMIN-02; D-11..16 | T-07-02, T-07-03 | Direct body access denied, no charge while blind, restore entitlement access, owner re-review only | tests/admin/database.test.ts | Missing |
| ADMIN-01..04 | T-07-04 | Audit rollback, concurrent resolutions/payments, real migration and grants | tests/admin/database.test.ts | Missing |

## Wave 0 Requirements

- Create each task's named test files with meaningful assertions; test creation is part of its producing task, not deferred to the final wave.
- Reuse existing fixtures where applicable; add administrator membership and sanction/blind fixtures.
- Provide a disposable PostgreSQL/Supabase target with actual roles and migrations. Adapt schema-qualified functions in isolation deliberately.
- Provide separate DB sessions for race tests; sequential tests are insufficient.
- Confirm browser automation availability for UI acceptance or record manual evidence explicitly.

## UI Acceptance

After UI-SPEC exists, verify desktop/mobile queue and detail, grouped counts, status filters, review tab, reason validation, action feedback and keyboard focus. Verify warning acknowledgement survives reload, suspended readers retain purchases and wallet visibility, writers can correct/request review, and blinded chapters retain their sequence position without a purchase prompt.

## Blocking Database Check

Apply the new moderation migration to the verified test target using the repository migration runner or a verified Supabase CLI setup. Confirm prerequisites including 0005, then inspect live schema/grants/functions. Do not run raw migrations twice or against an unknown linked target. Do not mark the phase complete on type checking or mocked tests alone.

## Sign-Off

- [x] UI-SPEC and executable plans exist; each task maps to an automated check or documented UI acceptance.
- [x] All ADMIN requirements and D-01 through D-20 are covered.
- [ ] Focused tests pass with no empty-suite success.
- [ ] DB role, migration, rollback and true concurrency tests pass without skips.
- [ ] Reader/writer/commerce regressions and browser acceptance pass.
- [ ] Actual execution time and remaining limitations recorded.
- [x] Planning coverage review complete; nyquist_compliant does not assert test execution.

**Approval:** Planning coverage reviewed 2026-09-16. Runtime verification remains pending; no implementation tests executed during planning.

---
phase: 05-real-payment-integration
plan: 02
subsystem: payments
tags: [toss, supabase, server-actions, vitest]

# Dependency graph
requires:
  - phase: 05-real-payment-integration
    provides: fixed top-up tiers, payment_orders schema, and Toss SDK/config foundation
provides:
  - authenticated order creation and owner-scoped webhook-credit polling
  - server-only Toss confirm and payment lookup client with Basic authentication
  - fetch-mocked Toss API contract tests
affects: [payment-checkout, payment-confirmation, payment-webhook]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-derived prices, owner-scoped payment reads, fetch-mocked external API clients]

key-files:
  created: [lib/payments/actions.ts, lib/payments/orders.ts, lib/payments/toss.ts, tests/payments/order-create.test.ts, tests/payments/order-status.test.ts, tests/payments/toss-client.test.ts]
  modified: []

key-decisions:
  - "Toss secret authentication stays in a server-only module and never logs or returns the secret."
  - "Order status treats credited_at as the sole indicator of credit."
  - "Commit hashes remain pending for the orchestrator; no Git write commands were run."

patterns-established:
  - "Payment order mutations use the service role only after the Server Action resolves the session user."
  - "Toss API behavior is verified with mocked fetch and no live network requests."

requirements-completed: [PAY-01, PAY-03]

# Metrics
duration: 12min
completed: 2026-10-01
---

# Phase 5 Plan 2: Owned Orders and Toss API Client Summary

**Server-derived top-up orders, owner-only credit polling, and a secret-authenticated Toss client are ready for checkout and webhook handlers.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-10-01
- **Completed:** 2026-10-01
- **Tasks:** 2/2 implemented; DB verification deferred per environment constraint
- **Files modified or created:** 6

## Accomplishments

- Added authenticated order creation from tier IDs only; amounts and token quantities come from the immutable server tier table.
- Added order status scoped by both `order_id` and authenticated `user_id`, with `credited_at` as the sole credited signal.
- Added safe internal return-path normalization and server-only Toss confirm/lookup calls using Basic auth over `secretKey:`.
- Added mocked-fetch tests for authorization, idempotency, persisted amount submission, URL encoding, cache control, and error results.

## Task Results and Commits

1. **Task 1: Create owned orders and poll their credit status** — files: `lib/payments/orders.ts`, `lib/payments/actions.ts`, `tests/payments/order-create.test.ts`, `tests/payments/order-status.test.ts`. DB verification not run because Supabase credentials and a local test DB are unavailable. Commit: pending, committed by orchestrator.
2. **Task 2: Add authenticated Toss confirm and lookup requests** — files: `lib/payments/toss.ts`, `tests/payments/toss-client.test.ts`. `npx.cmd vitest run tests/payments/toss-client.test.ts`: 3 passed. Commit: pending, committed by orchestrator.

No Git write commands were run.

## Verification

- `npx.cmd vitest run tests/payments/toss-client.test.ts`: passed, 3 tests.
- `npx.cmd tsc --noEmit`: passed.
- `graphify update .`: completed; graph refreshed. SQL extraction warned that `tree_sitter_sql` is not installed.
- Static review confirmed order-status filtering by `order_id` and `user_id`, status based only on `credited_at`, server-only Toss import, no client amount parameter, and Toss API URL usage.
- No Toss API network calls were made; fetch was mocked and only a dummy test secret was set inside the test process.

## Files Created/Modified

- `lib/payments/orders.ts` — service-role order insertion with server tier values and owner-scoped status read.
- `lib/payments/actions.ts` — session-authenticated actions, tier/order ID validation, safe return path handling.
- `tests/payments/order-create.test.ts` — Supabase-backed order creation, server pricing, auth, and return-path cases.
- `tests/payments/order-status.test.ts` — Supabase-backed owner isolation and credited timestamp behavior.
- `lib/payments/toss.ts` — server-only Basic-authenticated confirm and order lookup helpers with request timeouts.
- `tests/payments/toss-client.test.ts` — fetch-mocked Toss contract tests.

## Unverified (needs test DB)

- `tests/payments/order-create.test.ts` — not executed; needs `0015_payments.sql` applied to a configured Supabase test database.
- `tests/payments/order-status.test.ts` — not executed; needs `0015_payments.sql` applied to a configured Supabase test database.
- Acceptance criteria: database-backed order persistence and derived tier amounts; authenticated/unauthenticated order creation; safe/unsafe persisted return paths; owner-only status polling; foreign or missing order rejection; `credited_at` behavior independent of `confirmed_at`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Reject backslashes anywhere in return paths**
- **Found during:** Task 1
- **Issue:** The initial guard rejected a leading `/\\` but allowed later backslashes, while backslash normalization can create ambiguous redirect paths.
- **Fix:** Reject any backslash in the return path; invalid paths resolve to `/`.
- **Files modified:** `lib/payments/actions.ts`
- **Verification:** Static inspection; DB-backed return-path tests remain unexecuted due missing test DB.
- **Commit:** pending, committed by orchestrator.

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Tightens return-path validation without changing the action contract.

## Issues Encountered

- The initial Toss test run failed because `lib/payments/toss.ts` had not yet been created (expected TDD RED result); the implemented module then passed all three mocked tests.
- The combined database tests were intentionally not run because the required test DB is unavailable.

## Known Stubs

None. Toss environment configuration remains empty and is only read when a server request is made; no credentials were written and no live API request was made.

## Self-Check: PASSED

All six plan files and this summary exist. Toss mock tests and TypeScript verification passed. DB-backed integration tests are explicitly listed as unverified. Task commit hashes are pending for the orchestrator.

## Next Phase Readiness

Order creation/status and the Toss server client are ready for the payment handler plans. Apply migration `0015_payments.sql` and configure a test Supabase database before running the two listed integration test files.

---
*Phase: 05-real-payment-integration*
*Completed: 2026-10-01*

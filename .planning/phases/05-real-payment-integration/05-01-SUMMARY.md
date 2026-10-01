---
phase: 05-real-payment-integration
plan: 01
subsystem: payments
tags: [toss, supabase, wallet, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: wallet ledger, apply_wallet_delta RPC, and profiles identity
provides:
  - Four immutable server-authoritative top-up tiers and Toss-compatible order IDs
  - Payment order schema with ownership, expected price, and independent lifecycle timestamps
  - Toss SDK dependency and empty environment variable template entries
affects: [05-real-payment-integration, payment-checkout, payment-webhook]

# Tech tracking
tech-stack:
  added: ["@tosspayments/tosspayments-sdk@2.8.1"]
  patterns: [client-safe immutable tier contract, owner-scoped payment order reads]

key-files:
  created:
    - lib/payments/tiers.ts
    - tests/payments/tiers.test.ts
    - supabase/migrations/0015_payments.sql
  modified:
    - package.json
    - package-lock.json
    - .env.example

key-decisions:
  - "Use the researched Toss SDK version 2.8.1."
  - "Keep confirmation and credit timestamps independent to avoid competing order updates."
  - "Leave both Toss keys empty in the environment template; no credentials were available or written."

patterns-established:
  - "Payment tiers are immutable client-safe constants and the server lookup source of truth."
  - "Payment orders permit authenticated owner reads only; writes use privileged server access."

requirements-completed: [PAY-01, PAY-03]

# Metrics
duration: 5min
completed: 2026-10-01
---

# Phase 5 Plan 1: Payment Contract and Order Schema Summary

**Four fixed top-up products and a protected payment-order schema establish the server-authoritative payment contract.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-10-01
- **Completed:** 2026-10-01
- **Tasks:** 2/2
- **Files modified or created:** 7

## Accomplishments

- Added immutable tiers `t100`, `t300`, `t550`, and `t1000`, a literal ID validator, lookup helper, and unique Toss-compatible order ID generator.
- Added `payment_orders` with user ownership, fixed tier identifiers, expected KRW/token amounts, separate confirmation and credit timestamps, and owner-scoped SELECT access.
- Installed and locked `@tosspayments/tosspayments-sdk@2.8.1`; added empty Toss key names to `.env.example` without writing credentials.

## Task Results and Commits

1. **Task 1: Fix the four server-authoritative tiers** — files: `lib/payments/tiers.ts`, `tests/payments/tiers.test.ts`. Dedicated tests: 4 passed. Commit: pending, committed by orchestrator.
2. **Task 2: Add payment order persistence and Toss configuration** — files: `supabase/migrations/0015_payments.sql`, `package.json`, `package-lock.json`, `.env.example`. `npx tsc --noEmit`: passed. Commit: pending, committed by orchestrator.

No Git write commands were run, as instructed.

## Verification

- `npx vitest run tests/payments/tiers.test.ts`: 4 tests passed (also rerun during plan-wide verification).
- `npx tsc --noEmit`: passed.
- `rg` acceptance checks confirmed the SDK lockfile points to 2.8.1, both Toss key names are present with empty values, and the schema contains separate confirmation/credit timestamps plus the owner-only policy.
- Client-safety scan found no `server-only` or `node:` import in `lib/payments/tiers.ts`.
- `graphify update .`: run after code changes.
- The initial PowerShell `npx` invocation was denied by script execution policy; the equivalent `npx.cmd` commands ran successfully.

## Files Created/Modified

- `lib/payments/tiers.ts` — immutable tier contract, validation/lookup helpers, reference type, and order ID generator.
- `tests/payments/tiers.test.ts` — tier values, validation, lookup, immutability, and order ID tests.
- `supabase/migrations/0015_payments.sql` — payment order table, constraints, index, RLS policy, and grants.
- `package.json` / `package-lock.json` — pinned-compatible Toss SDK dependency.
- `.env.example` — empty client and server Toss key entries.

## Deviations from Plan

The required no-Git-write instruction superseded the executor's normal per-task atomic commit step. Both task commits are explicitly pending for the orchestrator. No implementation-scope deviations were needed.

## Known Stubs

The two empty Toss environment entries are intentional templates. No secret values were available or added; this foundation plan does not require live Toss calls.

## Self-Check: PASSED

All plan-created files exist, the dedicated tests and typecheck passed, and the SDK/schema/environment acceptance checks passed. Task commit hashes remain pending for the orchestrator as instructed.

## Next Phase Readiness

The payment contract and persistence foundation are ready for the later checkout and webhook plans. Apply migration `0015_payments.sql` to the configured test Supabase before later database integration tests. Use mocks for Toss behavior until test credentials are supplied; no real Toss API was called.

---
*Phase: 05-real-payment-integration*
*Plan: 01*

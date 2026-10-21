---
phase: 11-byok-ux
plan: "09"
subsystem: database
tags: [supabase, migration, ai-usage, idempotency, wallet]
requires: [11-01, 11-04]
provides:
  - "migration 0030: ai_usage.service_settled_at + settle_service_ai_generation RPC"
affects: [11-10, 11-11, 11-12]
key-files:
  created:
    - supabase/migrations/0030_ai_usage_service_settlement.sql
    - tests/ai/ai-service-settlement.database.test.ts
  modified:
    - tests/ai/ai-usage-db.test.ts
requirements-completed: [COST-02]
completed: 2026-10-17
---

# Phase 11 Plan 09: Atomic service settlement DB contract Summary

Migration 0030 adds `ai_usage.service_settled_at` and a service_role-only `settle_service_ai_generation` RPC that records usage, debits through `apply_wallet_delta` and marks completion in one transaction. A zero debit writes no ledger row.

## Commits
- 6409934: feat(11-09) migration 0030
- Tests commit: see git log (`test(11-09)`)

## Decisions
- Idempotency marker is the ai_usage row plus service_settled_at. The wallet is locked FOR UPDATE and the duplicate check runs before any balance check.
- Backfill is evidence-only: a service usage gets service_settled_at from a matching ai_generation ledger row. Nothing is deleted, and old ledgers are only read.
- Not applied to the remote DB; that is left to 11-12.

## Deviations from Plan
**[Rule 3 - Blocking] search_path around apply_wallet_delta.** 0001's `apply_wallet_delta` has no `SET search_path` and uses unqualified table names. Called from a function with `search_path=''` it would fail. The RPC sets `search_path` to `public` (transaction-local) only around that call and then clears it. The shared function is not modified. The RPC itself is still `SET search_path = ''`.

Also skipped: reading the Next.js docs listed in the tasks, since no Next code is touched.

## Test status (honest)
- Live DB (env present) has no 0030. Running `ai-service-settlement.database.test.ts` and `ai-usage-db.test.ts` gives 12 failed / 4 passed. These are the expected RED failures (RPC and column missing), not a GREEN result.
- tsc reports no errors in the touched files. Static migration check passed.
- The DB contract is PENDING until 0030 is applied and the suites run in 11-12. No GREEN claim is made.

## Known Stubs
None.

## Self-Check: PASSED

---
phase: 08-provider-adapter-idempotent-debit
plan: 06
subsystem: wallet/ai
tags: [idempotency, real-postgres, concurrency, COST-01]
requires:
  - 08-03 (chat() idempotencyKey debit, mock-provider helpers)
provides:
  - Real-PostgreSQL evidence for single ai_generation debit per (wallet, key)
affects: [08-07 validation sign-off]
tech-stack:
  added: []
  patterns: [Promise.allSettled race tests, barrier-gated concurrent provider mock]
key-files:
  created: []
  modified:
    - tests/wallet/ledger.concurrency.test.ts
    - tests/ai/chat.test.ts
decisions:
  - "Real DB reachable: evidence recorded as PASS, not BLOCKED"
  - "Last-balance race confirmed: loser raises 'insufficient balance' (balance check precedes ON CONFLICT) but never double-debits"
metrics:
  duration: ~10min
  completed: 2026-09-17
  tasks: 2
  files: 2
---

# Phase 8 Plan 06: Real-DB Idempotent Debit Evidence Summary

COST-01 single-debit behavior proven on the configured Supabase PostgreSQL: SQL-level same-reference races on `apply_wallet_delta` and end-to-end `chat()` replay/concurrency/zero-usage/refusal all leave exactly one `ai_generation` ledger row per (wallet, key).

**DB evidence: PASS** (real Supabase PostgreSQL via SUPABASE_DB_URL + service-role client; no PGlite/mocks for the ledger).

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | SQL-level same-reference concurrency on apply_wallet_delta (4 cases) | fc39c9a |
| 2 | chat() replay / concurrency / zero-usage / other-wallet / refusal on real ledger (5 cases) | 854b1e5 |

## Verification

- `npm test -- tests/wallet/ledger.concurrency.test.ts tests/ai/chat.test.ts`: 24/24 pass (8 + 16).
- `npx tsc --noEmit`: no errors in the two modified test files (remaining errors are 08-05's in-progress AiPanel/actions work).
- `git diff --name-only -- supabase/`: empty. Acceptance greps satisfied (ai_generation >= 4, Promise.allSettled >= 2, already_processed 4, `reference_type', 'ai_generation'` 2, `reasonCode: 'SAFETY'` 1).
- `graphify update .` run; graphify-out/ left uncommitted.

## Deviations from Plan

None - plan executed as written. These are characterization tests for existing RPC / 08-03 behavior, so they passed on first run (no RED phase possible without breaking production code).

## Full-suite failure investigation (out of scope, not fixed)

- Full `npx vitest run`: 9 failed / 604 passed across 10 files (blinding, writer-upgrade, folder-grouping, ownership-guard, commerce db, feed, kb crud, likes, schema-smoke, chapter-read) with `deadlock detected` / `AuthRetryableFetchError: Database error creating new user`. None are phase 8 files.
- Rerunning exactly those 10 files with `--no-file-parallelism`: 9 of 10 pass. So those failures come from test files running in parallel against the shared DB. They are not phase 8 regressions.
- `tests/auth/writer-upgrade.test.ts > rejects a second conversion attempt on an already-writer account` still fails when run by itself (`expected false to be true`). No phase 8 commit touches lib/auth or tests/auth (last change 07-03), so this was already failing before phase 8. Logged here, not fixed.

## Known Stubs

None.

## Self-Check: PASSED

- tests/wallet/ledger.concurrency.test.ts and tests/ai/chat.test.ts exist and are modified.
- Commits fc39c9a, 854b1e5 present in git log.

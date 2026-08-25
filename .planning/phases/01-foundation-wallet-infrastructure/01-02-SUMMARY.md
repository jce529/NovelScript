---
phase: 01-foundation-wallet-infrastructure
plan: 02
subsystem: database
tags: [postgres, supabase, wallet, ledger, concurrency, vitest, rls]

# Dependency graph
requires:
  - phase: 01-01
    provides: Live Supabase project, session-pooler SUPABASE_DB_URL, Vitest configured
provides:
  - profiles/wallets/ledger_entries schema with RLS (self-only select/update, no client-writable balance)
  - apply_wallet_delta(wallet_id, delta, reference_type, reference_id, reason) — row-locking, idempotent, negative-balance-safe wallet mutation function
  - handle_new_user trigger — auto-provisions profile (role=reader) + zero-balance wallet on auth.users insert
  - tests/helpers/db.ts shared test fixtures (pgPool, adminClient, createTestUser, deleteTestUser)
  - Concurrency-proof test suite (100 concurrent ops, no lost updates; idempotent replay; per-wallet isolation; negative-balance rejection)
affects: [01-04, 01-05, phase-04, phase-05, phase-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "apply_wallet_delta: SELECT ... FOR UPDATE inside a single plpgsql transaction, with ON CONFLICT (wallet_id, reference_type, reference_id) DO NOTHING for idempotent replay — the canonical pattern for all future wallet-balance mutations (Phase 4 AI spend, Phase 5/6 payments)"
    - "RLS design: no insert/update/delete policy on wallets/ledger_entries for `authenticated` — all balance mutation MUST go through apply_wallet_delta via a service-role or direct DB connection, never client-writable"
    - "Migration idempotency: DROP POLICY IF EXISTS immediately before each CREATE POLICY, since Postgres CREATE POLICY has no IF NOT EXISTS form — required for scripts/apply-migration.mjs to be safely re-runnable"
    - "Supabase Session Pooler caps concurrent clients at 15 — postgres.js pgPool() must use max <= ~5-10, not the naively-planned 20, to leave headroom; 100 concurrent logical operations are safely multiplexed over a small real connection pool by postgres.js"

key-files:
  created: [supabase/migrations/0001_init.sql, scripts/apply-migration.mjs, tests/helpers/db.ts, tests/wallet/ledger.concurrency.test.ts, tests/auth/profile-provisioning.test.ts]
  modified: [vitest.config.ts]

key-decisions:
  - "No dev/admin UI for granting fake credits — deliberately out of scope per 01-CONTEXT.md's Claude's Discretion; the concurrency proof is delivered entirely via the automated test suite calling apply_wallet_delta directly."
  - "pgPool max lowered from the plan's suggested 20 to 5, discovered via a live 'max clients reached in session mode' error against Supabase's Session Pooler (hard cap 15) — the concurrency test's 100 Promise.all operations are still genuinely concurrent at the application layer; postgres.js multiplexes them over the smaller real connection pool."
  - "vitest.config.ts updated to use Vite's `loadEnv` so `.env.local` vars (SUPABASE_DB_URL etc.) are visible to test code without needing `--env-file` on the vitest invocation itself."

patterns-established:
  - "Idempotent SQL migrations for this project: create table if not exists / create or replace function / drop trigger if exists / drop policy if exists + create policy — every future migration file should follow this shape so scripts/apply-migration.mjs stays safely re-runnable."

requirements-completed: [AUTH-01]

# Metrics
duration: ~4min (agy execution) + verification
completed: 2026-08-26
---

# Phase 1: Foundation & Wallet Infrastructure — Plan 01-02 Summary

**Postgres wallet ledger (profiles/wallets/ledger_entries + apply_wallet_delta row-locking function) proven safe under 100-way concurrent load, with auto-provisioning trigger verified**

## Performance

- **Duration:** ~4 min agy execution (242s), independently re-verified
- **Tasks:** 2 (schema migration, TDD concurrency + provisioning tests)
- **Files modified:** 6 (2 created in Task 1, 3 created + 1 modified in Task 2)

## Accomplishments
- Live schema applied to Supabase: `profiles`, `wallets`, `ledger_entries`, `apply_wallet_delta`, `handle_new_user` trigger, RLS policies — idempotent (verified: re-running `apply-migration.mjs` a second and third time all exit 0)
- Wallet ledger concurrency proven: 100 concurrent `apply_wallet_delta(+10)` calls on one wallet → balance exactly 1000, matching `SUM(ledger_entries.delta)` (no lost updates); over-debit rejected without mutating balance; same idempotency key applied twice only affects balance once; two wallets under interleaved concurrent load each land on correct independent balances
- Auto-provisioning verified: creating a Supabase auth user via the admin API produces exactly one `profiles` row (role=reader) and one `wallets` row (balance=0), no manual insert
- This is the literal Phase 1 goal statement from ROADMAP.md ("the token wallet/ledger is proven safe with fake credits") — independently re-verified by running the full test suite 3 times (all green) outside of agy's own report

## Task Commits

1. **Task 1: Write and apply the wallet/profile schema migration** — `2f24840` (feat)
2. **Task 2: Concurrency-prove the ledger + verify auto-provisioning** — `6d8b95f` (test)

## Files Created/Modified
- `supabase/migrations/0001_init.sql` — profiles/wallets/ledger_entries schema, apply_wallet_delta, handle_new_user trigger, RLS
- `scripts/apply-migration.mjs` — idempotent migration runner (`node --env-file=.env.local scripts/apply-migration.mjs`)
- `tests/helpers/db.ts` — pgPool, adminClient, createTestUser, deleteTestUser
- `tests/wallet/ledger.concurrency.test.ts` — 4 behaviors, 100-way Promise.all concurrency proof
- `tests/auth/profile-provisioning.test.ts` — auto-provisioning proof
- `vitest.config.ts` — added Vite `loadEnv` so `.env.local` is visible to test code

## Decisions Made
- No admin UI for fake-credit granting (Claude's Discretion, explicitly skipped — see key-decisions).
- `pgPool` connection pool size lowered to 5 due to Supabase Session Pooler's hard 15-client cap discovered at test-run time — application-level concurrency (100 simultaneous logical calls via `Promise.all`) is unaffected; only the underlying real TCP connection count changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking] RLS policy creation not idempotent on re-run**
- **Found during:** Task 1 second-run idempotency check
- **Issue:** Postgres `CREATE POLICY` has no `IF NOT EXISTS` form; re-running the migration as originally written would fail on the second run with a duplicate-policy error.
- **Fix:** Added `DROP POLICY IF EXISTS "<name>" ON <table>;` immediately before each `CREATE POLICY` statement.
- **Files modified:** `supabase/migrations/0001_init.sql`
- **Verification:** Independently re-ran `node --env-file=.env.local scripts/apply-migration.mjs` a second time after agy's report — exits 0, all "already exists, skipping" notices, no errors.
- **Committed in:** `2f24840`

**2. [Blocking] Supabase Session Pooler max-clients limit hit at pool size 20**
- **Found during:** Task 2 (first concurrency test run)
- **Issue:** Plan's suggested `pgPool(max = 20)` triggered `EMAXCONNSESSION: max clients reached in session mode` — Supabase's Session Pooler caps concurrent clients at 15.
- **Fix:** Lowered default `max` to 5 in `tests/helpers/db.ts`; postgres.js multiplexes the 100 `Promise.all`-fired logical operations over this smaller real connection pool without weakening the concurrency proof itself (the assertion — no lost updates under genuinely concurrent firing — is unchanged).
- **Files modified:** `tests/helpers/db.ts`, `tests/wallet/ledger.concurrency.test.ts`
- **Verification:** Independently re-ran the full suite 3 times post-agy — all green, no connection errors.
- **Committed in:** `6d8b95f`

**3. [Minor] vitest.config.ts needed explicit env loading**
- **Found during:** Task 2
- **Issue:** Vitest running standalone doesn't automatically expose un-prefixed `.env.local` vars (like `SUPABASE_DB_URL`) to `process.env` inside test files.
- **Fix:** Added Vite's `loadEnv` to `vitest.config.ts`.
- **Files modified:** `vitest.config.ts`
- **Verification:** Tests read `process.env.SUPABASE_DB_URL` successfully.
- **Committed in:** `6d8b95f`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 minor) — all necessary corrections discovered only by actually running the migration/tests against the live Supabase project; no scope creep.
**Impact on plan:** None negative — the phase's core correctness guarantees (no lost updates, no negative balance, idempotent replay, per-wallet isolation) are all still proven exactly as specified.

## Issues Encountered
None beyond the three deviations above, all resolved within Task 1/Task 2 execution.

## User Setup Required
None — this plan needed no new external service configuration (builds entirely on Plan 01-01's already-live Supabase project).

## Next Phase Readiness
- Plan 01-04 (login UI) and 01-05 (writer upgrade, account settings) can now rely on `profiles`/`wallets` existing and auto-provisioning correctly for every new signup.
- Phase 4 (AI Gateway spend) and Phase 5/6 (real payments) should reuse `apply_wallet_delta` exactly — do not hand-roll a new balance-mutation path.
- Flag forward: Supabase Session Pooler's 15-client cap is a hard ceiling for this whole project's connection-pool sizing choices, not just this test suite.

---
*Phase: 01-foundation-wallet-infrastructure*
*Completed: 2026-08-26*

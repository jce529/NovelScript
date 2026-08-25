---
phase: 1
slug: foundation-wallet-infrastructure
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-25
planned: 2026-08-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (installed in Plan 01-01, Wave 0) |
| **Config file** | `vitest.config.ts` (created in Plan 01-01, Task 2 — `node` environment, `tests/**/*.test.ts`, `@` alias) |
| **Quick run command** | `npx vitest run <touched-test-file>` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30-60 seconds (concurrency test opens a real multi-connection Postgres pool; not instant) |

---

## Sampling Rate

- **After every task commit:** Run the specific test file(s) touched by that task (`npx vitest run <file>`)
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green, AND the concurrency test must be run at least once with a meaningfully high parallelism count (50-100 concurrent operations)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-T2 | 01-01 | 0 | (infra) | setup | `npx vitest run` (empty pass) | ❌ created by 01-01 | ⬜ pending |
| 01-02-T2 | 01-02 | 1 | AUTH-01 | integration | `npx vitest run tests/auth/profile-provisioning.test.ts` | ❌ created by 01-02 | ⬜ pending |
| 01-02-T2 | 01-02 | 1 | phase goal (wallet ledger concurrency) | integration | `npx vitest run tests/wallet/ledger.concurrency.test.ts` | ❌ created by 01-02 | ⬜ pending |
| 01-03-T2 | 01-03 | 1 | AUTH-03 | unit (mocked `@supabase/ssr`) + matcher config check | `npx vitest run tests/auth/session-refresh.test.ts` | ❌ created by 01-03 | ⬜ pending |
| 01-04-T1 | 01-04 | 2 | AUTH-01 (D-02) | unit | `npx vitest run tests/auth/email-guard.test.ts` | ❌ created by 01-04 | ⬜ pending |
| 01-05-T1 | 01-05 | 2 | AUTH-02 | integration | `npx vitest run tests/auth/writer-upgrade.test.ts` | ❌ created by 01-05 | ⬜ pending |
| 01-05-T1 | 01-05 | 2 | D-08 (account deletion) | integration | `npx vitest run tests/auth/account-deletion.test.ts` | ❌ created by 01-05 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*All 3 phase requirement IDs (AUTH-01, AUTH-02, AUTH-03) plus the phase-goal wallet-ledger-concurrency proof now map to a concrete automated test file and a specific plan/wave/task. Filled in during `/gsd:plan-phase` — see .planning/phases/01-foundation-wallet-infrastructure/01-0{1..5}-PLAN.md.*

---

## Wave 0 Requirements

Covered by **01-01-PLAN.md** (external service setup, deps, Vitest) and **01-02-PLAN.md** (schema + concurrency proof), both Wave 0/1 with 01-02 depending on 01-01:

- [x] Install and configure Vitest (`vitest.config.ts`, `node` environment) — 01-01, Task 2
- [x] Create a hosted Supabase project; store connection details in `.env.local`, document required vars in `.env.example` — 01-01, Task 1 + Task 2
- [x] Register Google OAuth Client, configure Supabase Google provider — 01-01, Task 1
- [x] Register Kakao Developers app, request Biz App conversion + `account_email` consent approval, configure Supabase Kakao provider — 01-01, Task 1
- [x] Write `wallets` / `ledger_entries` schema migration + `apply_wallet_delta` Postgres function — 01-02, Task 1
- [x] `tests/wallet/ledger.concurrency.test.ts` — 01-02, Task 2
- [x] `tests/auth/profile-provisioning.test.ts` — 01-02, Task 2; `tests/auth/writer-upgrade.test.ts` — 01-05, Task 1; `tests/auth/session-refresh.test.ts` — 01-03, Task 2
- [x] Shared test fixture/helper for a genuine multi-connection `pg.Pool` + Supabase admin client, with test-user teardown — `tests/helpers/db.ts`, 01-02, Task 2

(Checkboxes above mark planning coverage, not execution completion — `wave_0_complete` in frontmatter flips to `true` only once 01-01 and 01-02 have actually run and their SUMMARYs exist.)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Covered By |
|----------|-------------|------------|-------------------|------------|
| Actual browser OAuth redirect round-trip (Google + Kakao consent screens) | AUTH-01 | OAuth provider consent UI cannot be meaningfully automated without a headless-browser + real provider credentials; the scripted test only verifies the resulting `profiles` row, not the redirect UX itself | Manually sign in via Google and via Kakao in a real browser; confirm redirect to callback, session cookie set, `profiles` row created with non-null email | 01-04-PLAN.md, Task 3 (checkpoint:human-verify) |
| Kakao Biz App / `account_email` approval status | AUTH-01, D-02 | External Kakao review process, no API to poll | Check Kakao Developers console directly; if not yet approved, verify the D-02 fallback (manual email entry form) triggers correctly when `email` is null in the OAuth payload | 01-01-PLAN.md, Task 1 (acceptance_criteria) + 01-04-PLAN.md, Task 3 |
| Session persistence across an actual browser refresh (not just simulated cookie round-trip) | AUTH-03 | Full browser refresh behavior (including token expiry timing) is best confirmed by hand once, beyond the unit/integration-level `proxy.ts` cookie test | Log in, wait past token expiry or force-refresh, confirm still logged in and no unexpected redirect to login | Deferred to manual QA alongside 01-04-PLAN.md, Task 3 (same browser session already open) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every `auto`/`tdd` task across all 5 plans has a concrete `<automated>` command; the 2 external/manual tasks (01-01 Task 1, 01-04 Task 3) explicitly document why no automated command exists and what downstream automated check is the closest available proxy
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — longest manual/external run is 1 task (01-01 Task 1, immediately followed by 01-01 Task 2's automated `npx vitest run`)
- [x] Wave 0 covers all MISSING references — 01-01 (Wave 0) + 01-02 (Wave 1, depends on 01-01) jointly deliver every item from RESEARCH.md's "Wave 0 Gaps" list
- [x] No watch-mode flags — all commands use `vitest run`, never `vitest` (watch mode)
- [x] Feedback latency < 60s — concurrency test is the slowest at an estimated 30-60s
- [x] `nyquist_compliant: true` set in frontmatter — set above

**Approval:** planning-complete (pending execution + `/gsd:verify-work`)

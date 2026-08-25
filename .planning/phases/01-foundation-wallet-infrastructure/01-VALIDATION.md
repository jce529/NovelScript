---
phase: 1
slug: foundation-wallet-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (not yet installed — Wave 0 gap) |
| **Config file** | none yet — `vitest.config.ts` created in Wave 0 |
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
| 01-00-xx | 00 | 0 | (infra) | setup | `npx vitest run` (empty pass) | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | AUTH-01 | integration | `npx vitest run tests/auth/profile-provisioning.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | AUTH-02 | integration | `npx vitest run tests/auth/writer-upgrade.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | AUTH-03 | integration | `npx vitest run tests/auth/session-refresh.test.ts` | ❌ W0 | ⬜ pending |
| 01-xx-xx | TBD | TBD | phase goal (wallet ledger concurrency) | integration | `npx vitest run tests/wallet/ledger.concurrency.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*
*Exact task IDs/plan/wave numbers filled in by the planner — this row set is the minimum required coverage from RESEARCH.md's Phase Requirements → Test Map.*

---

## Wave 0 Requirements

- [ ] Install and configure Vitest (`vitest.config.ts`, `node` environment for DB-touching tests)
- [ ] Create a hosted Supabase project; store connection details in `.env.local` (gitignored), document required vars in `.env.example`
- [ ] Register Google OAuth Client (Google Cloud Console), configure Supabase Google provider
- [ ] Register Kakao Developers app, request Biz App conversion + `account_email` consent approval (start immediately — unknown turnaround), configure Supabase Kakao provider
- [ ] Write `wallets` / `ledger_entries` schema migration + `apply_wallet_delta` Postgres function
- [ ] `tests/wallet/ledger.concurrency.test.ts` — core proof-of-correctness test for the phase goal
- [ ] `tests/auth/profile-provisioning.test.ts`, `tests/auth/writer-upgrade.test.ts`, `tests/auth/session-refresh.test.ts`
- [ ] Shared test fixture/helper for a genuine multi-connection `pg.Pool` against the test Supabase project, with teardown resetting wallet/ledger test rows between runs

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual browser OAuth redirect round-trip (Google + Kakao consent screens) | AUTH-01 | OAuth provider consent UI cannot be meaningfully automated without a headless-browser + real provider credentials; the scripted test only verifies the resulting `profiles` row, not the redirect UX itself | Manually sign in via Google and via Kakao in a real browser; confirm redirect to callback, session cookie set, `profiles` row created with non-null email |
| Kakao Biz App / `account_email` approval status | AUTH-01, D-02 | External Kakao review process, no API to poll | Check Kakao Developers console directly; if not yet approved, verify the D-02 fallback (manual email entry form) triggers correctly when `email` is null in the OAuth payload |
| Session persistence across an actual browser refresh (not just simulated cookie round-trip) | AUTH-03 | Full browser refresh behavior (including token expiry timing) is best confirmed by hand once, beyond the unit/integration-level `proxy.ts` cookie test | Log in, wait past token expiry or force-refresh, confirm still logged in and no unexpected redirect to login |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

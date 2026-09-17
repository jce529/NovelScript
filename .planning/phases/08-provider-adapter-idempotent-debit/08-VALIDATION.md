---
phase: 08
slug: provider-adapter-idempotent-debit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-17
---

# Phase 8 — Validation Strategy

Research-derived draft. PLAN.md task IDs/waves are not assigned: planning is paused at the missing UI-SPEC gate. Proposed test filenames below are not implemented.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 4.1.11, Node environment |
| Config | `vitest.config.ts` |
| Existing quick baseline | `npm test -- tests/ai/cost-estimate.test.ts tests/ai/gemini-client.test.ts tests/ai/prompt-composition.test.ts` |
| Phase command after tests exist | `npm test -- tests/ai tests/admin/sanctions.test.ts tests/wallet/ledger.concurrency.test.ts` |
| Full suite command | `npm test` (requires configured services for integration suites) |
| Observed baseline | 3 files / 24 tests passed; 389 ms Vitest duration on 2026-09-17 |
| Planned fast feedback budget | <30 seconds, measure again when tests exist |

## Sampling Rate

- After every task: its explicit offline automated command; no watch mode.
- After every wave: all phase offline regressions and `npx tsc --noEmit`.
- Integration boundary: run actual PostgreSQL concurrency tests when the authorized test environment is available; retain blocked status otherwise.
- Before verify-work: full suite, build, DB evidence, and browser checks; no mock-only sign-off for concurrency/UI.

## Per-Task Verification Map

Rows are provisional behavior IDs, not executable plan task IDs. Planner must replace IDs, dependencies and waves after UI-SPEC exists.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| pending-adapter | TBD | TBD | PROV-01 | T-08-01 | No raw errors, blocked text or keys returned/logged | SDK mock | `npm test -- tests/ai/provider-gemini.test.ts` | No; create | pending |
| pending-estimator | TBD | TBD | PROV-01 | T-08-02 | No remote pre-count; low balance stops provider | unit | `npm test -- tests/ai/token-estimate.test.ts tests/ai/cost-estimate.test.ts` | Partial | pending |
| pending-settlement | TBD | TBD | COST-01 | T-08-03 | Scoped stable key, fail-closed lookup, safe debit failure | unit | `npm test -- tests/ai/chat-idempotency.test.ts` | No; create | pending |
| pending-refusal | TBD | TBD | PROV-01 | T-08-01 | Usage debit before refusal return; no draft/proposal | unit | `npm test -- tests/ai/chat-refusal.test.ts` | No; create | pending |
| pending-action | TBD | TBD | COST-01 | T-08-03 | Session owner; UUID validation; no client owner override | unit | `npm test -- tests/ai/chat-action.test.ts` | No; create | pending |
| pending-sanctions | TBD | TBD | PROV-01 | T-08-04 | Deny before provider and recheck before debit | unit | `npm test -- tests/admin/sanctions.test.ts` | Yes; update | pending |
| pending-ledger | TBD | TBD | COST-01 | T-08-03 | Concurrent debit produces one ledger entry incl. exhausted balance | PostgreSQL | `npm test -- tests/wallet/ledger.concurrency.test.ts tests/ai/chat.test.ts` | Yes; extend | pending |
| pending-client | TBD | TBD | COST-01 | T-08-03 | Same send keeps key/payload; regenerate gets fresh key | unit + browser | `npm test -- tests/ai/chat-request-lifecycle.test.ts` | No; create if helper extracted | pending |

## Wave 0 Requirements

- [ ] Mock SDK response fixtures for prompt-blocked, safety finish reasons, STOP prose, MAX_TOKENS, absent/partial/zero usage.
- [ ] Fake Supabase query/RPC fixture with configurable ledger state and barrier-controlled concurrent provider completion; do not replace actual DB unique/locking evidence with this fake.
- [ ] Secret sentinel fixture in error message/stack/cause/request/config/headers/providerErrorCode; verify logs and serialized return values exclude it.
- [ ] Korean/ASCII/emoji/history/mention estimator fixtures and live calibration instructions without live calls in unit tests.
- [ ] Task IDs and concrete test creation dependencies assigned by planner; every file above must be created before its command is relied on.
- [ ] Keep existing Vitest include `tests/**/*.test.ts`; do not silently add `.tsx` tests that never run.
- [ ] DB fixture cleanup accounts for ledger foreign keys and is limited to created test identities.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|---|---|---|---|
| Normal Gemini generation | PROV-01 | Unit mocks do not prove live adapter/key behavior | In owned test chapter, mention doc; exercise presets/styles and reply/draft/document accept paths; inspect actual wallet delta. |
| Refusal disclosure | PROV-01 | Layout, accessibility, details and balance visibility | Use controlled refusal fixture in browser; verify Korean message, wallet-token unit, remaining balance, keyboard toggle; no blocked text/bubble/draft/proposal. |
| Request lifecycle | COST-01 | Actual UI event sequencing and action transport | Double-click/Enter; simulated response loss; resend unchanged payload/key; then successful regeneration with new key. One debit for same key. |
| Header balance | PROV-01 | Server header refresh is not implied by result field | Success, charged refusal and already-processed return all show current wallet balance without losing editor state. |
| Local estimate calibration | PROV-01 | Provider tokenizer counts require real measurements | Compare estimates to returned prompt usage on representative Korean passages; no runtime countTokens call; record deviations without prompt/log secrets. |

Live refusal accounting remains unverified; do not infer invoice semantics from missing usage. Live DB connectivity was not rechecked during research. Respect any existing DB test deferral and record blockers accurately.

## Validation Sign-Off

- [ ] UI-SPEC exists and its acceptance checks are mapped.
- [ ] All plan tasks have automated verification or explicit fixture dependencies.
- [ ] No three consecutive tasks lack automated checks.
- [ ] Missing test files are covered by creation tasks.
- [ ] Actual database concurrency and low-balance replay are verified.
- [ ] No watch-mode flags; feedback latency measured.
- [ ] `nyquist_compliant: true` only after plan coverage validation.

**Approval:** pending. This document records a strategy, not completed feature verification.

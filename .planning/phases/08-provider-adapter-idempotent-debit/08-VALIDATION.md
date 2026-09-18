---
phase: 08
slug: provider-adapter-idempotent-debit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-17
---

# Phase 8 — Validation Strategy

Research-derived strategy. Task IDs and waves mapped to PLAN.md files on 2026-09-17 (9 plans, 5 waves). Test files listed are created by the task that relies on them.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 4.1.11, Node environment |
| Config | `vitest.config.ts` |
| Existing quick baseline | `npm test -- tests/ai/cost-estimate.test.ts tests/ai/gemini-client.test.ts tests/ai/prompt-composition.test.ts` (gemini-client test is removed in 08-07) |
| Phase offline command (after 08-08) | `npm test -- tests/ai/provider-errors.test.ts tests/ai/token-estimate.test.ts tests/ai/cost-estimate.test.ts tests/ai/prompt-composition.test.ts tests/ai/provider-gemini.test.ts tests/ai/provider-fixture.test.ts tests/ai/chat-idempotency.test.ts tests/ai/chat-refusal.test.ts tests/ai/chat-action.test.ts tests/ai/chat-request-lifecycle.test.ts tests/ai/ai-panel-notice.test.ts tests/admin/sanctions.test.ts` |
| Phase DB command | `npm test -- tests/wallet/ledger.concurrency.test.ts tests/ai/chat.test.ts` (requires configured Supabase/Postgres) |
| Full suite command | `npm test` (requires configured services for integration suites) |
| Observed baseline | 3 files / 24 tests passed; 389 ms Vitest duration on 2026-09-17 |
| Planned fast feedback budget | <30 seconds, measure again when tests exist |

## Sampling Rate

- After every task: its explicit offline automated command; no watch mode.
- After every wave: all phase offline regressions and `npx tsc --noEmit` (waves 2-3 may show type errors ONLY in `actions.ts` / `AiPanel.tsx` until 08-05 / 08-07 land; each plan's acceptance criteria filter exactly those files).
- Integration boundary: run actual PostgreSQL concurrency tests (08-06) when the authorized test environment is available; retain blocked status otherwise.
- Before verify-work: full suite, build, DB evidence, and browser checks (08-09); no mock-only sign-off for concurrency/UI.

## Wave Structure

| Wave | Plans | Notes |
|---|---|---|
| 1 | 08-01 | Contracts, error scrubbing, local estimator |
| 2 | 08-02, 08-03, 08-04 | Gemini adapter / chat orchestration / client lifecycle + notice (parallel, no shared files) |
| 3 | 08-05, 08-06 | chatAction boundary / real-DB ledger evidence (parallel) |
| 4 | 08-07, 08-08 | AiPanel wiring + legacy removal / dev fixtures (parallel) |
| 5 | 08-09 | Full gate + human browser/live verification (checkpoint) |

Execution note: plans in the same wave have no shared files and may run in parallel under /gsd:execute-phase, but under codex-tdd-pipeline run same-wave plans **sequentially** (one `codex exec` at a time) so intermediate `tsc`/test runs do not observe another plan's half-applied edits.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| 08-01-T1 | 08-01 | 1 | PROV-01, COST-01 | — | Shared contracts + UI-SPEC copy | unit | `npm test -- tests/ai/provider-errors.test.ts` | No; created by task | green |
| 08-01-T2 | 08-01 | 1 | PROV-01 | T-08-01 | Allowlist scrubbing; sentinel never in result/error/log | unit | `npm test -- tests/ai/provider-errors.test.ts` | No; created by task | green |
| 08-01-T3 | 08-01 | 1 | PROV-01 | T-08-02 | Offline estimate with Gemini named constants | unit | `npm test -- tests/ai/token-estimate.test.ts tests/ai/cost-estimate.test.ts` | Partial | green |
| 08-02-T1 | 08-02 | 2 | PROV-01 | T-08-01 | Refusal A/B normalized; no partial/blocked text; usage mapping | SDK mock | `npm test -- tests/ai/provider-gemini.test.ts` | No; created by task | green |
| 08-02-T2 | 08-02 | 2 | PROV-01 | T-08-01 | One SDK attempt; sanitized throw; no countTokens; registry config error | SDK mock | `npm test -- tests/ai/provider-gemini.test.ts tests/ai/provider-errors.test.ts` | No; created by task | green |
| 08-03-T1 | 08-03 | 2 | COST-01 | T-08-03 | Stable key, scoped fail-closed precheck, settlement recovery, barrier concurrency, local cap | unit (fake ledger) | `npm test -- tests/ai/chat-idempotency.test.ts` | No; created by task | green |
| 08-03-T2 | 08-03 | 2 | PROV-01, COST-01 | T-08-01 | Refusal debited then returned without body; error kinds; scrubbed logs; D-04 same-key resend after failure debits once | unit | `npm test -- tests/ai/chat-refusal.test.ts` | No; created by task | green |
| 08-03-T3 | 08-03 | 2 | PROV-01 | T-08-04 | Deny before provider, recheck before debit (unchanged) | unit | `npm test -- tests/admin/sanctions.test.ts` | Yes; update | green |
| 08-04-T1 | 08-04 | 2 | COST-01 | T-08-03 | Same send keeps key/payload; lock; result→notice decision table | unit | `npm test -- tests/ai/chat-request-lifecycle.test.ts` | No; created by task | green |
| 08-04-T2 | 08-04 | 2 | PROV-01 | T-08-01 | Notice markup/copy/aria; no provider/status/key shown | static markup | `npm test -- tests/ai/ai-panel-notice.test.ts` | No; created by task | green |
| 08-05-T1 | 08-05 | 3 | COST-01 | T-08-03 | Session owner; UUID validation; config failure scrubbed | unit | `npm test -- tests/ai/chat-action.test.ts` | No; created by task | green |
| 08-06-T1 | 08-06 | 3 | COST-01 | T-08-03 | Same-reference concurrent debit = one row, incl. exhausted balance; zero delta | PostgreSQL | `npm test -- tests/wallet/ledger.concurrency.test.ts` | Yes; extend | green |
| 08-06-T2 | 08-06 | 3 | COST-01 | T-08-03 | chat() replay / concurrency / zero usage / cross-wallet / refusal on real ledger | PostgreSQL | `npm test -- tests/ai/chat.test.ts` | Yes; extend | green |
| 08-07-T1 | 08-07 | 4 | COST-01 | T-08-03 | AiPanel lifecycle wiring compiles against new action | typecheck | `npx tsc --noEmit` | Yes; update | green |
| 08-07-T2 | 08-07 | 4 | PROV-01 | — | Legacy client removed; full offline gate | unit + typecheck | see 08-07 Task 2 `<verify>` | — | green |
| 08-08-T1 | 08-08 | 4 | PROV-01 | T-08-05 | Dev fixtures inert outside development | unit | `npm test -- tests/ai/provider-fixture.test.ts tests/ai/chat-action.test.ts` | No; created by task | green |
| 08-09-T1 | 08-09 | 5 | Both | — | Full gate + build + DB evidence recorded | all | see 08-09 Task 1 | — | red (build: pre-existing /admin prerender failure; tsc, offline, DB green) |
| 08-09-T2 | 08-09 | 5 | Both | — | Browser + live Gemini checks | manual | — | — | pending (awaiting user checkpoint) |

Threat refs: T-08-01 secret / blocked-text leakage; T-08-02 unbounded spend without remote pre-count; T-08-03 double debit or cross-wallet key reuse; T-08-04 suspended writer generation; T-08-05 canned output reachable outside development.

## Wave 0 Requirements

- [ ] Mock SDK response fixtures for prompt-blocked, safety finish reasons, STOP prose, MAX_TOKENS, absent/partial/zero usage. (08-02-T1)
- [ ] Fake Supabase query/RPC fixture with configurable ledger state and barrier-controlled concurrent provider completion; do not replace actual DB unique/locking evidence with this fake. (08-03-T1 `tests/helpers/fake-ledger-admin.ts`)
- [ ] Secret sentinel fixture in error message/stack/cause/request/config/headers/providerErrorCode; verify logs and serialized return values exclude it. (08-01-T2, 08-02-T2, 08-03-T2, 08-05-T1)
- [ ] Korean/ASCII/emoji/history/mention estimator fixtures and live calibration instructions without live calls in unit tests. (08-01-T3, 08-09-T2 step A4)
- [x] Task IDs and concrete test creation dependencies assigned by planner; every file above must be created before its command is relied on.
- [ ] Keep existing Vitest include `tests/**/*.test.ts`; do not silently add `.tsx` tests that never run. (08-04-T2 acceptance)
- [ ] DB fixture cleanup accounts for ledger foreign keys and is limited to created test identities. (08-06)

## Execution Evidence

Recorded 2026-09-17 by 08-09 Task 1 (Windows 11, Node, Vitest 4.1.11). No secrets or URLs recorded.

| Gate | Command | Exit | Result |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | 0 | clean |
| Phase offline suite | `npm test -- tests/ai/provider-errors.test.ts ... tests/admin/sanctions.test.ts` (12 files) | 0 | 12 files / 240 tests passed; 806 ms |
| Phase DB suite (real Supabase PostgreSQL) | `npm test -- tests/wallet/ledger.concurrency.test.ts tests/ai/chat.test.ts --no-file-parallelism` | 0 | 2 files / 24 tests passed; 7.3 s. PASS, not BLOCKED |
| Production build | `npm run build` | 1 | Compile + TypeScript succeed; static prerender of `/admin` fails with `admin_authorization_unavailable` (lib/admin/auth.ts:105, phase 07 code, untouched by phase 8). Pre-existing; logged in deferred-items.md |
| No remote pre-count | `grep -rn "countTokens" lib app` | 1 (no match) | empty |

Known pre-existing, out of scope: eslint react-hooks/set-state-in-effect in MentionAutocomplete.tsx and QuickAddDialog.tsx; tests/auth/writer-upgrade.test.ts "rejects a second conversion attempt"; full-suite DB flakiness under file parallelism (deadlock / user creation), which passes with `--no-file-parallelism`.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions | Result |
|---|---|---|---|---|
| Normal Gemini generation | PROV-01 | Unit mocks do not prove live adapter/key behavior | 08-09 step A: in owned test chapter, mention doc; exercise presets/styles and reply/draft/document accept paths; inspect actual wallet delta. | pending (08-09 checkpoint) |
| Refusal disclosure | PROV-01 | Layout, accessibility, details and balance visibility | 08-09 step C with `AI_PROVIDER_FIXTURE=refusal-input/refusal-output`: Korean message, wallet-token unit, remaining balance, keyboard toggle; no blocked text/bubble/draft/proposal. | **pass** (2026-09-18, Chrome): both fixtures show the 안전 정책 title, `2토큰 사용 · 보유 토큰 N`, reason collapsed by default and toggled with keyboard Enter (aria-expanded false→true), reasons `입력 차단 · SAFETY` / `생성 중 차단 · RECITATION`; no bubble; input restored + focused; ledger +1 row (−2) each. |
| Request lifecycle | COST-01 | Actual UI event sequencing and action transport | 08-09 steps B, D, E, F: double-click/Enter (`slow`); response loss (`drop-response`) then resend same key → processed; regeneration uses a new key. One debit for same key. | **pass** (2026-09-18, Chrome): B `slow` double-click + Enter×3 → 1 bubble, 1 reply, ledger ai_generation 95→96 (−1). D rate_limited/unavailable/config → correct Korean titles, focus on 다시 시도, retry keeps 1 bubble, no provider/status text, ledger unchanged. E `drop-response` → POST 500 + unavailable notice, ledger +1 (−1); 다시 시도 → `이미 처리된 요청이에요` + `보유 토큰 10,985`, input restored, ledger unchanged (no double debit). F client fetch rejected → unavailable notice, pending indicator cleared, retry focusable. Layout: panel 384px, notice above input, no x-overflow. Dark mode / 200% zoom not checked. |
| Header balance | PROV-01 | Server header refresh is not implied by result field | Success, charged refusal and already-processed all show current wallet balance without losing editor state (steps A, C, E). | pending (08-09 checkpoint) |
| Local estimate calibration | PROV-01 | Provider tokenizer counts require real measurements | Compare estimates to returned prompt usage on representative Korean passages; no runtime countTokens call; record deviations without prompt/log secrets. | **superseded** (2026-09-18): live Gemini lite on 3 Korean passages — local estimate 285/312/627 vs reported input 90/98/209 (~3× over). User decision: remove the local estimate entirely. Output cap now comes from the whole wallet balance; debit uses actual usage clamped to the pre-call balance. No runtime countTokens (grep clean). Thinking tokens (~245/call) are reported but not debited — open billing-policy question. |

Live refusal accounting remains unverified; do not infer invoice semantics from missing usage. Live DB connectivity was not rechecked during research or planning. Respect any existing DB test deferral and record blockers accurately.

## Validation Sign-Off

- [x] UI-SPEC exists and its acceptance checks are mapped (08-04, 08-07, 08-09).
- [x] All plan tasks have automated verification or explicit fixture dependencies.
- [x] No three consecutive tasks lack automated checks.
- [x] Missing test files are covered by creation tasks.
- [ ] Actual database concurrency and low-balance replay are verified.
- [ ] No watch-mode flags; feedback latency measured.
- [ ] `nyquist_compliant: true` only after plan coverage validation.

**Approval:** pending. This document records a strategy, not completed feature verification.

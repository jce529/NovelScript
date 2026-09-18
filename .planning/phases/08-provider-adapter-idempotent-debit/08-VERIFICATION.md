---
phase: 08-provider-adapter-idempotent-debit
verified: 2026-09-18T16:20:00Z
status: passed
score: 4/4 success criteria verified (plan must-haves 38/38 verified; 3 superseded by the documented user decision of 2026-09-18)
re_verification: false
---

# Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정 Verification Report

**Phase Goal:** Gemini 생성 경로가 공통 `ProviderClient` 어댑터 뒤로 이관되어도 작가 눈에는 아무것도 달라지지 않고, 동시에 현존하는 이중 차감 버그가 사라진다.
**Verified:** 2026-09-18
**Status:** passed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The writer generates with Gemini exactly as before: @mentions, 3 presets, 4 styles, and [REPLY]/[DRAFT]/[DOCUMENT] parsing all work | VERIFIED | `lib/ai/prompt.ts` and `lib/ai/mentions.ts` are unchanged since the start of phase 8 (git diff is empty). `chat.ts` still calls `getMentionedNodesContent`, `composeSystemInstruction`, `assembleUserContent` and `parseChatResponse`. The Gemini adapter sends model / systemInstruction / contents / maxOutputTokens / temperature 0.9. The live Gemini browser check (08-VALIDATION.md step A) passed and the user approved it. |
| 2 | Retrying the same call debits the wallet only once | VERIFIED | `chat.ts` sets `p_reference_type: 'ai_generation'` and `p_reference_id: input.idempotencyKey`. It runs a ledger precheck, a recheck before the debit, and a re-read after a settlement error. `chatAction` validates `z.string().uuid()` and passes the key through unchanged. AiPanel creates one frozen attempt per send, uses a synchronous lock, and on retry resends the same attempt. The real PostgreSQL tests pass (24/24, rerun today). The browser checks for double-click (B) and drop-response (E) each showed exactly one debit. |
| 3 | The pre-call cost cap works without a remote `countTokens` call | VERIFIED (superseded by user decision) | Per the user decision (commit 4744506), the local estimate was removed. `computeMaxOutputTokens({walletBalance, modelTier})` sets the cap from the whole balance, and a balance of 0 stops before the provider call. The debit is `Math.min(walletBalance, computeDebitAmount(actual usage))`. `grep countTokens lib app` finds nothing, and `provider-gemini.test.ts` asserts that `sdk.countTokens` is never called. The debit is still based on actual provider usage. |
| 4 | A safety refusal shows a Korean notice instead of English text rendered as the creative result | VERIFIED | `mapGeminiResponse` normalizes a prompt block (input) and a safety-family finishReason (output) to `text: ''` plus a refusal. `chat.ts` checks for the refusal and returns `status: 'refused'` before `parseChatResponse`. AiPanel handles this through `resolveChatOutcome`, which leads to an `AiPanelNotice` with a collapsed "거절 사유 보기" section. Browser check C passed. |

**Score:** 4/4

### Plan must-haves (summary)

| Plan | Result | Notes |
|------|--------|-------|
| 08-01 | VERIFIED / partly superseded | `types.ts`, `models.ts`, `errors.ts` (sanitizes to 4 keys, `ProviderCallError`, `logProviderFailure`) and `chat-result.ts` all exist. `lib/ai/token-estimate.ts` and `GEMINI_TOKEN_ESTIMATE` were **deleted by user decision** (superseded). |
| 08-02 | VERIFIED / 1 key_link superseded | `gemini.ts` is the only `@google/genai` import. It sets `retryOptions: { attempts: 1 }` and wraps errors as `new ProviderCallError(toSanitizedProviderError(...))`. The mapping is usage `promptTokenCount` / `candidatesTokenCount`. The `estimateGeminiInputTokens` link is superseded: the tests assert that the `estimateInputTokens` property is absent. `registry.ts` provides `createPlatformProvider`. |
| 08-03 | VERIFIED / 1 truth superseded | The stable key, fail-closed precheck, cross-wallet isolation, re-read after a debit error, refusal debit, error kinds and scrubbed logs are all present in `chat.ts`. `crypto.randomUUID()` no longer appears in `chat.ts`. The truth "cap uses client.estimateInputTokens" is superseded by the balance-based cap. |
| 08-04 | VERIFIED | `chat-request.ts` has `createSendAttempt` (deep-frozen), `createSendLock`, `resolveChatOutcome` and `thrownChatNotice`. `AiPanelNotice.tsx` contains "거절 사유 보기". |
| 08-05 | VERIFIED | `chatAction` checks UUID validity, takes `ownerId: user.id` from the session and lists fields explicitly. It calls `createPlatformProvider()`, and a config failure is sanitized and logged. |
| 08-06 | VERIFIED | `ledger.concurrency.test.ts` and `chat.test.ts` cover real-DB replay, concurrency, zero usage and cross-wallet cases. Rerun today: 24/24 passed. |
| 08-07 | VERIFIED | AiPanel sends `idempotencyKey: attempt.idempotencyKey` and uses `resolveChatOutcome(`, `<AiPanelNotice` and `router.refresh()`. The lock is acquired before the first await and released in `finally`. `lib/ai/gemini.ts` is deleted. |
| 08-08 | VERIFIED | `fixture.ts` has 7 modes and is gated to `NODE_ENV === 'development'`. `registry.ts` checks `readProviderFixture(env)` before `GEMINI_API_KEY`. drop-response throws once per key in `chatAction`. |
| 08-09 | VERIFIED | 08-VALIDATION.md contains `nyquist_compliant: true`, the browser results for A–F and the user approval (2026-09-18). The A4 estimator calibration was measured and then superseded by the removal decision. |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `lib/ai/providers/types.ts` | VERIFIED | Defines `ProviderClient` with `generateContent` only (no estimator, by decision) |
| `lib/ai/providers/models.ts` | VERIFIED | `MODEL_TIER_TO_ID` |
| `lib/ai/providers/errors.ts` | VERIFIED | Sanitizes by allowlist; logs `{provider,status,kind,idempotencyKey}` |
| `lib/ai/providers/gemini.ts` | VERIFIED | Wired through registry |
| `lib/ai/providers/registry.ts` | VERIFIED | Used by chatAction |
| `lib/ai/providers/fixture.ts` | VERIFIED | Dev-only |
| `lib/ai/chat.ts` | VERIFIED | Orchestration as described above |
| `lib/ai/chat-result.ts`, `lib/ai/chat-request.ts` | VERIFIED | Imported by chat.ts, actions.ts and AiPanel |
| `lib/ai/cost.ts` | VERIFIED | Balance-based cap and actual-usage debit |
| `AiPanel.tsx`, `AiPanelNotice.tsx` | VERIFIED | Wired as described above |
| `lib/ai/token-estimate.ts` | SUPERSEDED (deleted) | Removed by user decision, commit 4744506 |
| `lib/ai/gemini.ts` (legacy) | Correctly absent | Removed in 08-07 |
| Test files (`provider-gemini`, `chat-idempotency`, `chat-refusal`, `chat-action`, `chat-request-lifecycle`, `ai-panel-notice`, `provider-fixture`, `chat.test`, `ledger.concurrency`) and helpers (`fake-ledger-admin`, `mock-provider`) | VERIFIED | All exist and pass |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| AiPanel | chatAction | `idempotencyKey: attempt.idempotencyKey` | WIRED |
| chatAction | registry | `createPlatformProvider()` | WIRED |
| chatAction | chat() | `idempotencyKey: parsed.data.idempotencyKey, ownerId: user.id` | WIRED |
| registry | fixture / gemini | `readProviderFixture(env)` then `createGeminiProvider` | WIRED |
| chat.ts | ledger_entries | scoped lookup on `wallet_id` + `ai_generation` + key | WIRED |
| chat.ts | apply_wallet_delta | `p_reference_id: input.idempotencyKey` | WIRED |
| chat.ts | errors.ts | `logProviderFailure(` in the provider catch | WIRED |
| chat.ts | refusal branch | `if (result.refusal)` placed before `parseChatResponse` | WIRED |
| gemini.ts | errors.ts | `new ProviderCallError(toSanitizedProviderError` | WIRED |
| AiPanel | AiPanelNotice / router | `<AiPanelNotice`, `router.refresh()` when `refreshBalance` | WIRED |
| gemini.ts | token-estimate.ts | `estimateGeminiInputTokens` | SUPERSEDED (removed by decision) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| AiPanel messages / notice | `ChatResult` | `chatAction` → `chat()` → provider + `apply_wallet_delta` | Yes (live Gemini + DB) | FLOWING |
| Balance display | `remainingBalance` / `router.refresh()` | `wallets.balance` | Yes (browser check matched DB) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Typecheck | `npx tsc --noEmit` | exit 0 | PASS |
| Offline AI and admin suites (including DB-backed chat.test) | `npx vitest run tests/ai tests/admin` | 24 files / 475 tests passed | PASS |
| Real-DB ledger idempotency | `npx vitest run tests/wallet/ledger.concurrency.test.ts tests/ai/chat.test.ts --no-file-parallelism` | 2 files / 24 tests passed | PASS |
| No runtime remote pre-count | `grep -rn countTokens lib app` | no match | PASS |
| Build | `npm run build` | not rerun; fails on the /admin prerender | SKIP (pre-existing from phase 7, BUG-03 / deferred-items.md) |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| PROV-01 | 08-01..05, 07..09 | Gemini generation unchanged after moving to the common adapter | SATISFIED | Truths 1, 3, 4; prompt/mention code unchanged; live browser check A |
| COST-01 | 08-01, 03..09 | Idempotent service-key debit | SATISFIED | Truth 2; real-DB concurrency tests; browser checks B and E |

No orphaned requirements: REQUIREMENTS.md maps only PROV-01 and COST-01 to Phase 8, and both are claimed by the plans. The REQUIREMENTS.md checkboxes are still `[ ]`; updating them is the orchestrator's bookkeeping.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/ai/cost.ts` | ~52 | Stale comment: says a near-empty wallet "may overshoot ... and hit settlement", but `chat.ts` now clamps the debit to the balance | Info | Documentation only |
| `lib/ai/chat.ts` | debit | Clamp `Math.min(walletBalance, …)` lets a near-empty wallet receive a body whose true cost is above the balance (the platform absorbs the difference) | Info | Intended by user decision; bounded by the 2048 output cap, but input size is unbounded by balance |
| `lib/ai/providers/gemini.ts` | usage | `thoughtsTokens` reported but not debited | Info | Tracked as BUG-04 (billing-policy decision pending) |
| `lib/ai/cost.ts` / `types.ts` | — | `ModelTier` declared in two places | Info | Harmless duplication |

No blocker or warning anti-patterns. No TODO or placeholder stubs were found in the phase files.

### Human Verification

Already completed and approved by the user on 2026-09-18 (08-VALIDATION.md): live Gemini check A, fixture checks B–F, balance refresh and layout. Nothing further is required for this phase.

### Gaps Summary

None. All four success criteria hold in the codebase. Criterion 3 was reshaped by a documented user decision: the local estimator was removed, the cap is now balance-based, the debit is actual usage clamped to the balance, and no remote `countTokens` call exists. That replacement behavior is implemented and covered by unit tests (`chat-idempotency.test.ts`: zero-balance stop, balance cap, and clamped debit that still returns the body). The known issues BUG-01..06 are either pre-existing or policy questions outside this phase's goal. The ROADMAP wording of success criterion 3 ("로컬 추정으로 전환") could be updated to reflect the decision.

---

_Verified: 2026-09-18_
_Verifier: Claude (gsd-verifier)_

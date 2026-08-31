---
status: complete
phase: 04-ai-gateway-mention-based-generation
source: [04-VERIFICATION.md]
started: 2026-08-30T07:15:00.000Z
updated: 2026-08-31T00:00:00.000Z
---

## Current Test

[testing complete]

## Tests

### 1. Live Gemini generation round-trip with a real GEMINI_API_KEY
expected: Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview (not "(mock) 생성된 본문") within GenerationPreview, matching the composed system instruction/context.
result: issue
reported: "{\"error\":{\"code\":404,\"message\":\"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements. We recommend you to use the Interactions API.\",\"status\":\"NOT_FOUND\"}}"
severity: blocker

### 2. Live token-cost estimate accuracy
expected: The "예상 토큰" value shown in AiPanel updates ~500ms after changing model tier/genre/preset/style/mentions, and reflects Gemini's real countTokens response for the actual composed prompt (not the mock's fixed 10).
result: skipped
reason: Same root cause as Test 1 (deprecated gemini-2.5-flash model ID blocks all live Gemini calls) — deferred until fix lands.

### 3. Wallet debit against a real balance after a real Gemini call
expected: After a live generation completes, the wallet balance decreases by computeDebitAmount()'s value computed from the REAL response.usageMetadata (promptTokenCount/candidatesTokenCount), and a ledger_entries row is created with reference_type='ai_generation'.
result: skipped
reason: Same root cause as Test 1 (deprecated gemini-2.5-flash model ID blocks all live Gemini calls) — deferred until fix lands.

### 4. Low-balance / balance-exhausted banner with a real generation call
expected: With a near-zero or zero wallet balance, clicking 생성하기 either (a) shows the "보유 토큰을 모두 사용해서 생성할 수 없어요" error with no Gemini call made (balance already 0), or (b) completes a real but token-capped generation and GenerationPreview shows the "토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 생성됐어요." banner.
result: skipped
reason: Same root cause as Test 1 (deprecated gemini-2.5-flash model ID blocks all live Gemini calls) — deferred until fix lands.

### 5. Regeneration with free-text feedback against a real Gemini call
expected: Typing feedback (e.g. "더 짧게") in GenerationPreview's free-text row and pressing Enter produces a NEW real generation whose content is visibly influenced by the feedback, replacing the old preview.
result: skipped
reason: Same root cause as Test 1 (deprecated gemini-2.5-flash model ID blocks all live Gemini calls) — deferred until fix lands.

## Summary

total: 5
passed: 0
issues: 1
pending: 0
skipped: 4
blocked: 0

## Gaps

- truth: "Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview within GenerationPreview."
  status: failed
  reason: "User reported: {\"error\":{\"code\":404,\"message\":\"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements. We recommend you to use the Interactions API.\",\"status\":\"NOT_FOUND\"}}"
  severity: blocker
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

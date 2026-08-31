---
status: testing
phase: 04-ai-gateway-mention-based-generation
source: [04-VERIFICATION.md]
started: 2026-08-30T07:15:00.000Z
updated: 2026-08-31T00:00:00.000Z
---

## Current Test

number: 1
name: Live Gemini generation round-trip with a real GEMINI_API_KEY
expected: |
  Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview (not "(mock) 생성된 본문") within GenerationPreview, matching the composed system instruction/context.
awaiting: user response

## Tests

### 1. Live Gemini generation round-trip with a real GEMINI_API_KEY
expected: Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview (not "(mock) 생성된 본문") within GenerationPreview, matching the composed system instruction/context.
result: [pending]

### 2. Live token-cost estimate accuracy
expected: The "예상 토큰" value shown in AiPanel updates ~500ms after changing model tier/genre/preset/style/mentions, and reflects Gemini's real countTokens response for the actual composed prompt (not the mock's fixed 10).
result: [pending]

### 3. Wallet debit against a real balance after a real Gemini call
expected: After a live generation completes, the wallet balance decreases by computeDebitAmount()'s value computed from the REAL response.usageMetadata (promptTokenCount/candidatesTokenCount), and a ledger_entries row is created with reference_type='ai_generation'.
result: [pending]

### 4. Low-balance / balance-exhausted banner with a real generation call
expected: With a near-zero or zero wallet balance, clicking 생성하기 either (a) shows the "보유 토큰을 모두 사용해서 생성할 수 없어요" error with no Gemini call made (balance already 0), or (b) completes a real but token-capped generation and GenerationPreview shows the "토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 생성됐어요." banner.
result: [pending]

### 5. Regeneration with free-text feedback against a real Gemini call
expected: Typing feedback (e.g. "더 짧게") in GenerationPreview's free-text row and pressing Enter produces a NEW real generation whose content is visibly influenced by the feedback, replacing the old preview.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

- truth: "Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview within GenerationPreview."
  status: fixed
  reason: "User reported: {\"error\":{\"code\":404,\"message\":\"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements. We recommend you to use the Interactions API.\",\"status\":\"NOT_FOUND\"}}"
  severity: blocker
  test: 1
  root_cause: "gemini-2.5-flash and gemini-2.5-pro are both 404 'no longer available to new users' on a freshly created (2026-08-31) AI Studio API key — Google restricts new keys to the 3.x model generation regardless of the models/pricing docs still listing 2.5 as GA. Verified via direct API calls: gemini-2.5-pro also 404s (not just flash); gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.1-flash-lite all work on this key; gemini-3.1-pro-preview exists (not 404) but 429s (quota exceeded) on the free tier — needs billing enabled on the same project (no new key needed) plus a code change to actually call it."
  artifacts:
    - path: "lib/ai/gemini.ts"
      issue: "MODEL_TIER_TO_ID mapped lite/pro to gemini-2.5-flash/gemini-2.5-pro, both retired for new keys"
    - path: "lib/ai/cost.ts"
      issue: "GEMINI_PRICING_USD_PER_MILLION hardcoded 2.5-flash/2.5-pro list pricing, now stale"
  missing:
    - "Repoint MODEL_TIER_TO_ID (lite, pro) at a model ID that actually works on the user's key — done: both now gemini-3.5-flash per user decision (unify to flash for the prototype; move pro to gemini-3.1-pro-preview once billing is enabled)"
    - "Update GEMINI_PRICING_USD_PER_MILLION to match whatever model is actually called, so computeDebitAmount()/computeMaxOutputTokens() don't drift from real Gemini billing"
  debug_session: ""

---
status: testing
phase: 04-ai-gateway-mention-based-generation
source: [04-VERIFICATION.md]
started: 2026-08-30T07:15:00.000Z
updated: 2026-10-02T02:00:00.000Z
---

## Current Test

[testing complete — 3번 PARTIAL(SEED-002 후 재검증), 2번 skipped]

## Tests

### 1. Live Gemini generation round-trip with a real GEMINI_API_KEY
expected: Clicking 생성하기 with mentions/preset/style/genre selected produces a real, non-mock generated Korean prose preview (not "(mock) 생성된 본문") within GenerationPreview, matching the composed system instruction/context.
result: PASS (2026-10-02, 브라우저 실사용 계정 "버그 재현용 작품" 1화) — 실제 Gemini 3.5 Flash 호출로 한국어 본문 생성 확인(mock 문구 아님). 단, UI가 GenerationPreview 방식에서 AI 어시스턴트 채팅 방식으로 바뀌어 있어 채팅 응답/"본문 초안"/"본문에 삽입하기" 기준으로 확인함.

### 2. Live token-cost estimate accuracy
expected: The "예상 토큰" value shown in AiPanel updates ~500ms after changing model tier/genre/preset/style/mentions, and reflects Gemini's real countTokens response for the actual composed prompt (not the mock's fixed 10).
result: skipped
reason: "해당 UI 소멸 — AiPanel의 '예상 토큰'(countTokens, 500ms 갱신)은 현재 '입력 1,000 + 출력 1,000 토큰 기준 약 N 지갑 토큰'이라는 고정 예시 문구(AiPanel.tsx exampleCost)로 대체됨. 후속은 .planning/seeds/SEED-002-streaming-token-usage.md (실시간 토큰 표시)로 이관. a(countTokens 사전 추정)는 하지 않기로 결정."

### 3. Wallet debit against a real balance after a real Gemini call
expected: After a live generation completes, the wallet balance decreases by computeDebitAmount()'s value computed from the REAL response.usageMetadata (promptTokenCount/candidatesTokenCount), and a ledger_entries row is created with reference_type='ai_generation'.
result: PARTIAL (2026-10-02) — 원장 생성·차감·잔액 감소(ai_generation, -2 x3)는 확인. 실제 usageMetadata 대비 차감액 대조는 미완: 사용량(입력/출력/thoughts 토큰)이 어디에도 저장되지 않아 사후 대조 불가, 직접 호출 대조는 Gemini 503으로 실패. SEED-002(스트리밍 + 최종 usageMetadata 저장) 구현 후 재검증.

### 4. Low-balance / balance-exhausted banner with a real generation call
expected: With a near-zero or zero wallet balance, clicking 생성하기 either (a) shows the "보유 토큰을 모두 사용해서 생성할 수 없어요" error with no Gemini call made (balance already 0), or (b) completes a real but token-capped generation and GenerationPreview shows the "토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 생성됐어요." banner.
result: PASS (2026-10-02) — 지갑 잔액을 apply_wallet_delta(UAT_ADJUST)로 조작해 검증 후 원래 값(10958)으로 복구. (a) 잔액 0: "보유 토큰을 모두 사용해서 대화할 수 없어요." 오류 표시(문구가 "생성할"→"대화할"로 변경됨), Gemini 호출·ai_generation 원장 행 없음. (b) 잔액 1: 실제 호출이 토큰 상한으로 잘려 "토큰이 모두 소진됐어요 / 남은 토큰 범위까지만 응답했어요." 배너 표시, 원장에 ai_generation -1(잔액 0). 중간에 Gemini 503 1회(차감 없음) 후 재시도로 성공.

### 5. Regeneration with free-text feedback against a real Gemini call
expected: Typing feedback (e.g. "더 짧게") in GenerationPreview's free-text row and pressing Enter produces a NEW real generation whose content is visibly influenced by the feedback, replacing the old preview.
result: PASS (2026-10-02) — 채팅에서 "더 짧게, 세 문단으로 줄여줘." 입력 → 실제 Gemini 호출로 세 문단 분량의 새 본문 초안 생성(응답 문구에 요청 반영 언급). 첫 시도는 Gemini 503으로 실패했으나 "다시 시도"로 성공.

## Summary

total: 5
passed: 3
issues: 0
pending: 1
skipped: 1
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

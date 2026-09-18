---
id: BUG-04
title: Gemini 사고(thinking) 토큰이 지갑 차감에서 빠짐
status: 결정 대기 (과금 정책)
severity: medium (플랫폼 비용 손실)
found: 2026-09-18
found_during: 08-09 실제 Gemini 보정 측정
origin_phase: 08 (08-02 설계 결정)
phase8_regression: 해당 없음 — 계획대로 동작, 정책 미결
files:
  - lib/ai/providers/gemini.ts
  - lib/ai/chat.ts
  - lib/ai/cost.ts
---

# BUG-04: Gemini 사고(thinking) 토큰이 지갑 차감에서 빠짐

## 증상

`gemini-3.5-flash`(lite/pro 모두)는 응답마다 사고 토큰을 생성하고, Google은 이를 **출력 토큰 요금으로 청구**한다. 하지만 NovelScript는 사고 토큰을 사용자 지갑 차감에 넣지 않는다. 그 결과 실제 API 비용이 사용자 차감액보다 크다.

## 측정 (2026-09-18, lite, 한국어 지문 3개)

| 입력 토큰(보고) | 출력 토큰(보고) | 사고 토큰(보고) |
|---|---|---|
| 90 | 11 | 241 |
| 98 | 7 | 245 |
| 209 | 6 | 246 |

호출마다 사고 토큰이 약 245개로, 실제 출력 토큰보다 훨씬 많다. 이 측정은 `maxOutputTokens: 256`으로 돌렸기 때문에 사고 토큰이 한도를 대부분 써버려 세 번 모두 `finishReason: max_tokens`로 끝났다.

## 현재 동작

- `mapGeminiResponse`(lib/ai/providers/gemini.ts)가 `thoughtsTokenCount`를 `usage.thoughtsTokens`로 **따로 보고**한다. 출력 토큰에는 더하지 않는다(08-02 결정).
- `chat()`의 `computeDebitAmount`는 `inputTokens + outputTokens`만 차감한다.
- 출력 한도 `maxOutputTokens`(최대 2048)는 사고 토큰도 함께 쓰므로, 사고가 길면 본문이 짧게 잘릴 수 있다(`wasCapped`).

## 결정할 것

1. **차감 포함 여부**
   - A. 사고 토큰을 출력 단가로 차감에 포함한다: 원가와 일치하지만, 같은 답변에 차감이 커 보인다.
   - B. 포함하지 않고 `KRW_PER_WALLET_TOKEN` 등 환율 상수로 원가를 흡수한다.
   - C. 사고 예산(`thinkingConfig.thinkingBudget`)을 낮추거나 꺼서 비용 자체를 줄인다: 품질 영향 확인 필요.
2. **출력 한도와의 관계:** 사고 토큰이 `maxOutputTokens`를 잠식하지 않도록 사고 예산을 별도로 줄지 정한다.

## 수정 방향 (A 선택 시)

- `computeDebitAmount`에 `thoughtsTokenCount`를 받아 출력 단가로 합산한다.
- 거절(refusal) 차감 경로도 같은 합산을 쓴다.
- `usage.reported`에 thoughts 플래그를 추가할지 검토한다(보고가 없으면 0).
- 테스트: `tests/ai/cost-estimate.test.ts`, `tests/ai/chat-idempotency.test.ts`의 차감 기대값을 갱신하고, 사고 토큰 포함 케이스를 추가한다.

## 관련 결정

같은 날 로컬 입력 토큰 추정을 제거했다(commit 4744506). 출력 한도는 잔액 전체 기준, 차감은 실제 사용량을 호출 전 잔액까지만 적용한다. 사고 토큰을 포함하면 차감액이 이 상한에 걸리는 빈도가 늘어날 수 있다.

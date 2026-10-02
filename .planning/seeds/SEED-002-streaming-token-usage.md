---
id: SEED-002
status: dormant
planted: 2026-10-02
planted_during: Phase 4 / Phase 15 HUMAN-UAT 진행 중 (Gemini 실호출 검증)
trigger_when: 다음 AI 채팅 UX 개선 phase 기획 시, 또는 다른 세션의 AiPanel/chat.ts/paid-generation.ts 변경이 정리된 직후
scope: Medium-Large
---

# SEED-002: 스트리밍 응답 + 실시간 토큰 소모량 표시 (Claude 스타일)

## Why This Matters

현재 AiPanel은 "입력 1,000 + 출력 1,000 토큰 기준 약 N 지갑 토큰"이라는 **고정 예시 문구**만 보여준다
(`AiPanel.tsx` `exampleCost`). 작가는 실제로 얼마나 쓰는지 알 수 없고, 응답이 끝날 때까지 아무 진행 표시가 없다.

- 생성 중 출력 토큰이 올라가는 것을 보여주고, 끝나면 실제 입력/출력/차감액을 표시하고 싶다.
- Phase 4 HUMAN-UAT 3번(실제 `usageMetadata` 대비 차감액 대조)은 **사용량이 저장되지 않아** 사후 대조가 불가능하다
  (`ledger_entries`에는 `delta`만 있고 입력/출력/thoughts 토큰이 없다). 이 SEED가 이를 같이 해결한다.
- Phase 4 HUMAN-UAT 2번("예상 토큰" countTokens UI)은 UI가 소멸해 skipped 처리됨 — 이 SEED가 후속이다.

## 범위 결정 (2026-10-02 사용자 합의)

| 항목 | 결정 |
|---|---|
| a. 보내기 전 `countTokens` 입력 추정 | **하지 않음** (c와 독립, 필요 시 별도) |
| b. 응답 후 실제 사용량 표시·저장 | **c에 포함** — 스트림 마지막 청크의 최종 `usageMetadata`로 자동 해결 |
| c. 생성 중 실시간 표시(스트리밍) | **이 SEED의 본체** |

즉 a, b를 먼저 만들 필요 없이 c로 바로 간다.

## 현재 구조(확인된 사실)

- `lib/ai/providers/gemini.ts` `mapGeminiResponse`가 `usageMetadata`(`promptTokenCount`/`candidatesTokenCount`/`thoughtsTokenCount`)를
  `UsageReport`로 매핑한다. 비스트리밍 한 번 호출 후 변환.
- `lib/ai/paid-generation.ts` `settlePaidGeneration`: `generate()` 완료 후 `computeDebitAmount`(`lib/ai/cost.ts`)로 차감액 계산 →
  `apply_wallet_delta` RPC(`reference_type='ai_generation'`, `reference_id=idempotencyKey`). 멱등키 중복은 `findGenerationEntry`로 방어.
- 출력 상한은 호출 전 `computeMaxOutputTokens`(잔액 기준, 최대 2048)로 캡.
- 가격표: `lib/ai/providers/gemini/cost.ts` (gemini-3.5-flash: 입력 1.50 / 출력 9.00 USD per 1M).
- 서버 액션 기반이라 응답은 완료 후 한 번에 반환된다 → 스트리밍은 서버 액션만으로는 어렵고 Route Handler(SSE/ReadableStream) 필요.

## 설계 방향(제안, 미확정)

1. **스트리밍 호출**: Gemini `generateContentStream` 사용. 청크마다 텍스트 + (가능하면) 누적 `usageMetadata`를 클라이언트로 전달.
   청크에 `candidatesTokenCount`가 안 오면 문자 수 기반 근사치를 표시하고 종료 시 실제 값으로 교정.
2. **정산은 스트림 종료 시 1회**: 마지막 청크의 최종 `usageMetadata`로 `computeDebitAmount` → 기존 `apply_wallet_delta`.
   멱등키·`checkWriteAccess`·잔액 상한(`Math.min(walletBalance, …)`) 로직은 그대로 재사용.
3. **중도 취소/끊김 처리**: 사용자가 중단하거나 연결이 끊겨도 이미 소비된 출력은 정산해야 한다(스트림 종료 훅/`finally`).
   부분 응답의 차감 정책(전부 차감 vs. 소비분만)을 결정해야 한다.
4. **사용량 저장**: 입력/출력/thoughts 토큰을 원장 `reason` 또는 신규 컬럼/테이블에 기록 → UAT 3번 사후 대조 가능.
5. **UI**: 응답 생성 중 "출력 N 토큰…" 증가 표시, 완료 후 "입력 N · 출력 M · 차감 X 지갑 토큰". 고정 예시 문구 제거.

## 열린 질문

- Route Handler로 옮길 때 인증(Supabase 세션)·멱등키·`revalidate` 처리를 서버 액션과 어떻게 동일하게 유지할지.
- Gemini 스트리밍에서 `thoughtsTokenCount`가 중간 청크에 노출되는지(미확인).
- 안전 거절(D-05/D-06)이 스트림 중간에 발생할 때의 UX·차감(SEED-001과 연동).
- 부분 응답 차감 정책, 중도 취소 시 환불 여부.
- Phase 15 문서 계획 경로(`document-plan.ts`, 구조화 응답)도 스트리밍 대상인지, 일반 채팅 응답만인지.

## 선행/주의

- **충돌 주의**: `AiPanel.tsx`, `chat.ts`, `paid-generation.ts`는 2026-10-02 기준 다른 세션이 미커밋으로 수정 중
  (설정 문서 페이지 AI 패널 `nodeId` 지원). 그 작업이 커밋/정리된 뒤에 시작할 것.
- 구현 시 Phase 4 HUMAN-UAT 3번을 이 변경 후 사용량 기록으로 재검증하고, 2번 항목은 폐기/재정의한다.
- Gemini 3.5 Flash가 큰 요청에 503(고수요)을 자주 반환 — 스트리밍 도입 시 재시도/에러 UX도 같이 점검.

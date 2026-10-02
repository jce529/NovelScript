---
id: BUG-06
title: 검증이 거부한 재생성 응답도 과금되고, 같은 템플릿 재시도는 "같은 요청이 두 번 전송돼…"로 막힌다
status: open (수정 방향 확정 — A안)
severity: medium
found: 2026-10-02
found_during: Phase 15 BUG-04/05 브라우저 UAT (기본 인물 템플릿 재생성 거부 후 재시도)
origin_phase: 15 (7674e20 feat(15-06) 재생성 + lib/ai/document-regenerate.ts, 744045c 링크 검증 추가로 거부 빈도 증가)
files:
  - lib/ai/document-regenerate.ts
  - lib/ai/paid-generation.ts
  - lib/ai/chat-result.ts
  - tests/ai/regenerate-document.test.ts
---

# BUG-06: 거부된 재생성이 과금되고 재시도가 막힌다

## 증상
1. 재생성 응답을 우리 검증(템플릿 구조·본문 제목·링크 가드)이 거부해 "문서를 다시 생성하지 못했어요"가 떠도, 그 생성에 대한 토큰 차감은 이미 끝나 있다.
2. 같은 템플릿으로 "다시 생성하기"를 다시 누르면 "같은 요청이 두 번 전송돼 한 번만 처리했어요. 이전 응답은 다시 불러올 수 없으니…"가 먼저 뜬다. 사용자는 한 번씩 천천히 눌렀을 뿐이다(연타가 아님). 그다음 클릭에서야 새 키로 생성되고 **다시 과금된다**.

## 재현
1. 링크가 없는 인물 제안을, 모델이 KB에 없는 문서를 새로 링크하기 쉬운 템플릿(예: 15-05 이전의 `기본 인물 템플릿`)으로 "다시 생성하기" → 거부 안내.
2. 같은 템플릿으로 다시 "다시 생성하기" → "같은 요청이 두 번 전송돼…" 안내(UAT 2026-10-02에서 확인). 지갑 원장에서 첫 시도의 `ai_generation` 항목이 이미 존재.
(15-05로 거부 빈도는 줄었지만 구조 불일치·이름 변경·지어낸 링크 거부는 여전히 가능하다.)

## 기대 / 실제
- 기대: 우리 검증이 거부한 응답은 사용자에게 과금하지 않고, 같은 키로 바로 재시도할 수 있다.
- 실제: `settlePaidGeneration`이 모델 응답 직후 차감을 기록하고, 검증은 그 뒤(`document-regenerate.ts`의 `settled` 이후)에 실행된다. 모달의 `regenKeyRef`는 `already_processed`에서만 초기화돼 같은 키가 재사용되고, 서버는 원장에서 그 키를 발견해 `already_processed`를 돌려준다.

## 원인
- 검증이 차감 **뒤**에 있다(`document-regenerate.ts`의 `parseChatResponse` ~ 링크 가드는 `settlePaidGeneration` 반환 후). 차감은 원장에 `reference_id = idempotencyKey`로 남아 중복 방지 키 역할도 한다(`paid-generation.ts` `findGenerationEntry`, `apply_wallet_delta`).
- 제공자 오류는 차감 전에 `settleInner`의 `catch`에서 terminal로 처리돼 키가 소모되지 않지만(재시도 가능), 우리 검증 거부에는 그런 경로가 없다.
- 안내 문구(`CHAT_COPY.processedBody`)는 "연타로 두 번 전송"을 가정해 쓰여 있어 순차 재시도 상황과 맞지 않는다.

## 수정 방향
확정 — 사용자 결정(2026-10-02): **A안, 검증 거부는 과금하지 않는다**.
1. `paid-generation.ts`: 콜백이 던지는 `GenerationRejectedError`(메시지 = 사용자 문구)를 새로 정의하고, `settleInner`의 `catch`에서 이를 먼저 처리해 **차감·원장 기록 없이** `terminal`(`failed('rejected_output', 메시지)`)을 반환한다. 제공자 오류 경로·환불 불가 재시도 규칙은 그대로. 거부(refusal) 응답의 기존 과금 동작도 그대로.
2. `chat-result.ts`: `ChatFailureKind`에 `rejected_output` 추가(클라이언트가 `error` 문자열을 그대로 표시하므로 별도 문구 매핑은 불필요).
3. `document-regenerate.ts`: `parseChatResponse`와 모든 검증(구조 `validateDocumentAgainstPlan`, 본문 제목, 자기 링크 보존, 새 링크 KB 존재 조회)을 `generateContent` 콜백 **안**으로 옮긴다. 거부되면 `GenerationRejectedError(REGENERATION_FAILED)`를 던지고, 통과하면 검증 결과를 클로저 변수에 담아 `settled` 이후 그대로 반환한다. KB 조회 오류도 거부(fail closed)이며 과금하지 않는다.
4. 거부 시 키가 소모되지 않으므로 모달 수정은 필요 없다(`already_processed`일 때만 키 초기화하는 기존 로직 유지). 제공자 503처럼 같은 키로 재시도하면 된다.
5. 모니터링: 거부 건수를 알 수 있도록 민감정보 없이 `[ai] output rejected`(provider, 거부 사유 코드, idempotencyKey)를 로그에 남긴다 — 제공자 비용은 서비스가 부담하므로 빈도를 봐야 한다.

### 위험·결정된 트레이드오프
- 거부된 응답의 제공자 호출 비용은 서비스가 부담한다(사용자는 과금 없음). 반복 거부로 비용이 새는 경우를 막기 위해 기존 지갑별 생성 lease(동시 1건)와 요청 제한을 유지한다. 필요하면 후속으로 지갑별 거부 횟수 상한을 검토한다.
- 검증이 콜백 안으로 들어가 lease 점유 시간이 KB 조회 1회만큼 늘어난다(무시 가능).
- 범위 밖: `document-plan.ts`(최초 문서 제안)는 검증 실패 시에도 답변을 표시하고 과금하는 별개 정책이라 이 버그에서 바꾸지 않는다. `CHAT_COPY.processedBody` 문구 개선은 필요 시 별도.

## 검증
- 단위 테스트(먼저 실패 확인):
  - `settlePaidGeneration`: 콜백이 `GenerationRejectedError`를 던지면 `terminal`/`rejected_output`이고 `apply_wallet_delta`가 호출되지 않으며 lease가 해제된다.
  - `regenerateDocumentWithTemplate`: 구조 불일치·제목 불일치·자기 링크 누락·지어낸 링크·KB 조회 오류 각각에서 결과가 `REGENERATION_FAILED`이고 차감이 없다. 통과 케이스는 기존대로 차감·반환.
  - `tests/ai/regenerate-document.test.ts`의 `settle` 목은 콜백 예외를 `terminal`로 변환하도록 갱신해야 한다(현재 목은 예외를 그대로 전파).
- DB 테스트(독립 지갑·실제 `settlePaidGeneration`): 거부된 생성 후 원장 항목이 생기지 않고 지갑 잔액이 그대로이며, 같은 키로 다시 호출하면 `already_processed`가 아닌 새 생성이 진행된다.
- 브라우저: 거부를 자연 발생시키기 어려우므로, 거부 직후 지갑 잔액·원장이 변하지 않았는지와 같은 템플릿 재시도가 "같은 요청이 두 번 전송돼…" 없이 진행되는지를 거부가 관측될 때 확인한다(관측 불가 시 DB 테스트로 대체하고 미확인으로 기록).
- 회귀: 기존 `tests/ai tests/kb tests/studio`, `tsc`, `npm run lint`.

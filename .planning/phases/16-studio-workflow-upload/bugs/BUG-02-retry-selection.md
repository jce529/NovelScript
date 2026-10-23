---
id: BUG-02
title: 다시 시도가 모델 변경을 반영하지 않고 이전 모델로 재전송
status: fixed-pending-device-check
severity: low
found: 2026-10-02
found_during: 16-UAT G4 점검, Phase 17-04
origin_phase: 16 (frozen snapshot 설계는 Phase 4 UI-SPEC §1, 11-UI-SPEC 재확인)
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
  - lib/ai/chat-request.ts
  - tests/ai/ai-panel-model.test.ts
  - tests/ai/chat-request-lifecycle.test.ts
  - .planning/phases/11-byok-ux/11-UI-SPEC.md
---

# BUG-02: 다시 시도가 모델 변경을 반영하지 않음

## 증상

모델 호출이 실패한 뒤 작가가 피커에서 다른 모델로 바꾸고 "다시 시도"를 눌러도 이전 모델로 재전송된다.

## 원인

버그가 아니라 설계: 한 번의 전송은 frozen snapshot(`SendAttempt`)과 멱등 키 하나로 묶이고, `handleRetry`는 같은 attempt를 그대로 재전송한다. 이는 정산 직후 응답 유실 등 차감 여부가 모호한 경우 이중 차감을 막기 위한 장치다. 다만 정산 전에 확정 실패한 경우에도 선택을 고정하면 사용자 의도(다른 모델로 다시)와 어긋난다.

## 사용자 결정 (2026-10-23)

선택이 바뀌었고 실패 종류가 `rate_limited`/`credit_exhausted`/`unavailable`/`config`일 때만 현재 선택 + 새 멱등 키로 재시도한다. `settlement`/`unknown`/`generation_in_progress`(및 응답 유실)는 기존 snapshot·키를 유지한다(이중 차감 위험). 선택이 바뀌지 않았으면 항상 기존 키.

## 수정

- `lib/ai/chat-request.ts`: `canRetryWithNewSelection`, `isSameSelection`, `createReselectedAttempt`(새 키, 이전 대체 동의 제거). `createReplacementAttempt`는 같은 키 유지(동의 흐름 전용)로 그대로.
- `AiPanel.tsx`: `failedKindRef`에 실패 종류 저장, `handleRetry`에서 정책 적용. 새 선택에도 `canUseSelection` 가드가 `runAttempt`에서 적용되고 서버 route 재계산은 유지. 모호 실패에서 선택이 바뀐 경우 안내 토스트 표시.
- 11-UI-SPEC의 "무조건 동일 키" 문구를 위 정책으로 교정.
- AiPanel의 미사용 `eslint-disable` 경고 제거.

## 검증

`tests/ai/chat-request-lifecycle.test.ts`, `tests/ai/ai-panel-model.test.ts` 단위 테스트(4종 허용, 3종 금지, 응답 유실, 선택 미변경, 가용성 가드). 브라우저 실기기 확인은 남음.

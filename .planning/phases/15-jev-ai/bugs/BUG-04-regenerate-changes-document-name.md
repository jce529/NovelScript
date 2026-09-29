---
id: BUG-04
title: 템플릿 재생성 시 모델이 문서 이름과 사실을 바꿔도 그대로 저장된다
status: open
severity: medium
found: 2026-09-29
found_during: Phase 15 HUMAN-UAT Item 2 재시도 (브라우저 UAT, localhost:3000)
origin_phase: 15 (7674e20 feat(15-06) 재생성 + lib/ai/document-regenerate.ts)
files:
  - lib/ai/document-regenerate.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
---

# BUG-04: 템플릿 재생성 시 문서 이름이 바뀌어 저장된다

## 증상
"새 인물 강진욱에 대한 인물 설정 문서를 만들어줘"로 만든 제안(이름 "강진욱")에서 템플릿을 "기본 인물 템플릿"으로 바꿔 재생성·저장하자, 문서가 "강시후"라는 다른 이름으로 인물 > 서브인물 폴더에 저장됐다. 본문 제목도 `# 👤 강시후`. 사용자에게 알림이나 확인 없이 이름이 바뀐다.

## 재현
1. 인물 문서 제안 생성(이름 "강진욱") → 저장 모달.
2. 템플릿을 추천값과 다른 "기본 인물 템플릿"으로 변경 → 저장 → "다시 생성하기".
3. 저장된 서버 액션 로그의 `saveDocumentProposalAction`에서 `proposal.name`이 "강시후", `regenerated: true`.

(UAT 중에는 lite 모델 `gemini-3.5-flash-lite`로 임시 전환해 재현했다. 원래 모델에서도 같은지는 미확인.)

## 기대 / 실제
- 기대: 템플릿만 바꿔 다시 정리하므로 문서 이름과 사실은 원본 제안을 유지한다.
- 실제: 모델이 낸 이름이 원본 이름을 덮어쓴다.

## 원인
`document-regenerate.ts:94-95`가 모델 출력의 `parsed.proposal!.name`을 그대로 반환하고, 모달(`SaveDocumentPlanModal.tsx:102`)은 `override.name || proposal.name`으로 재생성 이름을 우선 사용한다. 프롬프트(`document-regenerate.ts:72`)는 "여기에 없는 사실을 새로 확정하지 말 것"이라고만 하고 이름 유지를 명시하지 않으며, 결과 검증(`validateDocumentAgainstPlan`)도 이름 일치를 확인하지 않는다.

## 수정 방향
정책 결정 필요 — 사용자 확인 후 확정.
- A. 재생성 결과의 이름을 무시하고 항상 원본 `proposal.name`을 쓴다(서버에서 강제). 가장 단순하고 예측 가능.
- B. 프롬프트에 원본 이름 유지를 명시하고, 검증에서 이름이 다르면 `REGENERATION_FAILED` 처리(재시도 유도).
- C. A + B 병행(이름은 강제 고정, 본문 제목/링크 불일치는 검증으로 탐지).
- 본문 안의 이름(제목, `[[링크]]`)도 함께 다룰지 여부.

### 확정 및 적용 (2026-09-29)
사용자 확정: **C (A+B 병행)**, 본문 제목도 검증. `lib/ai/document-regenerate.ts`:
- 반환 `name`을 모델 출력이 아닌 원본 `input.proposal.name`으로 강제.
- 프롬프트(`contents`)에 원본 이름 유지 + 본문 제목에 같은 이름 사용 지시 추가.
- 본문 첫 H1이 원본 이름을 포함하지 않으면 `REGENERATION_FAILED`.
- `[[링크]]` 검증은 범위 밖(미적용).
- 테스트: `tests/ai/regenerate-document.test.ts`에 이름 유지/제목 불일치 실패 2건 추가.
- **브라우저 UAT 필수 — 미실시.** 아래 "검증"의 브라우저 UAT를 통과하기 전에는 `/bug-complete`로 넘어가지 말 것(status: open 유지).

## 검증
- 단위 테스트: 모델이 다른 이름을 반환하는 픽스처에서 저장 이름이 원본으로 유지되는지(또는 정책대로 실패하는지).
- 브라우저 UAT: 템플릿 변경 재생성 후 문서 이름이 원본과 같은지 확인.

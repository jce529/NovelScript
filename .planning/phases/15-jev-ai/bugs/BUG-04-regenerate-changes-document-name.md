---
id: BUG-04
title: 템플릿 재생성 시 모델이 문서 이름과 사실을 바꿔도 그대로 저장된다
status: open (수정 방향 확정)
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
확정 — 사용자 결정: C안(A + B 병행).
1. **이름 서버 강제(A)**: `regenerateDocumentWithTemplate`가 반환하는 `name`을 `parsed.proposal!.name`이 아니라 `input.proposal.name`으로 고정한다(`document-regenerate.ts:95`). 모달의 `override.name || proposal.name`은 그대로 두어도 결과가 원본 이름이 된다.
2. **프롬프트 명시(B)**: `contents`(`document-regenerate.ts:72`)와 시스템 지시에 "문서 이름은 `${input.proposal.name}` 그대로 유지하고, 본문 제목과 링크의 이름도 바꾸지 말 것"을 추가한다.
3. **본문 검증(B)**: 재생성 결과 본문의 이름이 원본과 다르면 `REGENERATION_FAILED`로 처리해 재시도를 유도한다. 이름 강제 고정만으로는 `# 👤 강시후` 같은 본문 제목 불일치가 저장되므로 이 검증이 필요하다. 구현은 `validateDocumentAgainstPlan`에 선택 인자(`expectedName`)를 추가하거나 재생성 전용 검사로 두되, 판정 기준은 (a) 본문 첫 제목 줄에 원본 이름이 포함되는지, (b) 원본 본문에 있던 `[[링크]]` 이름이 결과에서 사라지거나 바뀌지 않았는지로 한다. 템플릿 제목이 `<% tp.file.title %>` 치환 형태(`substituteTitle`)라 이름 포함 여부 검사가 안전한지 구현 시 확인한다.
4. 원래 모델(lite가 아닌)에서 재현되는지는 미확인이나, 1번은 모델과 무관한 안전장치이므로 그대로 적용한다.

## 검증
- 단위 테스트: 모델이 다른 이름을 반환하는 픽스처에서 반환 `name`이 원본으로 고정되는지.
- 단위 테스트: 본문 제목/링크가 다른 이름이면 `REGENERATION_FAILED`가 되는지, 이름이 같으면 통과하는지.
- 단위 테스트: 프롬프트(`contents`)에 원본 이름 유지 문구가 포함되는지.
- 브라우저 UAT: 템플릿 변경 재생성 후 문서 이름이 원본과 같은지 확인.

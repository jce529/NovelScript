---
id: BUG-02
title: 저장 확인 모달의 폴더/템플릿 셀렉트가 이름 대신 UUID를 표시한다
status: open
severity: medium
found: 2026-09-29
found_during: Phase 15 HUMAN-UAT Item 2 재시도 (브라우저 UAT, localhost:3000)
origin_phase: 15 (7674e20 feat(15-06): save-confirmation modal)
files:
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
---

# BUG-02: 저장 확인 모달의 폴더/템플릿 셀렉트가 이름 대신 UUID를 표시한다

## 증상
"문서로 저장하기"로 여는 저장 확인 모달에서 "저장 폴더 변경"과 "템플릿 변경" 셀렉트의 닫힌 상태(트리거)가 "인물 (최상위)"/"인물" 같은 이름이 아니라 `d4cc4c1a-f02c-...` 같은 UUID를 보여준다. 펼친 목록의 항목은 이름으로 정상 표시된다.

## 재현
1. 로그인 후 작품 회차 편집 화면의 AI 채팅에서 "새 인물 ○○에 대한 인물 설정 문서를 만들어줘" 전송.
2. 응답의 "문서로 저장하기" 클릭 → 모달이 열리면 두 셀렉트 트리거에 UUID가 보인다.
3. 폴더를 "서브인물"로 바꿔도 트리거는 새 폴더 UUID(`88532b69-...`)를 표시한다.

## 기대 / 실제
- 기대: 트리거에 선택된 항목의 이름(예: "인물 (최상위)", "인물 (기본)")이 표시된다.
- 실제: 선택된 값(폴더 id / 템플릿 id)이 그대로 표시된다.

## 원인
`SaveDocumentPlanModal.tsx:206`, `:220`의 `<SelectValue />`에 children 렌더 함수가 없다. 이 프로젝트의 셀렉트는 Base UI(`components/ui/select.tsx`의 `SelectPrimitive.Value`)라서, 목록이 열리기 전에는 값에 대응하는 라벨을 알 수 없어 값 문자열을 그대로 그린다. 같은 프로젝트의 다른 셀렉트는 `<SelectValue>{(value) => ...}</SelectValue>` 형태로 라벨을 직접 계산해 넘긴다(`AiPanel.tsx:250,260`, `QuickAddDialog.tsx:70,83`, `feed-filters.tsx:33,47` 등). 이 모달의 두 곳만 빠져 있다.

## 수정 방향
두 `SelectValue`에 children 렌더 함수를 추가해 id → 표시 이름으로 변환한다.
- 폴더: `folders.find(f => f.id === value)`로 찾아 `isRoot ? \`${proposal.category} (최상위)\` : path` (옵션 렌더와 같은 규칙, 함수로 뽑아 공유).
- 템플릿: `templates.find(t => (t.id ?? CANONICAL_TEMPLATE_VALUE) === value)`로 찾아 `name` + 기본이면 ' (기본)'.
- 찾지 못하면 빈 문자열이 아니라 placeholder 성격의 대체 문구를 쓴다.

## 검증
- 컴포넌트 테스트: 모달 렌더 직후(목록을 열기 전) 트리거 텍스트가 UUID가 아닌 이름인지 단언.
- 폴더/템플릿을 바꾼 뒤에도 트리거가 새 이름을 표시하는지 단언.
- 브라우저 UAT: 모달을 열어 두 트리거가 이름을 표시하는지 육안 확인.

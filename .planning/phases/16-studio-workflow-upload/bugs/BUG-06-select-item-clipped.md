---
id: BUG-06
title: 새 문서 만들기 다이얼로그의 템플릿 선택 항목 글자가 팝업에서 잘림
status: fixed-pending-device-check (Phase 17에서 수정, 사용자 브라우저 확인 대기)
severity: low (레이아웃, 기능 영향 없음)
found: 2026-10-25
found_during: Phase 17 수동 확인 중 사용자 보고(스크린샷)
origin_phase: 공용 Select 컴포넌트 + 설정집 새 문서 다이얼로그(kb-node-dialogs, Phase 2·15 계열)
files:
  - components/ui/select.tsx
  - components/studio/kb-node-dialogs.tsx
  - tests/studio/select-item-wrap.test.ts
---

# BUG-06: 템플릿 선택 항목 잘림

## 증상

"새 문서 만들기"에서 템플릿 선택을 열면 팝업이 좁고 항목 "기본 인물 템플릿 (기본) (기본)"이 끝에서 잘리며 체크 아이콘과 겹쳐 보인다.

## 원인

1. 공용 `SelectItem`의 글자 영역이 `shrink-0 whitespace-nowrap`이고 팝업은 `w-(--anchor-width) overflow-x-hidden`이라, 항목이 팝업(= 트리거 폭)보다 길면 그대로 잘린다. 모든 Select에 해당.
2. 이 다이얼로그의 `SelectTrigger`에 `w-full`이 없어 트리거가 내용 폭(약 178px)으로 줄고, 팝업도 같은 폭이 됐다.

## 수정

- `select.tsx`: 항목 글자를 `min-w-0 whitespace-normal break-keep`(줄바꿈 허용, 단어 단위)으로.
- `kb-node-dialogs.tsx`: 템플릿 트리거에 `w-full`.

## 검증

- `tests/studio/select-item-wrap.test.ts` 2건(수정 전 실패 → 통과), `tests/ai` 911건 통과.
- 브라우저 측정(560px): 트리거 471px, 팝업 472px, 항목 한 줄(h=28), 잘림 없음.
- 남은 확인: 사용자 브라우저 확인 후 `bug-complete`.

## 추가 조정 (2026-10-25, 사용자 결정)

항목 이름에 "(기본)"이 두 번 붙던 문제: 앞의 "(기본)"은 범위 라벨(시스템 기본 제공), 뒤의 "(기본)"은 계정 기본값 표시(`isDefault`)였다. 기본값 표시를 `· 기본값`으로 바꿨다(`kb-node-dialogs.tsx`). 결과: "기본 인물 템플릿 (기본) · 기본값". 저장 모달(`SaveDocumentPlanModal`)의 "(기본)" 표시는 범위 라벨이 없어 겹치지 않으므로 그대로 둠. 테스트 `tests/kb/template-tree-ui.test.ts` 기대값 갱신.

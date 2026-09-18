---
id: BUG-06
title: 창 폭 약 958px에서 챕터 편집기 가로 스크롤 발생
status: needs-repro
severity: low
found: 2026-09-18
found_during: 08-09 체크포인트 (Chrome, viewport 958×910)
origin_phase: 미상
phase8_regression: 확인 필요
files:
  - app/studio/[workId]/chapters/[chapterId]/page.tsx
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
---

# BUG-06: 창 폭 약 958px에서 챕터 편집기 가로 스크롤 발생

## 증상

Chrome 창 폭이 약 958px일 때 챕터 편집기 페이지 하단에 가로 스크롤바가 생긴다.
- 오른쪽 AI 패널(폭 384px)이 화면 밖으로 일부 잘린다.
- 왼쪽 사이드바 제목("NovelScript", 작품명)도 잘려 보인다.

창 폭 1568px에서는 같은 화면에 가로 스크롤이 없었다.

## 재현 (확인 필요)

1. 브라우저 창 폭을 약 960px로 줄인다.
2. `/studio/{workId}/chapters/{chapterId}`를 연다.
3. 페이지가 가로로 스크롤되는지 확인한다.

## 기대 / 실제

- **기대:** 좁은 폭에서는 AI 패널이 접히거나 원고 영역이 줄어들어 가로 스크롤이 생기지 않는다.
- **실제:** 사이드바 + 원고 + 고정폭 AI 패널의 합이 창 폭보다 커서 페이지가 가로로 넘친다.

## 원인 (추정)

AI 패널이 고정폭(384px)이고, 원고 영역에 `min-width: 0` 또는 반응형 분기가 없는 것으로 보인다. Phase 8은 AI 패널 내부(알림 영역)만 바꿨고 레이아웃 폭은 바꾸지 않았다. 그래도 회귀 여부는 Phase 8 이전 커밋에서 같은 폭으로 비교해 확인해야 한다.

## 검증

- 960px / 768px / 모바일 폭에서 `document.documentElement.scrollWidth <= innerWidth`인지 확인한다.
- Phase 8 이전 커밋(`c8f117f`)과 비교해 회귀 여부를 판정하고 이 문서의 `phase8_regression`을 갱신한다.

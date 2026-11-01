# BUG-01 era-board useMemo 의존성 lint 경고
- 증상: `components/world-tree/era-board.tsx:139` react-hooks/exhaustive-deps 경고 (`draft` 누락).
- 원인: useMemo 콜백 안의 `typeof draft.placements` 타입 표기를 린트가 `draft` 참조로 읽음. 런타임 의존성은 `draft.placements`로 이미 올바름.
- 방향: 타입 표기를 `TimelineDraft['placements']`로 교체. 동작 변화 없음.
- 상태: 수정 완료 (d357b2f), fixed로 이관.

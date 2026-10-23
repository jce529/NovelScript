---
id: 18-01
title: era-board useMemo 의존성 lint 경고 제거
fixed: 2026-10-23
files:
  - components/world-tree/era-board.tsx
---

# 18-01: era-board lint 경고

## 증상
`react-hooks/exhaustive-deps` 경고: useMemo에 `draft` 누락.

## 원인
콜백 내 `typeof draft.placements` 타입 표기를 린트가 값 참조로 취급. 실제 의존성(`draft.placements`)은 정상.

## 수정
`TimelineDraft['placements']` 타입으로 교체. 동작 변화 없음.

## 검증
소유 파일 `eslint --max-warnings=0` 통과, `tests/studio`·`tests/payments` 등 22 파일 207 테스트 통과, tsc에 신규 오류 없음.

## 커밋
- `d357b2f` fix(17-01): ESLint 경고 8건 제거

---
id: BUG-07
title: Phase 7 이전 파일에 기존 lint 오류가 누적되어 있다
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 검증 (todo 기록: "기존 lint 오류 23건")
origin_phase: 07 (기록 시점 기준; 대상 파일은 Phase 7 이전 코드)
files:
  - (npm run lint로 재측정 필요)
---

# BUG-07: 기존 lint 오류

## 증상
`npm run lint`에 Phase 7 이전 파일 기준으로 23건의 오류가 있다고 기록돼 있다. 변경 파일만 lint하는 방식으로 우회 중이라 신규 회귀를 구분하기 어렵다.

## 재현
`npm run lint` 실행. (2026-09-17 기록 수치이며 이후 Phase 8~15 변경으로 달라졌을 수 있다.)

## 기대 / 실제
- 기대: 전체 lint 0건, CI 게이트로 사용 가능.
- 실제: 기존 오류가 있어 전체 lint를 게이트로 쓰지 못한다.

## 원인
초기 phase에서 lint 규칙을 전체에 적용하지 않고 진행했다. 정확한 파일·규칙 분포는 재측정 전에는 알 수 없다.

## 수정 방향
- 먼저 `npm run lint`로 현재 오류를 재측정해 이 문서에 파일·규칙별로 기록한다.
- 기계적으로 고칠 수 있는 것은 수정하고, 의도적 예외는 규칙 단위로 문서화한다. 정책 결정 불필요(단 규칙 비활성화가 필요하면 사용자 확인).

## 검증
- `npm run lint` 0건, `npx tsc --noEmit`·관련 테스트 회귀 통과.

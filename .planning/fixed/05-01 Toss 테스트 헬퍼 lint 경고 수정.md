---
id: 05-01
title: 테스트 헬퍼·테스트의 미사용 인자 lint 경고 제거
fixed: 2026-10-23
files:
  - tests/ai/wallet-refresh.test.ts
  - tests/helpers/toss.ts
  - tests/payments/payment-flow.integration.test.ts
  - tests/studio/chapter-editor-state.test.ts
  - tests/studio/kb-editor-state.test.ts
---

# 05-01: 미사용 인자 lint 경고

## 증상
`no-unused-vars` 경고 7건 (`flush`, `_url`, `_init`, `_columns`, `_v`, `_c` x2).

## 원인
`_` 접두 인자를 eslint가 무시하지 않음.

## 수정
미사용 인자·변수 제거. Toss fetch mock은 제네릭 시그니처로 `mock.calls` 타입 유지.

## 검증
소유 파일 eslint 경고 0, 관련 테스트 207건 통과, tsc 신규 오류 없음 (2026-10-23).

## 커밋
- `d357b2f` fix(17-01): ESLint 경고 8건 제거

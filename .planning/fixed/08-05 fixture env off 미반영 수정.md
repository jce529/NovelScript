---
id: 08-05
title: fixture 값을 지워도 실행 중인 dev 서버에 남는 문제 수정
fixed: 2026-09-23
files:
  - lib/ai/providers/fixture.ts
  - lib/ai/providers/registry.ts
  - .env.example
  - tests/ai/provider-fixture.test.ts
---

# 08-05: fixture 값을 지워도 실행 중인 dev 서버에 남는 문제 수정

## 증상

`next dev` 실행 중 `.env.development.local`(또는 `.env.local`)의 `AI_PROVIDER_FIXTURE` 줄이나 파일을 지워도 이전 값이 `process.env`에 남아, 실제 Gemini로 돌아가지 않고 계속 `(개발용 고정 응답)`이 나왔다.

## 원인

Next dev는 env 파일이 바뀌면 다시 읽지만, 파일에서 사라진 키를 `process.env`에서 지우지는 않는다. fixture는 `createPlatformProvider(process.env)`에서 호출 시점마다 읽으므로 남은 값이 계속 적용됐다.

## 수정

- `readProviderFixture`(`lib/ai/providers/fixture.ts`)에 `AI_PROVIDER_FIXTURE=off` 명시 값을 추가해, 파일을 지우지 않고 값만 `off`로 바꿔도 fixture를 끌 수 있게 함.
- `createPlatformProvider`(`lib/ai/providers/registry.ts`)가 fixture를 사용할 때 `console.warn`으로 활성 모드와 끄는 방법을 서버 로그에 남기도록 함.
- `.env.example` fixture 주석에 `off` 값과, 줄을 지워도 실행 중인 dev 서버에는 반영되지 않는다는 설명 추가.

## 검증

- `tests/ai/provider-fixture.test.ts`에 `AI_PROVIDER_FIXTURE=off`가 `readProviderFixture`에서 `null`을 반환하는 단위 테스트 추가.
- 전체 스위트 15개 테스트 통과, `tsc --noEmit` 통과.
- 서버 로그/env 처리만 바뀌는 개발 전용 변경이라 브라우저 검증은 생략.

## 커밋

- `fa9fbbf fix(08): BUG-05 fixture env requires restart`

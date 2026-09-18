---
id: BUG-05
title: fixture 값을 지워도 실행 중인 dev 서버에 남음
status: open
severity: low (개발 전용)
found: 2026-09-18
found_during: 08-09 체크포인트
origin_phase: 08 (08-08)
phase8_regression: false (개발 도구 사용성 문제)
files:
  - lib/ai/providers/fixture.ts
  - lib/ai/providers/registry.ts
  - .env.example
---

# BUG-05: fixture 값을 지워도 실행 중인 dev 서버에 남음

## 증상

`next dev` 실행 중 `.env.development.local`(또는 `.env.local`)의 `AI_PROVIDER_FIXTURE` **값을 바꾸면** 대체로 바로 반영된다. 그런데 **줄이나 파일을 지워도** 이전 값이 `process.env`에 남는다. 그래서 실제 Gemini로 돌아가지 않고 계속 `(개발용 고정 응답)`이 나온다.

값을 바꾼 직후 바로 보낸 요청이 한 번 이상하게 동작한 적도 있다. 입력은 비워졌는데 말풍선·알림·차감이 모두 없었다. env를 다시 불러오는 도중에 요청이 겹친 것으로 추정한다.

## 재현

1. `.env.development.local`에 `AI_PROVIDER_FIXTURE=slow`를 넣고 `npm run dev`를 실행한다.
2. 파일을 삭제한다.
3. AI 패널에서 메시지를 보낸다. 응답이 여전히 `(개발용 고정 응답)`이다.
4. dev 서버를 재시작하면 실제 Gemini 응답이 온다.

## 원인

Next dev는 env 파일이 바뀌면 다시 읽지만, 파일에서 **사라진 키를 `process.env`에서 지우지는 않는다**. fixture는 `createPlatformProvider(process.env)`에서 호출 시점마다 읽으므로 남은 값이 계속 적용된다.

## 수정 방향

- 문서만으로 해결: `.env.example`의 fixture 주석과 08-VALIDATION 절차에 "fixture를 끌 때는 dev 서버를 재시작"을 명시한다.
- 또는 fixture를 끌 때 쓰는 명시 값(`AI_PROVIDER_FIXTURE=off`)을 지원해, 파일을 지우지 않고 값만 바꿔도 끌 수 있게 한다.
- 개발 중 fixture가 켜져 있으면 AI 패널이나 서버 로그에 경고를 한 줄 남겨, 실수로 켜 둔 상태를 알아차리게 한다.

## 검증

- `off` 값 지원 시: `readProviderFixture({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'off' })`가 null을 반환하는 단위 테스트를 추가한다.
- production에서 무시되는 기존 테스트(tests/ai/provider-fixture.test.ts)가 계속 통과하는지 확인한다.

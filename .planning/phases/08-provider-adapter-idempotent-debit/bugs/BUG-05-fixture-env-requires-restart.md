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

## 수정 방향 (결정됨)

- `AI_PROVIDER_FIXTURE=off`를 명시 값으로 지원한다. 파일을 지우지 않고 값만 `off`로 바꿔도 fixture가 꺼지도록 `readProviderFixture`를 수정한다.
- 개발 중 fixture가 켜져 있으면 서버 로그(또는 AI 패널)에 경고를 한 줄 남겨, 실수로 켜 둔 상태를 알아차리게 한다.
- (채택 안 함) 문서만으로 해결하는 방안은 코드 수정 없이 재시작을 강제하는 방식이라 택하지 않음.

## 검증

- `off` 값 지원 시: `readProviderFixture({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'off' })`가 null을 반환하는 단위 테스트를 추가한다.
- production에서 무시되는 기존 테스트(tests/ai/provider-fixture.test.ts)가 계속 통과하는지 확인한다.

## 적용된 수정

- [lib/ai/providers/fixture.ts](../../../../lib/ai/providers/fixture.ts): `readProviderFixture`에서 `AI_PROVIDER_FIXTURE=off`이면 `null`을 반환하도록 early return 추가.
- [lib/ai/providers/registry.ts](../../../../lib/ai/providers/registry.ts): `createPlatformProvider`가 fixture를 사용할 때 `console.warn`으로 어떤 fixture 모드가 켜져 있는지, `off`로 끄는 법을 서버 로그에 남기도록 추가.
- [.env.example](../../../../.env.example): fixture 주석에 `off` 값과, 줄을 지워도 실행 중인 dev 서버에는 반영되지 않는다는 설명을 추가.
- [tests/ai/provider-fixture.test.ts](../../../../tests/ai/provider-fixture.test.ts): `off` 값이 `null`을 반환하는 단위 테스트 추가.
- 테스트 15개 전부 통과, `tsc --noEmit` 통과. UI 변경 없음(서버 로그/env 처리만 변경) — 브라우저 검증 생략.
- 남은 부분 없음. status는 `/bug-complete`에서 정리.

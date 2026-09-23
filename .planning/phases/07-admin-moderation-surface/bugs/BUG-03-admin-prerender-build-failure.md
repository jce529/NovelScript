---
id: BUG-03
title: "`npm run build`가 `/admin` 정적 프리렌더에서 실패"
status: open (deferred)
severity: high
found: 2026-09-18
found_during: 08-09 Task 1 자동 게이트
origin_phase: 07 (07-01, 07-05)
phase8_regression: false
files:
  - app/admin/layout.tsx
  - lib/admin/auth.ts
---

# BUG-03: `npm run build`가 `/admin` 정적 프리렌더에서 실패

## 증상

`npm run build`가 exit 1로 끝난다. 컴파일과 TypeScript 단계는 통과하지만, 정적 페이지 생성 단계에서 `/admin`을 프리렌더하다가 다음 에러가 난다.

```
Error: admin_authorization_unavailable
  at lib/admin/auth.ts:105
  at app/admin/layout.tsx:9
```

**프로덕션 빌드와 배포가 막히는 문제**라 심각도를 High로 잡았다.

## 재현

```bash
npm run build
```

## 기대 / 실제

- **기대:** 빌드가 성공한다. `/admin`은 요청 시점에 인증을 확인하는 동적 라우트로 처리된다.
- **실제:** 빌드 시점에는 요청 컨텍스트(세션/쿠키)가 없어 관리자 권한 확인이 실패하고, 이 에러가 던져져 빌드가 중단된다.

## 원인 (추정)

`app/admin/layout.tsx`가 빌드 타임 정적 프리렌더 대상에 포함되어 있다. 그런데 레이아웃에서 호출하는 관리자 인가 함수는 권한을 확인할 수 없으면 에러를 던진다. 동적 API(cookies/headers) 사용이 Next가 감지하는 방식으로 이루어지지 않았거나, 라우트가 동적 렌더링으로 명시되지 않은 것으로 보인다.

## 수정 방향

- 이 저장소의 Next.js는 학습 데이터와 API가 다르다(AGENTS.md). 먼저 `node_modules/next/dist/docs/`에서 동적 렌더링 지정 방법(route segment config, `connection()`, cookies 사용 규칙)을 확인한다.
- `/admin` 세그먼트를 동적 렌더링으로 명시하거나, 인가 확인을 요청 시점 API에 묶어 빌드 타임에 실행되지 않게 한다.
- 인가 불가 시 에러를 던지는 대신 `notFound()`/`redirect()`로 처리하는 것이 Phase 7 설계 의도와 맞는지도 확인한다.

## 검증

- `npm run build` 성공
- 비관리자로 `/admin` 접근 시 기존과 같이 차단되는지 확인(Phase 7 테스트 재실행)

## 실제 적용한 수정

**원인 정정**: 레이아웃에 동적 렌더링 표시가 없어서가 아니라, `lib/admin/auth.ts`의 `checkAdmin()`이 세션/DB 조회를 감싼 `try/catch`에서 Next의 내부 다이내믹 렌더링 바이패스 신호(`DynamicServerError`, `digest: 'DYNAMIC_SERVER_USAGE'`)까지 통째로 삼켜서 일반 `unavailable` 반환값으로 바꿔버리는 것이 근본 원인이었다. 이 신호가 렌더러까지 전파돼야 Next가 해당 라우트를 조용히 동적으로 처리하는데, `catch`가 가로채는 바람에 `requireAdminPage`가 일반 `Error('admin_authorization_unavailable')`를 던져 빌드가 죽었다.

**수정 (방법 B, 근본 수정)**:
- `lib/admin/auth.ts`: `next/navigation`에서 `unstable_rethrow`를 import. `checkAdmin()`의 두 `catch` 블록 각각에서 `unstable_rethrow(err)`를 가장 먼저 호출해, Next의 내부 신호(`redirect`/`notFound`/dynamic-API 바이패스)는 다시 던져 프레임워크가 처리하게 하고, 그 외의 진짜 앱 장애(DB 연결 실패 등)만 `{ ok: false, reason: 'unavailable' }`로 변환하도록 고쳤다.
- `tests/admin/authorization.test.ts`: `next/navigation` 목(mock)에 `unstable_rethrow: vi.fn()`(no-op) 추가. 실제 구현도 Next 다이내믹 에러가 아닌 일반 에러는 통과시키므로 이 mock이 실제 동작과 일치한다.
- (`force-dynamic` route segment config는 적용하지 않음 — 근본 원인을 고쳤으므로 불필요하다고 판단.)

**검증 결과**:
- `npm run build` 성공. `/admin`, `/admin/reports/[reportId]`, `/admin/reviews/[requestId]` 모두 `ƒ` (Dynamic)로 표시됨.
- `tests/admin/authorization.test.ts` + `tests/admin/moderation.test.ts`: 71개 테스트 전부 통과 (비관리자/DB 장애 시 차단되는 "fails closed" 테스트 포함).
- `npx tsc --noEmit`: 에러 없음.
- 전체 `vitest run`에서 wallet/work-crud 등 17개 파일이 실패했으나, 로컬 Supabase 연결 문제(`Database error creating new user`, 타임아웃)로 이 수정과 무관함을 확인.

## 비고

Phase 8에서 이 파일들은 수정하지 않았다. 08-09 VALIDATION에서 `08-09-T1`이 build 때문에 red로 기록되어 있다.

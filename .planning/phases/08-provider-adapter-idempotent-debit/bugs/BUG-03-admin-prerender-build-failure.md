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

## 비고

Phase 8에서 이 파일들은 수정하지 않았다. 08-09 VALIDATION에서 `08-09-T1`이 build 때문에 red로 기록되어 있다.

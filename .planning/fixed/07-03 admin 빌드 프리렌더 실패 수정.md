---
id: 07-03
title: "`npm run build`가 `/admin` 정적 프리렌더에서 실패"
fixed: 2026-09-23
files:
  - lib/admin/auth.ts
  - tests/admin/authorization.test.ts
---

# 07-03: admin 빌드 프리렌더 실패 수정

## 증상

`npm run build`가 exit 1로 끝났다. 컴파일과 TypeScript 단계는 통과하지만, 정적 페이지 생성 단계에서 `/admin`을 프리렌더하다가 `Error: admin_authorization_unavailable`(`lib/admin/auth.ts:105`, `app/admin/layout.tsx:9`)가 던져져 빌드가 중단됐다. 프로덕션 빌드와 배포가 막히는 문제였다.

## 원인

`lib/supabase/server.ts`의 `createClient()`가 `cookies()`(Next의 Dynamic API)를 호출하면, 빌드 타임 정적 프리렌더 중에는 Next가 내부적으로 `DynamicServerError`(`digest: 'DYNAMIC_SERVER_USAGE'`)를 던져 "이 라우트는 동적으로 처리하라"는 신호를 보낸다. 이 신호가 렌더러까지 전파돼야 Next가 조용히 해당 라우트를 동적으로 확정하고 빌드를 계속 진행하는데, `lib/admin/auth.ts`의 `checkAdmin()`이 세션/DB 조회를 감싼 `try/catch`에서 이 신호까지 통째로 삼켜 일반 `{ ok: false, reason: 'unavailable' }` 반환값으로 바꿔버렸다. 그 결과 `requireAdminPage`가 평범한 `Error('admin_authorization_unavailable')`를 던지게 되어, Next가 이를 진짜 빌드 실패로 취급했다.

## 수정

- `lib/admin/auth.ts`: `next/navigation`에서 `unstable_rethrow` import. `checkAdmin()`의 두 `catch` 블록(세션 조회, DB 조회) 각각에서 `unstable_rethrow(err)`를 가장 먼저 호출 — Next의 내부 신호(`redirect`/`notFound`/dynamic-API 바이패스)는 다시 던져 프레임워크가 처리하게 하고, 그 외의 진짜 앱 장애(DB 연결 실패 등)만 `unavailable`로 변환하도록 수정.
- `tests/admin/authorization.test.ts`: `next/navigation` mock에 `unstable_rethrow: vi.fn()`(no-op) 추가 — 실제 구현도 Next 다이내믹 에러가 아닌 일반 에러는 통과시키므로 mock이 실제 동작과 일치.
- (검토했으나 채택하지 않은 대안: `app/admin/layout.tsx`에 `export const dynamic = 'force-dynamic'` 추가. 증상은 회피되지만 `checkAdmin`이 Next 내부 신호를 삼키는 근본 구조는 그대로 남아 다른 호출 경로에서 재발할 수 있어, 근본 원인을 고치는 이 방식을 택했다.)

## 검증

- `npm run build` 성공. `/admin`, `/admin/reports/[reportId]`, `/admin/reviews/[requestId]` 모두 `ƒ` (Dynamic)로 표시됨.
- `tests/admin/authorization.test.ts` + `tests/admin/moderation.test.ts`: 71개 테스트 전부 통과 (비관리자/DB 장애 시 차단되는 "fails closed" 테스트 포함, 기존 Phase 7 검증 유지).
- `npx tsc --noEmit`: 에러 없음.
- 전체 `vitest run`에서 wallet/work-crud 등 일부 파일이 실패했으나 로컬 Supabase 연결 문제(`Database error creating new user`, 타임아웃)로 이 수정과 무관함을 확인.

## 커밋

`1006d38` — `fix(07): BUG-03 admin 빌드 프리렌더 실패`

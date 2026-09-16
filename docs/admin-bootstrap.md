# 관리자 부트스트랩 · 권한 부여/회수 런북

Phase 7 (D-01, D-04, D-05). 관리자 자격은 `admin_users` 테이블에만 존재하며 `profiles.role`(reader/writer)과 무관하다. 작가이면서 관리자인 계정도 작가 기능을 그대로 유지한다.

## 원칙

- **앱 안에 권한 부여 경로가 없다.** `/admin` 관리자 관리 화면, "첫 가입자 = 관리자" 규칙, 공개 부트스트랩 API는 존재하지 않으며 만들지 않는다.
- 권한 부여/회수는 **DB 소유자 권한의 SQL**(Supabase SQL Editor 또는 `postgres` 역할 접속)에서 `grant_admin` / `revoke_admin` 함수로만 한다. 이 함수는 `anon`, `authenticated`, `service_role` 모두 실행할 수 없다 — 서비스 키가 유출돼도 관리자를 만들 수 없다.
- 두 함수는 **하나의 트랜잭션 안에서** 멤버십 행과 `admin_actions` 감사 행을 함께 쓴다. 감사 기록 없는 권한 변경은 불가능하다.
- 멤버십 이력은 불변이다. 회수는 행 삭제가 아니라 `revoked_at` 기록이며, 재부여 시 새 행이 생긴다.
- **기본/고정 관리자 UUID는 없다.** 마이그레이션·시드·코드 어디에도 운영 계정 식별자를 넣지 않는다.

## 1. 대상 계정 확인 (명시적 UUID)

대상자가 먼저 일반 로그인으로 가입해 `profiles` 행이 있어야 한다. 이메일로 UUID를 찾되, **반드시 결과를 눈으로 확인한 뒤** 다음 단계에 UUID를 직접 붙여넣는다(서브쿼리로 자동 연결하지 않는다).

```sql
select u.id, u.email, p.role, p.deleted_at
from auth.users u join public.profiles p on p.id = u.id
where u.email = 'operator@example.com';
```

- 결과가 정확히 1행이고 `deleted_at`이 `null`인지 확인한다.

## 2. 권한 부여

```sql
begin;
select public.grant_admin(
  p_user_id        => '00000000-0000-0000-0000-000000000000'::uuid, -- 1단계에서 확인한 UUID
  p_reason         => '운영 담당자 지정 (티켓 OPS-123)',
  p_operator_label => '실행자 이름 또는 이메일'
);
-- 확인: 활성 멤버십 1행 + admin_grant 감사 1행
select id, user_id, granted_by_label, grant_reason, granted_at
  from public.admin_users where user_id = '00000000-0000-0000-0000-000000000000' and revoked_at is null;
select action_type, actor_label, reason, created_at
  from public.admin_actions where target_user_id = '00000000-0000-0000-0000-000000000000'
  order by created_at desc limit 1;
commit;   -- 확인 결과가 기대와 다르면 rollback;
```

기존 관리자가 다른 사람을 임명하는 경우 `p_granted_by => '<기존 관리자 UUID>'`를 추가하면 활성 관리자인지 검사한 뒤 `actor_id`로 기록된다.

거부되는 입력: UUID 누락(`explicit_user_id_required`), 빈 사유(`reason_required`), 실행자 표시 누락(`operator_label_required`), 없는/삭제된 계정(`profile_not_found`), 이미 활성(`admin_already_active`).

## 3. 권한 회수

```sql
begin;
select public.revoke_admin(
  p_user_id        => '00000000-0000-0000-0000-000000000000'::uuid,
  p_reason         => '담당 변경',
  p_operator_label => '실행자 이름 또는 이메일'
);
select count(*) from public.admin_users
  where user_id = '00000000-0000-0000-0000-000000000000' and revoked_at is null;  -- 0 이어야 함
commit;
```

회수는 즉시 효력이 있다. `requireAdmin()`은 요청마다 세션과 활성 멤버십을 다시 조회하며 캐시하지 않으므로, 이미 열려 있던 관리자 탭의 다음 요청부터 404/거부가 된다.

## 4. (선택) 마이그레이션 시점 시드

`0006_admin_foundation.sql` 끝의 시드 블록은 **운영자가 같은 세션에서 값을 명시적으로 지정했을 때만** 동작한다. 지정하지 않으면 아무것도 하지 않고 `admin bootstrap skipped` 알림만 남긴다.

```sql
set app.bootstrap_admin_user_id = '00000000-0000-0000-0000-000000000000';
set app.bootstrap_admin_operator = '실행자 이름 또는 이메일';
-- 이어서 같은 세션에서 0006_admin_foundation.sql 실행
```

- 저장소의 `scripts/apply-migration.mjs`는 별도 세션을 열기 때문에 위 설정이 전달되지 않는다 → 이 경우 시드는 건너뛰어지며, 마이그레이션 후 2단계 SQL로 부여한다(권장 경로).
- 지정한 UUID가 존재하지 않거나 삭제된 계정이면 마이그레이션 전체가 실패한다(잘못된 대상에 조용히 부여하지 않는다).
- 이미 활성 관리자면 건너뛴다.

## 5. 점검 쿼리

```sql
-- 현재 활성 관리자
select a.user_id, u.email, a.granted_at, a.granted_by, a.granted_by_label
  from public.admin_users a join auth.users u on u.id = a.user_id
  where a.revoked_at is null;

-- 권한 변경 이력
select created_at, action_type, actor_id, actor_label, target_user_id, reason
  from public.admin_actions where action_type in ('admin_grant', 'admin_revoke')
  order by created_at desc;

-- 브라우저/서비스 역할이 부여 함수를 실행할 수 없는지
select has_function_privilege('authenticated', 'public.grant_admin(uuid,text,text,uuid)', 'execute') as authenticated_can,
       has_function_privilege('service_role',  'public.grant_admin(uuid,text,text,uuid)', 'execute') as service_can;
-- 둘 다 false 여야 함
```

## 앱 쪽 경계 요약

- `lib/admin/auth.ts`
  - `checkAdmin()` — 세션 사용자 → 삭제되지 않은 프로필 → 활성 멤버십을 매 호출마다 확인. 실패 시 `unauthenticated` / `not_admin` / `unavailable`.
  - `requireAdminPage()` — `/admin` 서버 컴포넌트용. 비관리자는 `notFound()`(404), 권한 조회 장애는 일반 오류.
  - `withAdminAction()` — 내보내는 모든 관리자 Server Action을 감싼다. 거부 시 작업 함수 자체를 실행하지 않고 `{ ok: false, error: 'not_found' }`.
  - 행위자 ID는 항상 세션에서 파생되며 클라이언트 입력으로 받지 않는다.
- 레이아웃의 확인은 Server Action 보호를 대신하지 않는다. 각 액션이 스스로 `withAdminAction`/`requireAdmin`을 호출해야 한다.

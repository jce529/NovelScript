---
phase: 12-mcp-oauth
plan: 02
subsystem: database
tags: [mcp, oauth, postgres, rls, supabase]
requires:
  - phase: 12-mcp-oauth/12-01
    provides: 사람 승인 스파이크와 auth.sessions/auth.oauth_consents 조회 실측
provides:
  - MCP 연결 grant 스키마와 연결/해제/매 호출 검증 RPC
  - 민감 테이블 OAuth 직접 REST 접근 제한 정책
  - 일회용 DB에서 실행할 두 DB suite
affects: [12-03, 12-04, 12-06, phase-13]
tech-stack:
  added: []
  patterns: [SECURITY DEFINER fixed search_path, live grant/session/consent validation, RESTRICTIVE RLS]
key-files:
  created:
    - supabase/migrations/0037_mcp_oauth_grants.sql
    - supabase/migrations/0038_oauth_sensitive_rls.sql
    - tests/mcp/grants.database.test.ts
    - tests/mcp/sensitive-rls.database.test.ts
    - .planning/phases/12-mcp-oauth/12-02-SUMMARY.md
  modified: []
key-decisions:
  - 연결/해제 RPC도 살아있는 브라우저 auth.sessions 행을 확인한다.
  - 기존 민감 테이블 9개와 ai_usage에 OAuth 제한 정책을 둔다.
requirements: [MCP-01, MCP-08]
requirements-completed: [] # 실DB 및 수동 게이트 12-06 전에는 완료로 판정하지 않음
completed: 2026-10-25
---

# Phase 12 Plan 02: MCP OAuth grant와 민감 RLS

**MCP 호출마다 자체 grant·Auth 세션·동의·프로필을 대조하는 RPC와 OAuth REST 직접 접근을 막는 민감 테이블 정책을 작성했다.** DB 적용과 실행 검증은 12-06 수동 게이트에 남아 있다.

## 작업 결과

1. **Task 1 — grant 스키마/RPC:** `mcp_connections`에 사용자·OAuth client ID의 unique 조합, 클라이언트명/호스트, 두 scope, 연결/마지막 사용/해제 시각을 정의했다. 본인 브라우저 SELECT만 허용한다. `mcp_connect`는 동일 작가·이름·호스트의 이전 활성 client를 해제하고 `uuid[]`로 반환한다. 승인 Server Action이 각 ID에 `revokeGrant`를 호출해야 한다. `mcp_disconnect`는 본인 연결을 해제한다. 인수 없는 `mcp_authorize_call`은 JWT의 sub/client_id/session_id, 살아있는 자체 grant, `auth.sessions`, `auth.oauth_consents`, 미탈퇴 프로필을 확인하고 승인 호출만 마지막 사용 시각을 약 60초 단위로 갱신한다. 세 함수 모두 `SECURITY DEFINER`, `search_path=''`, 완전 수식 테이블 참조, authenticated 전용 EXECUTE를 사용한다.
2. **Task 2 — 민감 RLS:** `wallets`, `ledger_entries`, `byok_keys`, `byok_validation_log`, `orders`, `order_items`, `entitlements`, `payment_orders`, `mcp_connections`와 추가 계정 사용량 테이블 `ai_usage`에 `client_id is null`의 `AS RESTRICTIVE FOR ALL` 정책을 정의했다. 없는 테이블은 `to_regclass`로 건너뛰고 NOTICE를 남긴다. 기존 owner 정책과 테이블 권한은 유지한다. DB suite는 정책 catalog, 실제 OAuth bearer REST, 브라우저 owner 접근, service role 내부 접근을 검증하도록 작성했다.

## 설계 입력 및 편차

- 입력 **1:** `RETURNS TABLE` 컬럼은 `out_user_id`/`out_scopes`로 선언했다. 활성 grant 정확히 1행 단언을 추가했다.
- 입력 **2:** 재연결 RPC가 이전 `oauth_client_id` 배열을 반환한다. SQL 안에서 Auth API를 호출하지 않는다.
- 입력 **3:** 호출 RPC는 인수가 없고 JWT·세션·동의·미탈퇴 상태를 확인하며, 마지막 사용 갱신을 조건부로 수행한다.
- 입력 **4:** 스파이크 SQL은 참고만 하고 0037을 새로 작성했다.
- 입력 **5:** 0038은 확인된 민감 테이블과 추가 `ai_usage`를 대상으로 한다. **D-17에 따라 Phase 13 착수 전 모든 `public` 테이블로 OAuth 제한을 확대해야 한다.** 스파이크 S11의 wallets/profiles/mcp_connections 노출 중 profiles는 이번 민감 테이블 범위 밖이므로 확대 작업에 포함해야 한다.
- 입력 **6:** 두 파일은 `*.database.test.ts`이며 `SUPABASE_DB_URL` 마커, 일회용 ref와 API/DB URL 일치 가드가 있다. 실제 bearer 토큰은 12-06에서만 공급하며 이번에는 실행하지 않았다.
- 입력 **7:** 번호 재확인 결과 최고 **0036**, **0022 중복**, **0028·0031 결번**이다. 새 번호는 0037/0038이다.
- **편차 [Rule 2 — 보안 필수 기능]:** 계획의 연결/해제 RPC에도 브라우저 `session_id`의 `auth.sessions` 생존 확인을 추가했다. 로그아웃된 브라우저 JWT가 만료 전 RPC를 호출하는 경로를 막기 위함이다.
- **편차 [Rule 2 — 민감 데이터]:** 기존 마이그레이션의 계정별 `ai_usage`도 민감 목록에 추가했다. `payment_topup_tiers`는 사용자/정산 기록이 아닌 공개 가격 목록이라 포함하지 않았다.
- 사용자 지시에 따라 커밋, STATE/ROADMAP/REQUIREMENTS, docs, graphify-out 갱신은 하지 않았다. 설치된 `node_modules/next/dist/docs/`가 없어 로컬 Next 가이드는 읽을 수 없었으며, 이번 작성 파일에는 Next API 사용이 없다.

## 마이그레이션 대상과 보류 항목

- **건너뛴 테이블:** 저장소 마이그레이션 정적 목록 기준 없음. 0038의 존재 가드는 실제 DB에서 없는 테이블을 NOTICE로 보고한다. 실제 건너뜀 0 여부는 12-06에서 판정한다.
- **12-06 실DB 게이트:** 0037/0038 적용과 함수 컴파일, Auth 내부 컬럼/권한, DB suite 실패 0·skipped 0, 실제 OAuth bearer REST 차단(403 또는 빈 결과), 브라우저 owner 접근 및 service role 회귀, 동일 토큰 해제 후 차단, 60초 스로틀, `revokeGrant`와 RPC의 결합, refresh token 발급·갱신을 확인한다. 공유 Supabase 프로젝트에는 적용하지 않는다.

## 정적 검증

- 두 필수 `rg -n` 명령: 0037의 세 함수/고정 search_path와 0038의 RESTRICTIVE 정책/대상 이름 확인.
- `git diff --check`: 통과. 신규 파일은 아직 untracked여서 이 명령의 검사 범위 밖이며, 별도 4개 신규 코드 파일의 줄끝 공백 검사는 모두 통과.
- `npx --no-install tsc --noEmit`: 실패, 기존 `app/layout.tsx:23`의 `TS2304: Cannot find name 'LayoutProps'` 1건. `git show HEAD:app/layout.tsx`에서 같은 줄을 확인했고 신규 파일 오류는 출력되지 않았다.
- DB 연결 명령, 마이그레이션 적용, DB 테스트 실행은 하지 않았다.
- 완료 시 `git status --short`로 허용된 5개 신규 파일 외 변경이 없는지 확인한다.

## Self-Check: PASSED

허용된 5개 신규 파일 존재 및 수정 범위 확인. 실DB 기능 검증 상태는 **보류**다.

## 검증 후 수정 (오케스트레이터, 2026-10-25)
- sonnet 검증이 `grants.database.test.ts`의 60초 스로틀 테스트가 단일 트랜잭션의 고정 `now()` 때문에 무효임을 지적했다(WARNING). `last_used_at`을 `now()-30초`/`now()-61초`로 옮겨 "60초 안은 불변, 60초 밖은 갱신"을 단언하도록 고쳤다. 실DB 실행은 12-06에서 한다.
- `npx tsc --noEmit`의 유일한 오류는 기존 `app/layout.tsx:23` `LayoutProps`이며 이번 변경과 무관하다(해당 파일은 미수정).

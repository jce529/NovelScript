---
phase: 13-mcp-read-context
plan: 01b
type: execute
wave: 2
depends_on: [13-01]
files_modified:
  - supabase/migrations/0039_mcp_read_boundary.sql
  - tests/mcp/read-boundary.database.test.ts
requirements: [MCP-02, MCP-03, MCP-04]
autonomous: true
must_haves:
  truths:
    - OAuth bearer cannot bypass the table boundary through an existing SECURITY DEFINER RPC.
    - Browser sessions and anonymous readers retain their existing allowed RPC behavior.
  artifacts:
    - path: supabase/migrations/0039_mcp_read_boundary.sql
      provides: OAuth guards for exposed privilege-elevating RPCs
    - path: tests/mcp/read-boundary.database.test.ts
      provides: RPC catalog and representative bypass regression checks
  key_links:
    - from: tests/mcp/read-boundary.database.test.ts
      to: supabase/migrations/0039_mcp_read_boundary.sql
      via: Catalog coverage and OAuth RPC bypass assertions
    - from: supabase/migrations/0039_mcp_read_boundary.sql
      to: supabase/migrations/0009_blind_access.sql
      via: read_chapter_content OAuth guard retains browser and anonymous behavior
---

<objective>
13-01의 테이블 경계 뒤에 SECURITY DEFINER RPC 우회 경로를 전수 감사하고 봉쇄한다.
Purpose: D-17 경계가 직접 RPC 호출에도 유지되게 한다.
Output: RPC 목록·분류를 담은 13-01b-SUMMARY와 필요한 SQL·DB 테스트 보강.
</objective>

<execution_context>
@.planning/phases/13-mcp-read-context/13-CONTEXT.md
@.planning/phases/13-mcp-read-context/13-01-SUMMARY.md
</execution_context>

<context>
@supabase/migrations/0039_mcp_read_boundary.sql
@supabase/migrations/0009_blind_access.sql
@tests/mcp/read-boundary.database.test.ts
@.planning/phases/13-mcp-read-context/13-VALIDATION.md

13-01의 일회용 DB 환경 파일 규약과 ref 가드를 그대로 적용한다. `read_chapter_content`는 공개 `can_view` 분기가 있으므로 OAuth 직접 호출을 막아야 한다. 새 `mcp_read_owned_chapter_content`와 `mcp_authorize_call`은 grant 검사 경로다.

| 처리 | 판정 기준 | 실행 |
|---|---|---|
| 차단 | OAuth에 필요 없는 공개 읽기·쓰기·결제 또는 권한 상승 RPC | OAuth `client_id` 호출을 함수 내부에서 거부하거나 동등한 권한/서명 경계로 차단. 웹·익명 기존 경로 보존. |
| 가드 | MCP 읽기에 필요한 RPC이며 OAuth가 직접 호출해도 되는 경우 | 함수 내부에서 live grant·사용자 소유권·대상 범위를 재검증. RLS만 믿지 않는다. |
| 유지 | OAuth 직접 호출 불가, 권한 상승 없음, 또는 이미 동등한 grant·소유권 가드가 있는 경우 | 근거와 최종 EXECUTE 주체를 목록에 기록하고 회귀 확인. |
</context>

<tasks>
<task type="auto" tdd="true">
  <name>Task 1: 공개 SECURITY DEFINER RPC 전수 목록화와 OAuth 우회 차단</name>
  <files>supabase/migrations/0039_mcp_read_boundary.sql, tests/mcp/read-boundary.database.test.ts</files>
  <behavior>
    - OAuth bearer는 기존 `read_chapter_content`를 직접 호출해 타인 공개 회차를 읽지 못한다.
    - authenticated EXECUTE가 열린 기존 SECURITY DEFINER 읽기·쓰기·결제 RPC로 타인 데이터나 금지 테이블에 우회 접근·변경할 수 없다.
    - 웹 세션과 익명 독자의 기존 공개 본문 조회는 유지된다.
  </behavior>
  <action>마이그레이션 전체의 함수 최종 정의와 실제 일회용 DB 카탈로그의 SECURITY DEFINER·EXECUTE grant를 전수 목록화하고, 각 함수를 위 표의 차단/가드/유지 중 하나로 판정한다. 판정·근거·처리 방법을 먼저 `13-01b-SUMMARY.md`에 기록한다. `read_chapter_content`는 OAuth `client_id`를 거부하도록 재정의하되 anon/일반 웹 세션 공개 읽기를 유지한다. 다른 공개 RPC의 우회 가능 경로에도 표의 조치를 적용한다. 기존 호출자 시그니처와 브라우저 동작을 보존하고 SQL 최종 함수 정의를 기준으로 작업한다. 테스트에 RPC 목록과 대표 OAuth 차단 호출을 넣고, 미분류 RPC가 있으면 13-05 도구 등록 전에 실패시킨다. `read-boundary.database.test.ts`의 `SUPABASE_DB_URL` DB_MARKER를 유지한다.</action>
  <verify><automated>node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/mcp/read-boundary.database.test.ts tests/mcp/sensitive-rls.database.test.ts --project db</automated>. 실행된 테스트 수 0 초과, skipped 0을 확인한다.</verify>
  <done>OAuth의 RPC 우회가 막히고 기존 웹·독자 호출 회귀가 통과한다. 실제 공개 함수 전수 목록과 각 차단/가드/유지 판정이 13-01b-SUMMARY에 기록된다.</done>
</task>
</tasks>

<verification>13-01의 `.env.disposable` ref 확인 후 일회용 DB에서만 실행하며 테스트 수 0 초과·skipped 0을 요구한다.</verification>
<success_criteria>모든 공개 SECURITY DEFINER RPC가 분류되고 OAuth 우회 경로가 차단된 뒤에만 13-05로 진행한다.</success_criteria>
<output>실행 후 `.planning/phases/13-mcp-read-context/13-01b-SUMMARY.md` 작성.</output>

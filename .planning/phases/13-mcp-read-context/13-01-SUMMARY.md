---
phase: 13-mcp-read-context
plan: 01
subsystem: mcp-db-boundary
tags: [mcp, oauth, rls, supabase, d-17]
requirements: [MCP-02, MCP-03, MCP-04]
requirements-completed: []   # 도구(13-02~05)와 13-01b RPC 감사 뒤 판정
status: complete (uncommitted, 커밋은 사용자 요청 시)
dependency_graph:
  requires: [0037_mcp_oauth_grants, 0038_oauth_sensitive_rls]
  provides: [mcp_grant_is_live, mcp_read_owned_chapter_content, OAuth deny-by-default on 36 public tables, owner/live SELECT on 4 read tables]
  affects: [13-01b, 13-02, 13-03, 13-04, 13-05]
key-files:
  created:
    - supabase/migrations/0039_mcp_read_boundary.sql
    - tests/mcp/read-boundary.database.test.ts
    - tests/mcp/grant-fail-closed.test.ts
    - tests/helpers/disposable-ref.ts
  modified:
    - tests/mcp/cross-user.database.test.ts
    - tests/mcp/revoke-blocks.database.test.ts
    - .planning/phases/13-mcp-read-context/13-VALIDATION.md
decisions:
  - 36개 차단 테이블은 고정 목록이 아니라 적용 시점 카탈로그 루프(4개 읽기 테이블 제외)로 oauth_browser_only를 건다. RLS 꺼진 테이블이 있으면 마이그레이션을 실패시킨다.
  - 네 읽기 테이블에는 oauth_browser_only를 두지 않고 mcp_oauth_owner_select + 명령별 mcp_oauth_no_insert/update/delete를 RESTRICTIVE로 둔다.
  - 본문 RPC는 OAuth live grant 전용이다. 브라우저 세션·anon은 42501로 거부하고, 소유가 아니거나 삭제·미존재면 null을 돌려준다.
  - mcp_grant_is_live·본문 RPC 모두 PUBLIC·anon·service_role EXECUTE를 회수하고 authenticated만 남긴다.
metrics:
  completed: 2026-11-03
  tasks: 2
---

# Phase 13 Plan 01: MCP 읽기 경계(D-17) Summary

OAuth bearer를 40개 public 테이블 전부에서 기본 차단하고, works·chapters·kb_nodes·work_ai_instructions만 live grant 소유자 SELECT로 다시 열었다. 회차 본문은 `can_view` 분기 없는 소유자 전용 RPC로 읽는다. 일회용 DB에서 실증했다.

## 실행 결과

| 명령 | 결과 |
|---|---|
| `tests/mcp/read-boundary.database.test.ts --project db` (0039 적용 전, RED) | 12 failed / 12 (의도된 실패) |
| `tests/mcp/read-boundary.database.test.ts --project db` (적용 후) | **12 passed, skipped 0** |
| `tests/mcp --project db` (Phase 12 회귀 포함 5파일) | **34 passed (34), skipped 0**, 약 134초 |
| `tests/mcp/grant-fail-closed.test.ts --project unit` | **12 passed, skipped 0** |
| `tests/mcp --project unit` | 89 passed (7파일) |
| `npx tsc --noEmit` | 새·수정 파일 오류 0. `app/layout.tsx` `LayoutProps` 오류 1건은 기존(next 생성 타입 부재)으로 범위 밖 |
| `npx eslint --max-warnings=0` (새·수정 테스트 5개) | 통과 |
| 13-VALIDATION ID 검사(Task 2 verify) | 통과 |

실행 후 남은 테스트 행 확인: 테스트 작품·노드 0건.

## 일회용 DB와 적용 방식

- 환경: 워크트리 루트 `.env.disposable`(내용 미출력). `node scripts/check-env.mjs`로 키 존재만 확인.
- 이 파일에는 `MCP_DISPOSABLE_PROJECT_REF`가 **없고** `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF`만 있었다. 값 비교 스크립트로 이 ref가 API URL ref와 같고 DB URL에 포함되며 공유 ref(`ymudwg…`)가 아님을 확인한 뒤, scratchpad 실행 래퍼가 **자식 프로세스 환경에만** `MCP_DISPOSABLE_PROJECT_REF`로 넣었다(12-06이 `$env:`로 넣던 방식과 동등). 래퍼도 같은 ref 검사를 하고 불일치·공유 ref면 종료한다. 파일은 수정하지 않았다.
- 실행 전 DB 상태: 0037·0038 적용됨(`mcp_authorize_call` 존재, `oauth_browser_only` 10개).
- 0039 적용: 기존 `scripts/apply-migration.mjs 0039_mcp_read_boundary.sql`(postgres 직결, `SUPABASE_DB_URL`)를 위 래퍼로 실행. 적용 순서 0037 → 0038 → 0039. 공유 프로젝트 변경 0건.

## 카탈로그 대조 (일회용 DB `pg_class`/`pg_namespace`, relkind r/p, 영구)

실제 40개 = 13-PLAN-NOTES 40개, **차이 없음**. 뷰·물리화 뷰·외부 테이블 0개. RLS 꺼진 테이블 0개.

| 분류 | 개수 | 테이블 | 0039 정책 |
|---|---:|---|---|
| 0038 민감(유지·재생성) | 10 | wallets, ledger_entries, byok_keys, byok_validation_log, orders, order_items, entitlements, payment_orders, mcp_connections, ai_usage | `oauth_browser_only` RESTRICTIVE ALL |
| 사용자/독자 | 7 | profiles, work_likes, reading_progress, work_subscriptions, work_bookmarks, chapter_reading_state, reports | 같음 |
| 관리자 | 5 | admin_users, admin_actions, user_sanctions, warning_acknowledgements, moderation_review_requests | 같음 |
| AI 문서 계획 | 4 | ai_doc_activation_approvals, ai_doc_activation_evidence, ai_doc_plan_shadow_log, ai_doc_plan_decision_log | 같음 |
| 기타 | 5 | ai_generation_locks, kb_template_seed_catalog, kb_template_backfill_copies, payment_topup_tiers, publication_notifications | 같음 |
| 세계수 | 5 | world_branches, world_branch_docs, world_eras, world_era_placements, world_branch_notices | 같음 |
| MCP 조건부 읽기 | 4 | works, chapters, kb_nodes, work_ai_instructions | `mcp_oauth_owner_select`(live grant AND owner) + `mcp_oauth_no_insert/update/delete` |

차단 36 + 읽기 4 = 40. 테스트가 이 기대값을 하드코딩해 새 테이블이 생기면 실패한다.

## 증명된 것 (read-boundary 12건)

- 카탈로그: 40개 분류, 36개 RESTRICTIVE ALL `client_id IS NULL`, 4개 SELECT 정책에 `mcp_grant_is_live()`·`auth.uid()`, DML 정책 3종.
- 함수: 두 함수 모두 SECURITY DEFINER, STABLE, `search_path=""`, anon·service_role·PUBLIC EXECUTE 없음, authenticated만 있음. 본문 RPC 소스에 `can_view` 없음, owner·양쪽 `deleted_at` 검사.
- 차단 36개: OAuth claim으로 모든 테이블 0행 또는 권한 거부, 같은 사용자의 브라우저 claim은 profiles·mcp_connections·work_likes 행이 보임. REST 읽기 0행, work_likes POST·profiles PATCH 거부·값 불변, 브라우저 좋아요/취소 정상.
- 네 테이블: OAuth는 자기 작품·회차(초안·유료·무료·블라인드)·작품/계정공유 노드·자기 지시만. 브라우저·anon이 보는 타인 공개 작품·회차를 OAuth는 0행, 역방향(B→A)도 0행. `content` 컬럼 REST 읽기 거부 유지. 12개 OAuth 쓰기 전부 거부, DB 스냅샷 불변, SQL 수준 insert 42501·update/delete 0행. 브라우저 소유자 읽기·회차 제목 수정·지시 추가/삭제·노드 이름 수정 정상.
- 폐기: `mcp_disconnect`만, `revokeGrant`만, grant 행 없음 세 경우 모두 만료 전 같은 토큰이 네 테이블 0행·본문 RPC 거부. 다른 live 토큰은 영향 없음.
- 본문 RPC: 자기 초안·유료·무료·블라인드 본문 반환, 타인 공개·삭제 회차·삭제 작품 소속·미존재 ID·타인 토큰은 null, 브라우저·anon은 거부.

## grant-fail-closed (단위 12건)

`@supabase/supabase-js`의 `createClient`를 mock해 **운영 verifier(기본 팩토리)**가 만드는 클라이언트의 `rpc('mcp_authorize_call')`에 DB 오류·권한 거부·함수 없음·네트워크 거부·타임아웃·동기 throw·오류+행 동시·undefined 결과를 주입했고 전부 인증 거부. 클라이언트 생성 실패도 거부. 성공 뒤 실패 시 허용 캐시 없음. 로그에 사유 코드만 남고 bearer 없음. 대조군에서 RPC 이름·anon key·caller bearer 헤더 확인.

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking] `MCP_DISPOSABLE_PROJECT_REF` 키 부재**: `.env.disposable`에 해당 키가 없었다. 파일을 고치지 않고 같은 파일의 일회용 ref를 검증 후 자식 프로세스 환경에만 매핑했다(위 "적용 방식").
2. **[Rule 1 - 테스트 버그] chapters PATCH의 `return=representation`**: 기본 `select=*`가 `content`(컬럼 SELECT 없음)를 포함해 0039 전에도 브라우저 PATCH가 403이었다. chapters 쓰기 요청에 `select=id`를 붙여 403이 쓰기 자체에서만 나오게 했다. 단언은 그대로.
3. **[Rule 1 - 테스트 버그] proconfig 비교**: 배열 텍스트 이스케이프 때문에 정규식이 실패했다. 배열 원소 `search_path=""` 포함 여부로 정확히 비교하도록 바꿨다(동등 이상 강도).
4. **[Rule 2 - 정리 누락] RED 실행에서 OAuth INSERT가 works에 행 1개를 남김**: 0039 전에는 OAuth가 works INSERT 가능했다(0039가 막는 실제 구멍). 남은 행과 테스트 계정을 지웠고, afterAll이 테스트 작가 소유 작품 전체를 지우도록, 쓰기 스냅샷이 작가 소유 작품 전체를 보도록 보강했다.
5. **[Rule 3] dotAll 정규식 플래그가 tsconfig target에서 TS1501**: `[\s\S]*`로 교체.

Next.js 가이드: 이 plan은 route 코드를 건드리지 않아 `node_modules/next/dist/docs/` 열람을 생략했다(의존성은 `npm ci`로 설치됨).

## 미완료 / 후속

- 13-01b: SECURITY DEFINER RPC 전수 감사(특히 `read_chapter_content`의 OAuth 직접 호출 차단). 그 전에는 13-05 도구 등록 금지.
- 0039 이후 새로 만드는 public 테이블은 자동 차단되지 않는다. read-boundary 카탈로그 테스트가 40개 기대값으로 실패시켜 잡는다.
- 공유 DB 적용은 병합 후 별도 승인 대상. 0039 번호는 병합 직전 재대조.
- 커밋하지 않음(지시대로). ROADMAP·STATE·REQUIREMENTS·SSOT·graphify 미수정. 워크트리의 `.agents/skills/phase-session-dispatch/`는 이 plan과 무관한 기존 미추적 파일이라 손대지 않음.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 존재: 0039 마이그레이션, read-boundary·grant-fail-closed 테스트, disposable-ref 헬퍼, 13-VALIDATION 갱신.
- 커밋: 지시상 없음(검사 대상 아님).

---
phase: 13-mcp-read-context
plan: 01b
subsystem: mcp-db-boundary
tags: [mcp, oauth, security-definer, rpc, supabase, d-17]
requirements: [MCP-02, MCP-03, MCP-04]
requirements-completed: []   # 도구(13-02~05) 뒤 판정
status: complete (uncommitted, 커밋은 사용자 요청 시)
dependency_graph:
  requires: [13-01, 0039_mcp_read_boundary (13-01 판)]
  provides: [mcp_reject_oauth_caller, OAuth 42501 guard on 29 exposed SECURITY DEFINER RPCs, exposed-RPC catalog test]
  affects: [13-02, 13-03, 13-04, 13-05]
key-files:
  modified:
    - supabase/migrations/0039_mcp_read_boundary.sql
    - tests/mcp/read-boundary.database.test.ts
decisions:
  - 감사 범위는 public의 SECURITY DEFINER 전부(93)이고, OAuth가 직접 부를 수 있는 것(anon·authenticated·PUBLIC EXECUTE, 37)을 차단/가드/유지로 판정한다. 나머지 56은 service_role 또는 소유자 전용이라 유지.
  - 차단은 함수 내부 첫 문장 `public.mcp_reject_oauth_caller()`(client_id가 있으면 42501)로 한다. 웹 세션·anon·service_role은 client_id가 없어 동작이 그대로다. 시그니처·소유자·ACL 변경 없음.
  - SQL 함수 6개는 최종 정의(0036/0009/0008)를 그대로 옮기고 가드만 더했다. plpgsql 23개는 카탈로그의 현재 정의에서 최상위 `begin` 다음 줄에 가드를 끼워 넣는다(300줄짜리 save_world_timeline 등을 손으로 복사하지 않기 위함). 이미 가드가 있으면 건너뛰어 재적용 가능.
  - current_user_can_write는 쓰기 RESTRICTIVE 정책 안에서 쓰이므로 예외를 던지지 않고 OAuth에 false를 돌려준다.
  - can_view는 RLS 정책에서 쓰이지 않고(확인) 호출자의 소장 여부를 드러내므로 차단(42501).
  - world_work_reader_visible·world_work_public_meta_visible은 anon과 같은 공개 가시성만 답하고 공개 읽기 정책 안에서 쓰여 유지한다(네 읽기 테이블은 mcp_oauth_owner_select가 따로 OAuth를 소유자로 좁힌다).
metrics:
  completed: 2026-11-03
  tasks: 1
---

# Phase 13 Plan 01b: SECURITY DEFINER RPC 우회 봉쇄 Summary

public SECURITY DEFINER 함수 93개를 전부 목록화했다. OAuth bearer가 직접 부를 수 있는 37개 중 29개는 함수 첫 문장에서 OAuth `client_id` 호출을 42501로 거부하고, 3개는 live grant 가드, 5개는 근거와 함께 유지로 판정했다. `read_chapter_content`로 타인 공개 회차를 읽던 구멍을 RED에서 실제로 확인한 뒤 막았다. 웹 세션과 익명 독자의 기존 RPC 동작은 그대로 유지된다.

## 실행 결과

| 명령 (모두 `.env.disposable` + 일회용 ref 래퍼) | 결과 |
|---|---|
| `read-boundary.database.test.ts --project db` (0039 재적용 전, RED) | 4 failed / 16. OAuth `read_chapter_content(타인 공개 회차)`가 200, `get_chapter_access_state`가 200, 가드 없음 |
| `apply-migration.mjs 0039_mcp_read_boundary.sql` 1회차 | 성공. `injected into 23 plpgsql RPCs` |
| 같은 명령 2회차 (재적용 확인) | 성공. `injected into 0`, 정책 재생성 |
| `read-boundary` + `sensitive-rls` `--project db` | **19 passed (19), skipped 0** |
| `tests/mcp --project db` (5파일) | **38 passed (38), skipped 0**, 약 175초 (13-01의 34 + 신규 4) |
| 결제·독자·세계수·관리자 DB 회귀 | 아래 "회귀" 절 |
| `npx eslint --max-warnings=0 tests/mcp/read-boundary.database.test.ts` | 통과 |
| `npx tsc --noEmit` | 새 오류 0 (기존 `app/layout.tsx` 1건 제외) |

## 감사 방법

- 마이그레이션: `0001`~`0039`에서 해당 함수의 마지막 `create [or replace] function`을 최종 정의로 삼았다(예: `can_view`·`list_chapter_access`·`get_chapter_access_state`·`get_world_tree_metric_baseline`은 0036, `read_chapter_content`는 0009, `current_user_can_write`는 0008).
- 카탈로그: 일회용 DB `pg_proc`(schema public, 확장 소속 제외)에서 `prosecdef`, 언어, `proacl`, `has_function_privilege(anon|authenticated|service_role, execute)`를 뽑고 `pg_get_functiondef`로 본문을 대조했다. 마이그레이션 최종 정의와 카탈로그 본문이 일치했다.
- 노출 기준: anon·authenticated·PUBLIC 중 하나라도 EXECUTE를 가지면 OAuth bearer(role authenticated)가 PostgREST `/rpc`로 직접 부를 수 있다고 본다. `pg_graphql`은 설치되지 않았다(확장: plpgsql, pg_stat_statements, uuid-ossp, pgcrypto, supabase_vault).
- 합계: SECURITY DEFINER 93 = 노출 37 + 비노출 56. 판정은 **차단 29 / 가드 3 / 유지 61** (노출 유지 5 + 비노출 56).

## 노출된 SECURITY DEFINER RPC 37개 (최종 EXECUTE: 처리 후에도 그대로)

EXECUTE 열: A=anon, U=authenticated, S=service_role, P=PUBLIC. 차단 함수의 웹·익명 동작은 그대로다.

| # | 함수 | 종류 | EXECUTE | 판정 | 근거 | 처리 |
|---|---|---|---|---|---|---|
| 1 | read_chapter_content(uuid) | sql 읽기 | A U S | 차단 | `can_view` 공개 분기로 타인 공개·소장 본문을 반환한다(RED에서 실증). OAuth는 `mcp_read_owned_chapter_content`를 쓴다 | 0009 정의 + WHERE 가드 |
| 2 | can_view(uuid,uuid) | sql 판정 | A U S | 차단 | 호출자 소장(`chapter_entitled`)을 드러낸다. RLS 정책에서는 쓰이지 않는다(pg_policies 확인) | 0036 정의 + WHERE 가드 |
| 3 | list_chapter_access(uuid) | sql 읽기 | A U S | 차단 | 회차별 소장·블라인드 사유 | 0036 정의 + WHERE 가드 |
| 4 | get_chapter_access_state(uuid,uuid) | sql 읽기 | A U S | 차단 | 소장·블라인드 사유 | 0036 정의 + WHERE 가드 |
| 5 | get_world_tree_metric_baseline() | sql 읽기 | A U | 차단 | 전체 작품 집계. OAuth에 필요 없음 | 0036 정의 + WHERE 가드 |
| 6 | current_user_can_write() | sql 판정 | A U S | 차단(false) | 자기 제재 상태. 쓰기 RESTRICTIVE 정책 안에서 쓰여 예외 대신 false | 0008 정의 + `client_id is null` 조건 |
| 7 | get_world_tree(uuid,boolean) | plpgsql 읽기 | A U | 차단 | 소유자면 세계수 전체 투영(차단 테이블 world_*) | 첫 문장 가드 |
| 8 | get_world_branch_diff(uuid) | plpgsql 읽기 | U | 차단 | 초안 분기 문서 차이(world_branch_docs) | 첫 문장 가드 |
| 9 | get_world_branch_eligibility(uuid) | plpgsql 읽기 | U | 차단 | 분기 자격 평가 | 첫 문장 가드 |
| 10 | get_write_access(uuid) | plpgsql 읽기 | U S | 차단 | 자기 profiles 제재 정보 | 첫 문장 가드 |
| 11 | acknowledge_publication_notification(uuid) | plpgsql 쓰기 | U | 차단 | publication_notifications 갱신 | 첫 문장 가드 |
| 12 | acknowledge_warning(uuid) | plpgsql 쓰기 | U | 차단 | warning_acknowledgements 삽입 | 첫 문장 가드 |
| 13 | begin_world_branch(uuid,text,uuid,uuid) | plpgsql 쓰기 | U | 차단 | works·kb_nodes·world_* 생성 | 첫 문장 가드 |
| 14 | confirm_world_branch(uuid,text,uuid) | plpgsql 쓰기 | U | 차단 | 분기 확정·works 갱신 | 첫 문장 가드 |
| 15 | ensure_world_tree(uuid) | plpgsql 쓰기 | U | 차단 | world_* 생성 | 첫 문장 가드 |
| 16 | save_world_timeline(uuid,jsonb,jsonb) | plpgsql 쓰기 | U | 차단 | world_eras·placements 갱신 | 첫 문장 가드 |
| 17 | soft_delete_world_branch(uuid) | plpgsql 쓰기 | U | 차단 | 분기·작품 삭제 | 첫 문장 가드 |
| 18 | mark_branch_notice_read(uuid) | plpgsql 쓰기 | U | 차단 | world_branch_notices 갱신 | 첫 문장 가드 |
| 19 | create_chapter_atomic(uuid,uuid,text,uuid) | plpgsql 쓰기 | U S | 차단 | chapters 삽입(RLS 우회) | 첫 문장 가드 |
| 20 | soft_delete_kb_node(uuid,uuid) | plpgsql 쓰기 | U S | 차단 | kb_nodes·chapters 갱신(RLS 우회) | 첫 문장 가드 |
| 21 | toggle_work_likes(uuid) | plpgsql 쓰기 | U S | 차단 | work_likes 삽입·삭제 | 첫 문장 가드 |
| 22 | toggle_work_bookmarks(uuid) | plpgsql 쓰기 | U S | 차단 | work_bookmarks | 첫 문장 가드 |
| 23 | toggle_work_subscriptions(uuid) | plpgsql 쓰기 | U S | 차단 | work_subscriptions | 첫 문장 가드 |
| 24 | increment_chapter_view(uuid) | plpgsql 쓰기 | A U S | 차단 | chapters.view_count 갱신 | 첫 문장 가드 |
| 25 | open_chapter_reading(uuid,uuid,uuid) | plpgsql 쓰기 | U | 차단 | chapter_reading_state·reading_progress | 첫 문장 가드 |
| 26 | save_chapter_reading(…7) | plpgsql 쓰기 | U | 차단 | chapter_reading_state | 첫 문장 가드 |
| 27 | complete_chapter(uuid,uuid,uuid) | plpgsql 쓰기 | U | 차단 | chapter_reading_state 완독 | 첫 문장 가드 |
| 28 | create_purchase_order(uuid[],uuid) | plpgsql **결제** | A U S | 차단 | orders·order_items 생성, wallets 잠금 | 첫 문장 가드 |
| 29 | pay_purchase_order(uuid) | plpgsql **결제** | A U S | 차단 | `apply_wallet_delta`로 지갑·원장 차감/적립, entitlements 생성 | 첫 문장 가드 |
| 30 | mcp_authorize_call() | plpgsql | U S | 가드 | MCP 인증 경로. sub·client_id·session_id + mcp_connections·auth.sessions·oauth_consents live 검사, 자기 연결 last_used_at만 갱신 | 변경 없음(0037) |
| 31 | mcp_grant_is_live() | plpgsql | U | 가드 | RLS가 부르는 live grant 판정. 자기 grant의 Boolean만 | 변경 없음(13-01) |
| 32 | mcp_read_owned_chapter_content(uuid) | plpgsql | U | 가드 | live grant + 작품 소유 + 삭제 제외 | 변경 없음(13-01) |
| 33 | mcp_connect(uuid,text,text,text[]) | plpgsql 쓰기 | U S | 유지 | 이미 `client_id is not null`이면 42501, 브라우저 세션(oauth_client_id null) 요구 | 변경 없음 |
| 34 | mcp_disconnect(uuid) | plpgsql 쓰기 | U S | 유지 | 위와 같음 | 변경 없음 |
| 35 | world_work_reader_visible(uuid) | sql 판정 | A U S | 유지 | anon과 같은 공개 가시성만. works/chapters 공개 읽기 정책 안에서 쓰임 | 변경 없음 |
| 36 | world_work_public_meta_visible(uuid) | sql 판정 | A U S | 유지 | 위와 같음 | 변경 없음 |
| 37 | handle_new_user() | trigger | A U S P | 유지 | 트리거 함수는 직접 호출할 수 없다("trigger functions can only be called as triggers") | 변경 없음 |

결제·지갑·원장: `apply_wallet_delta`는 SECURITY INVOKER이고 EXECUTE가 service_role뿐이라 OAuth가 직접 부를 수 없다. OAuth가 닿을 수 있던 경로는 `create_purchase_order`·`pay_purchase_order`(→ apply_wallet_delta)뿐이었고 둘 다 차단했다. AI 차감 `settle_service_ai_generation`과 `acquire/release_ai_generation_lock`은 service_role 전용이다(아래).

## 비노출 SECURITY DEFINER 56개: 유지

anon·authenticated·PUBLIC EXECUTE가 없어 OAuth bearer가 직접 부를 수 없다. 권한 상승이 없고 변경도 하지 않았다. 노출 RPC 안에서 내부적으로만 불린다.

| 최종 EXECUTE | 개수 | 함수 |
|---|---:|---|
| service_role (+소유자) | 24 | acquire_ai_generation_lock, release_ai_generation_lock, settle_service_ai_generation, claim_byok_validation, delete_byok_key, get_byok_secret, mark_byok_failed, register_byok_key, set_byok_status, adjust_user_sanction, apply_user_sanction, get_user_sanction_history, list_sanction_users, get_report_group_detail, list_report_groups, list_report_groups_all, moderate_report_group, get_review_request_detail, list_review_requests, resolve_review_request, unblind_moderation_target, purge_account_data, purge_ai_doc_plan_logs, guard_kb_template_policy(트리거) |
| 소유자(postgres)만 | 32 | assert_chapter_reading_access, chapter_entitled, user_can_write, refresh_sanction_cache, sanction_effective_kind, grant_admin, revoke_admin, moderation_lock_actor, moderation_lock_target, moderation_set_blind, moderation_target_blinded, moderation_target_version, clone_world_branch_timeline, world_tree_assert_branch_eligible, world_tree_branch_diff_count, world_tree_branch_diff_rows, world_tree_branch_has_live_children, world_tree_evaluate_branch_eligibility, world_tree_full_projection, world_tree_lock_root_then, world_tree_reader_projection, world_tree_record_source_notice, world_tree_require_writer, world_tree_root_of, world_tree_work_metrics, 트리거 7개(delete_byok_secret_on_key_delete, guard_world_branch_children, guard_world_branch_kb, guard_world_work_children, notify_publication_on_unblind, notify_world_branch_source_change, tombstone_world_branch_on_work_delete) |

참고(SECURITY INVOKER, 감사 대상 밖): authenticated가 부를 수 있는 invoker RPC `create_work`, `ensure_account_template_root`, `reorder_chapters`, `settlement_author_rate_bps`는 호출자 권한으로 돌아 테이블 RLS(13-01의 OAuth 쓰기 금지 정책)가 그대로 적용된다. 새 헬퍼 `mcp_reject_oauth_caller()`는 invoker이며 모든 역할의 EXECUTE를 회수했다(정의자 함수가 소유자 권한으로만 부름).

## 0039 적용 방식

- **헬퍼** `public.mcp_reject_oauth_caller() returns boolean`: `auth.jwt() ->> 'client_id'`가 있으면 `42501 'browser session required'`, 아니면 true.
- **SQL 함수 6개**: 최종 정의를 그대로 옮기고 `where public.mcp_reject_oauth_caller()`만 더했다. 변수 없는 stable 조건이라 one-time filter가 되어, 행을 읽기 전에(없는 ID여도) 먼저 실행된다. 테스트에서 무작위 ID로 실증했다. `current_user_can_write`만 `client_id is null` 조건을 더해 false를 돌려준다.
- **plpgsql 23개**: DO 블록이 서명 목록을 돌며 함수 존재·plpgsql·SECURITY DEFINER를 확인하고, `pg_get_functiondef`의 첫 `begin` 단독 줄 다음에 `perform public.mcp_reject_oauth_caller();`를 넣어 `CREATE OR REPLACE`로 실행한다. 서명·소유자·ACL·search_path·volatility는 그대로다. 가드가 없으면 실패하고, 이미 있으면 건너뛴다.
- **재적용 가능성**: 13-01 판의 0039는 `create function`·`create policy`라 다시 적용할 수 없었다. `create or replace function`과 `drop policy if exists`(mcp_oauth_owner_select, mcp_oauth_no_insert/update/delete)를 더해 재실행해도 안전하게 만들었다. 일회용 DB에서 수정한 0039 전체를 두 번 적용해 두 번 모두 성공했다(2회차 `injected into 0`). 새 마이그레이션 번호는 만들지 않았다.

## 테스트 보강 (read-boundary, 신규 4건)

1. **카탈로그**: 노출 SECURITY DEFINER(anon·authenticated·PUBLIC EXECUTE) 목록이 `EXPOSED_DEFINER_RPCS` 37개 키와 정확히 같아야 한다. **미분류 RPC가 생기거나 새로 노출되면 실패**한다. 차단 28개 본문에 가드 호출이 있는지, plpgsql은 첫 `begin` 바로 다음 줄이 가드인지, `current_user_can_write`의 `client_id is null`, mcp_connect/disconnect의 기존 42501 검사, 헬퍼에 EXECUTE와 definer가 없는지 확인한다.
2. **SQL 직접 호출**: OAuth claim으로 예외를 던지는 차단 RPC 28개를 무작위·null 인자로 부르면 전부 `42501 browser session required`, `current_user_can_write()`는 false다. 같은 사용자의 브라우저 claim에서는 어떤 함수도 이 가드에 걸리지 않고 `current_user_can_write()`가 true다. 모두 rollback한다.
3. **read_chapter_content REST**: OAuth(A·B 토큰)로 타인 공개·자기 무료·자기 초안·미존재 회차 전부 403. 브라우저는 타인 공개 무료 본문과 자기 초안(소유자 분기)을 받는다. 익명은 공개 무료 두 회차를 받고 유료·초안·블라인드는 null.
4. **접근·토글·결제 REST**: OAuth로 get_chapter_access_state, list_chapter_access, can_view, toggle_work_likes, create_purchase_order, pay_purchase_order, get_write_access, get_world_tree 전부 403. 좋아요·주문 행 0, `current_user_can_write`는 false. 브라우저는 true, access_state `readable`, 좋아요 토글 true→false, 주문 RPC가 자기 입력 검증(400)까지 간다(주문 행 0). 익명은 list_chapter_access·can_view가 그대로 동작.

`SUPABASE_DB_URL` 참조(DB_MARKER)는 그대로 둬 db 프로젝트로 직렬 실행된다.

## 회귀 (결제·구매·AI 차감·독자·세계수·관리자)

모두 수정된 0039가 적용된 일회용 DB에서 `--project db`로 돌렸다.

| 실행 | 범위 | 결과 |
|---|---|---|
| 1차 묶음 (23파일, 약 29분) | tests/commerce(3), chapters/order-race, ai/ai-service-settlement, tests/reader(9), tests/world-tree(5), admin/blinding·sanctions·concurrency·foundation | 198 passed, 5 failed, 40 skipped, 2 todo. 실패 5건은 아래 두 파일 |
| 2차 재실행 | commerce/settlement, admin/sanctions, reader/completion·reading-state (`COMPLETION_DB_TEST=1`, `READING_STATE_DB_TEST=1`로 opt-in) | 55 passed, 1 failed (56) |
| 3차 | admin/sanctions의 남은 1건만 `--testTimeout=120000` | 1 passed |

- `commerce/settlement.test.ts` 1차 실패 3건은 `read ECONNRESET`(원격 연결 끊김) 뒤 연쇄 실패였다. 2차에서 9/9 통과(구매 차감·저자 90% 적립·재시도 무중복·잔액 부족).
- `admin/sanctions.database.test.ts` "denies every direct write category…"는 기본 30초 testTimeout 초과다(같은 파일의 대조군 테스트도 31초가 걸린다). 시간 제한만 늘리면 통과하고 단언은 바꾸지 않았다. 1차의 "denies payment…" 실패는 앞 테스트 timeout으로 트랜잭션이 aborted된 연쇄였고 2차에서 통과했다. 이 파일과 settlement는 격리 스키마에 0001~0008을 다시 만들어 롤백하는 구조라 public 함수 변경의 영향을 받지 않는다. 지연 문제로 판단한다.
- 통과한 결제·구매·AI 차감 경로: commerce/database·concurrency(소장 구매 경쟁), settlement, ai-service-settlement(`settle_service_ai_generation`), chapters/order-race(`create_chapter_atomic`), admin/blinding(`can_view`·`read_chapter_content` 블라인드), reader 토글·진도·완독(opt-in 포함), world-tree 분기·타임라인·조회수·가시성.
- 1차의 skipped 40·todo 2는 기존 opt-in 조건 때문이다. completion·reading-state는 2차에서 opt-in으로 돌려 전부 통과했고, world-tree branching race는 `WTREE_BRANCH_RACE_SCHEMA_COMMIT=1`이 필요하다(실제 스키마를 커밋하는 테스트라 돌리지 않음).
- 돌리지 않은 것: `tests/uat/cleanup-uat-accounts.database.test.ts`(UAT 계정 정리용, 이 변경과 무관), Toss 결제 승인 같은 외부 API 경로(웹훅·충전은 service_role 경로라 이번 가드와 무관).

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 3 - Blocking] `MCP_DISPOSABLE_PROJECT_REF` 키 부재**: 13-01과 같다. scratchpad 래퍼가 API URL ref = `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF`, DB URL에 같은 ref가 들어 있음, 공유 ref(`ymudwg…`)가 아님을 확인한 뒤 자식 프로세스 환경에만 `MCP_DISPOSABLE_PROJECT_REF`와 `MCP_PUBLIC_ORIGIN=http://localhost:3000`을 넣었다. `.env.disposable`은 수정하지 않았고 내용도 출력하지 않았다.
2. **[Rule 1 - Bug] CRLF 본문**: 0007에서 만든 함수(`acknowledge_warning` 등)는 본문이 CRLF라 첫 적용에서 `begin` 줄 정규식이 맞지 않아 마이그레이션이 실패했다(트랜잭션 롤백, 반영 0). 줄 끝 CR을 허용하고 보존하도록 고쳐 재적용했다.
3. **[Rule 3] 0039 재적용 불가**: 13-01 판이 `create function`·`create policy`라 다시 적용할 수 없었다. `or replace`와 `drop policy if exists`를 더했다(위 "재적용 가능성").

## 미완료 / 후속

- 공유 DB 적용은 병합 후 별도 승인 대상이다. 공유 DB의 함수 정의가 마이그레이션 최종 정의와 같다는 전제에서 plpgsql 가드 주입이 같은 결과를 낸다. 다르면 DO 블록이 실패해 적용이 막힌다.
- 0039 이후 새 SECURITY DEFINER RPC를 authenticated/anon에 열면 read-boundary 카탈로그 테스트가 실패한다. 그때 이 표에 판정을 추가하고 필요하면 가드를 넣는다.
- 커밋하지 않음(지시대로). ROADMAP·STATE·REQUIREMENTS·SSOT·graphify 미수정.

## Known Stubs

없음.

## Self-Check: PASSED

- 파일 존재: 0039 마이그레이션(수정), read-boundary 테스트(수정), 이 SUMMARY.
- 일회용 DB 카탈로그: 노출 SECURITY DEFINER 37개가 테스트 기대 목록과 일치, 가드 주입 23개 + SQL 재정의 6개 확인(테스트 통과).
- 커밋: 지시상 없음. 임시 조회 스크립트(`scripts/_tmp_*.mjs`)는 실행 직후 삭제했다.

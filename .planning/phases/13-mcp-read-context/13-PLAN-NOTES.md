# Phase 13 계획 전 확인 기록

기준: 이 워크트리의 `supabase/migrations/0001`~`0038`와 `.planning/config.json` (2026-11-02). 실제 DB 카탈로그와는 다를 수 있으므로 13-01 실행 시 **일회용 DB에서만** 대조한다. 공유 프로젝트 `ymudwg…`에는 어떤 명령도 실행하지 않는다.

## 1. public 테이블 수와 0038 적용 범위 — 맞음

`supabase/migrations/*.sql`의 `CREATE TABLE` 42건 중 `0012`와 `0023`의 `CREATE TEMPORARY TABLE ... ON COMMIT DROP` 2건을 제외하면 영구 테이블 **40개**다. 중복 정의 없이 40개 모두 `public` 기본 스키마 또는 `public.` 명시다. `0038_oauth_sensitive_rls.sql` 배열은 **10개**이고 미적용은 **30개**다. 아래 목록은 마이그레이션 기반이며 실제 DB 카탈로그 검증은 13-01의 게이트다.

| 구분 | 개수 | 테이블 | 근거 |
|---|---:|---|---|
| 0038 적용 | 10 | `wallets`, `ledger_entries`, `byok_keys`, `byok_validation_log`, `orders`, `order_items`, `entitlements`, `payment_orders`, `mcp_connections`, `ai_usage` | `0038_oauth_sensitive_rls.sql` |
| 미적용: MCP 조건부 SELECT | 4 | `works`, `chapters`, `kb_nodes`, `work_ai_instructions` | `0002_studio.sql`, `0026_work_ai_instructions.sql` |
| 미적용: 사용자/독자 | 7 | `profiles`, `work_likes`, `reading_progress`, `work_subscriptions`, `work_bookmarks`, `chapter_reading_state`, `reports` | `0001_init.sql`, `0003_reader.sql`, `0024_chapter_reading_state.sql` |
| 미적용: 관리자 | 5 | `admin_users`, `admin_actions`, `user_sanctions`, `warning_acknowledgements`, `moderation_review_requests` | `0006_admin_foundation.sql` |
| 미적용: AI 문서 계획 | 4 | `ai_doc_activation_approvals`, `ai_doc_activation_evidence`, `ai_doc_plan_shadow_log`, `ai_doc_plan_decision_log` | `0011_ai_doc_planning.sql` |
| 미적용: 기타 | 5 | `ai_generation_locks`, `kb_template_seed_catalog`, `kb_template_backfill_copies`, `payment_topup_tiers`, `publication_notifications` | `0021`, `0022`, `0027`, `0029` migrations |
| 미적용: 세계수 | 5 | `world_branches`, `world_branch_docs`, `world_eras`, `world_era_placements`, `world_branch_notices` | `0032_world_tree_schema.sql` |

따라서 미적용 30개 = 조건부 읽기 4개 + 일괄 차단 26개. 실행 시에는 `pg_class`/`pg_namespace`/`pg_policies`로 실제 `public` 영구 테이블을 재계수하고, 새 테이블이 있으면 기본 차단에 포함한다. 새 마이그레이션 번호도 병합 직전에 확인한다.

## 2. 회차 본문 경로 — 맞음 (마이그레이션 번호 정정)

`0005_commerce.sql:89-92`가 `chapters` 전체 SELECT와 `content` 컬럼 SELECT를 anon/authenticated에서 회수하고 메타데이터 컬럼만 재부여한다. `0009_blind_access.sql:57-68`의 최종 `read_chapter_content(uuid)` 정의는 `SECURITY DEFINER`이며 `can_view(...) OR owner`다. 같은 파일 `:104-107`에서 `anon, authenticated, service_role`에 EXECUTE를 부여한다. `can_view`는 공개 무료/구매 가능 회차를 통과시키므로 이 RPC는 소유자 전용이 아니다. Phase 13 도구에서는 사용하지 않고, 라이브 grant + 작품 소유권 + 회차 소속을 함수 내부에서 다시 확인하는 **MCP 전용 본문 RPC**를 설계한다. 기존 RPC의 OAuth 직접 호출도 차단해 우회 경로를 닫는다. 작가 본인 초안·비공개·유료·블라인드 회차는 소유권으로 읽는다. 삭제된 회차/작품은 제외한다.

## 3. Nyquist 설정 — 맞음

`.planning/config.json`의 `workflow.nyquist_validation`은 **true**다. `13-VALIDATION.md` 초안을 plan 시점에 작성하고 13-05에서 실제 검증 결과를 갱신한다.

## 정정·실행 제약

- `13-RESEARCH.md`의 프리셋/문체 “DB 저장값” 주장은 틀림. `13-CONTEXT.md` D-P13-04 정정대로 호출 인자와 앱 기본값(`intermediate`, `DEFAULT_STYLE_PRESET`)을 쓴다. `work_ai_instructions`만 DB에서 읽는다.
- `13-RESEARCH.md`의 D-17 승인 요청은 이미 `13-CONTEXT.md`에서 정정 승인됐다. 계획은 승인된 네 테이블의 라이브 grant 조건부 SELECT를 구현한다.
- 테이블 RLS는 `SECURITY DEFINER` RPC를 막지 못한다. 13-01b에서 OAuth에 열린 RPC를 목록화하고 읽기/쓰기/결제 우회 경로를 차단한 뒤 도구를 등록한다.
- 응답 프로토콜 기본 제외는 사용자 확인 기록 없음, 기본 제외로 계획.
- 이 워크트리에는 `node_modules/next/dist/docs/`가 없어 Next.js 가이드를 열람할 수 없었다. 실행자는 의존성 설치 후 해당 버전의 Route Handler 가이드를 먼저 읽고 라우트 코드를 변경한다.
- Phase 12 `12-06-SUMMARY.md`의 실제 Claude 커넥터 수동 인수(Task 2)는 pending이다. 13-05의 실제 무확인 호출 인수는 선행 연결이 성공해야 시행한다.

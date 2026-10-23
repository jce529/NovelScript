# 17-05 조사: 0022 번호 중복 · 정리 스크립트 vs 0023 잠금 트리거

조사만 수행했다. DB 접속, env 파일 열람, 코드/마이그레이션 변경 없음. (2026-10-23)

## 1. 확인된 사실

- `supabase/migrations/`에 `0022_account_deletion_purge.sql`(Phase 1 BUG-01, `purge_account_data` 함수 하나, 다른 객체 의존 없음)과 `0022_template_readonly_backfill.sql`(Phase 2 02-07, `kb_template_seed_catalog`/`kb_template_backfill_copies` 생성 + 백필)이 공존한다. 현재 번호는 0001~0027, 0029, 0030, 0032~0036 (결번 0028, 0031).
- `scripts/apply-migration.mjs`는 **적용 이력 테이블이 없다.** 인자로 받은 파일명 하나를 그냥 실행한다(`readFileSync(supabase/migrations/${file})`). 따라서 "적용 이력"은 파일명이 아니라 일회용 DB의 실제 스키마 상태이며, 개명은 DB에 영향이 없다. 단 SQL이 재실행 안전해야 다시 적용할 수 있다(0022 backfill/0023은 재실행 안전을 명시, purge는 `create or replace`라 안전).
- 의존성: 두 0022 사이에는 서로 의존이 없다. purge는 `byok_keys`/`profiles`/`vault`만 쓰고, backfill은 `kb_nodes`만 쓴다. 진짜 의존은 `0023_template_policy_guards`가 `0022_template_readonly_backfill` 이후여야 하고(`kb_template_seed_catalog` 필요, 0023 헤더 2행), 0023 trigger 본문이 "trusted migration(이 파일·0022)"을 언급한다는 점이다. 파일명 문자열을 SQL이 참조하지는 않는다.
- 파일명을 하드코딩한 코드: `0022_template_readonly_backfill.sql`을 15개 파일이 참조한다(대표: `tests/kb/template-migration-source.test.ts:14,157`, `tests/kb/template-policy-migration.test.ts:140`, `tests/world-tree/{branching,eligibility,timeline,view-count,visibility}.database.test.ts`의 적용 순서 배열, 여러 PLAN/SUMMARY). `0022_account_deletion_purge.sql`은 코드에서 참조 0건, 문서(`fixed/01-01`, STATE, 17-*)만 언급한다.
- 브랜치/워크트리 점검: `master`, `claude/vigilant-payne-c0e34c`는 이 브랜치와 동일한 마이그레이션 목록(0036까지, 0022 중복 포함). `check-stalled-plan-phases`, `origin/codex/multi-provider-byok`, `origin/business`, `origin/Phase-6-*`, `origin/bug-execute-fix-docs`에는 `supabase/migrations`가 없거나 비어 있고, `origin/ccr-2cc0f502-gsc06x`는 0021까지다. **0037 이상 또는 0028/0031을 쓰는 브랜치는 없다.** 번호 충돌 위험은 현재 없다.
- Phase 12 번호 예약: ROADMAP/STATE에 Phase 12 마이그레이션 번호를 예약한 기록이 없다. Phase 12 디렉터리도 없고 Plans는 TBD, 새 MCP 토큰/클라이언트 테이블이 들어갈 예정이다(RESEARCH 440행은 "plan 작성 전에 번호 예약/정리 완료 필요"). 즉 Phase 12 번호는 이 결정 후에 0037부터 잡으면 된다.
- 0023 정책 가드: `guard_locked_kb_node`(UPDATE 시 name 변경/soft delete/잠금 해제 거부)와 `guard_kb_template_policy`(잠긴 노드 직접 DELETE 거부)가 `locked_node_immutable`을 발생시킨다. 0034는 `world_branch_confirmed_immutable`을 별도로 발생시킨다.

## 2. 결정 표: 0022 중복 해소

| 안 | 내용 | 적용 이력·DB 영향 | 코드/문서 영향 | 이후 번호 영향 | 위험 |
|---|---|---|---|---|---|
| (a) 개명 | 늦게 생긴 `0022_template_readonly_backfill`을 빈 번호 0028로 개명(또는 purge를 0028로). 06-01 선례와 같은 형 | 이력 테이블이 없어 DB 영향 없음. 단 적용 순서가 0027 뒤·0029 앞이 되어 0023(backfill 선행 필요)보다 **뒤**로 밀리므로 backfill 쪽을 옮기면 순서가 깨진다(0023이 0028을 필요로 함). **purge(`account_deletion_purge`)를 0028로 옮기는 편이 안전**: 의존이 없고 참조 코드 0건 | purge 개명 시 문서 몇 곳만 수정. backfill 개명 시 15개 파일 수정 필요 | 0028 소진. 0037부터는 영향 없음 | 낮음(purge 개명 시). 새 환경에서 순서 적용 시 purge가 0027 뒤에 오지만 의존이 없어 무해 |
| (b) 문서화된 예외 | 파일 유지, `numbering.test.ts`에 `{'0022': [두 파일]}` 허용 목록과 사유 주석 추가 | 변경 없음 | 테스트 1개 수정. 15개 참조 유지 | 변경 없음 | 번호 가드의 의미가 약해지고 향후 같은 사고를 막지 못함. 정렬 순서는 사전순(`account_deletion` < `template`)이라 결정적이긴 함 |
| (c) 0037 이후로 이동 | 한쪽을 0037 이상 새 번호로 | purge를 0037로 옮기면 무해하나 순서가 Phase 18 마이그레이션 뒤로 밀림. backfill 이동은 0023 선행 조건 위반 | (a)와 같음 | 0037을 소진하여 **Phase 12 시작 번호가 0038로 밀림** | (a)보다 이점 없음, Phase 12 예약만 소모 |

## 3. 권고

**(a) 변형: `0022_account_deletion_purge.sql`을 `0028_account_deletion_purge.sql`로 개명한다.** 이유는 다음과 같다.

1. 이력 테이블이 없으므로 DB 상태는 변하지 않는다. 일회용 DB에는 이미 함수가 존재하고, 필요하면 `create or replace`로 재적용해도 안전하다.
2. purge는 의존이 없고 코드 참조가 0건이라 파일 1개 이름과 문서 몇 줄(`fixed/01-01`, STATE, 17-BASELINE/RESEARCH)만 고치면 된다. backfill을 옮기면 0023 선행 조건 위반과 15개 파일 수정이 생긴다.
3. 빈 번호 0028을 채우며, 0037 이후는 건드리지 않아 Phase 12 번호 예약(0037~)과 충돌하지 않는다.
4. 번호 가드의 엄격함을 유지한다((b)와 달리).

주의: 공유 프로젝트에는 purge가 이미 `0022` 이름으로 기록/적용됐을 수 있으나 이력 테이블이 없으므로 파일명만 바뀐다. 공유 DB 적용 여부는 사용자가 확인해야 한다(조사 범위 밖). 결정은 사용자 몫이며, STATE/ROADMAP/SSOT/graphify 갱신은 별도로 진행한다.

## 4. 정리 스크립트 vs 0023 `locked_node_immutable` 7건: 필요한 변경(적용하지 않음)

원인: `scripts/lib/report-fixture-cleanup.mjs`의 `deleteFixtures`가 `delete from kb_nodes where work_id = any(...)`로 잠긴 템플릿/구조 노드를 직접 DELETE하여 0023 `guard_kb_template_policy`가 거부한다. 같은 작품에 0034의 확정 가지(`world_branch_confirmed_immutable`)가 있는 fixture도 같은 방식으로 막힌다. 영향 테스트: `tests/reader/reports-cleanup.database.test.ts`와 이를 쓰는 DB 테스트들(`tests/uat/cleanup-uat-accounts.database.test.ts`, `tests/admin/sanctions.database.test.ts` 등 `deleteFixtures`/`kb_nodes` 사용 테스트).

원칙: 0023 트리거와 0034 불변식은 약화하지 않는다(우회 GUC/RPC/trigger disable 금지, 보안 경계).

필요한 변경안:

1. **정리 스크립트 순서 변경**: `scripts/lib/report-fixture-cleanup.mjs`의 `deleteFixtures`에서 `kb_nodes`를 직접 지우지 않고, `works` 삭제의 ON DELETE CASCADE가 있다면 그것에 맡긴다. 잠금 트리거가 cascade에서도 발동하면 이 안은 불가하다. 그 경우 아래 2번.
2. **트리거를 우회하지 않는 정당한 경로**: 삭제 직전 단계에서 기능 경로(소유자 컨텍스트)로 작품을 지우는 제품 코드/RPC가 있는지 확인하고 재사용한다. 없으면 fixture 단계에서 잠금 노드를 만들지 않는 변경(테스트가 `is_locked` 노드를 생성하지 않도록 최소 fixture를 쓰고, `createWork`가 만드는 구조 폴더 대신 직접 insert한 비잠금 노드로 구성)이 가장 안전하다.
3. **확정 가지가 있는 fixture**: `works` 삭제 전에 가지 상태를 정리하는 정당한 경로(가지 폐기/취소)를 먼저 호출하거나, 확정 가지를 만들지 않는 fixture로 바꾼다.
4. `planCleanup`/`deletionBlockers`에 잠금 노드 수를 보고(`locked_nodes`)하고, 테스트 계정 접미사 가드는 그대로 유지한다. dry-run 출력에 어떤 노드가 잠겨 있어 삭제가 거부되는지 표시한다.
5. 테스트(`reports-cleanup.database.test.ts`)에 "잠금 노드가 있는 작품 정리 성공" 및 "트리거는 여전히 일반 경로의 DELETE를 거부" 회귀 케이스를 추가한다.
6. 이전 실패가 일회용 DB에 남긴 `테스트 작품`/`cleanup fixture` 신고 행(STATE 38행)은 별도 일회용 DB 정리가 필요하다(이번 조사 범위 밖, DB 접속 필요).

미확인(DB 필요): ① `works` → `kb_nodes` FK가 cascade인지와 cascade 시 `guard_kb_template_policy`가 발동하는지, ② 7건이 각각 어느 트리거(0023/0034)에 걸리는지의 개별 분류. 이 두 가지는 일회용 DB에서 확인한 뒤 1~3번 중 하나를 확정한다.

# Phase 14 인수 문서 — MCP 쓰기 도구 + 스튜디오 리뷰 큐

작성: 2026-11-06 · 브랜치 `claude/great-hamilton-1954a6` · 새 환경의 Claude 세션이 이 대화 없이 이어가기 위한 문서다. 비밀·키 값은 이 문서에 없다.

## 0. 2026-11-10 갱신 — 데스크탑 병행 Phase 14와 병합 (이 절이 아래 §1~§14와 다르면 이 절이 맞다)

브랜치 `claude/phase14-merge`(기반 `55afcc2`). 푸시·master 병합은 아직 하지 않았다. 아래 §1~§14는 병합 전에 쓴 글이라 **작가당 대기 50건**, **새 초안이 이전 초안을 대체**, **마이그레이션은 0041·0042뿐**이라고 적힌 곳이 있다. 지금은 모두 바뀌었다.

**무슨 일이 있었나.** 데스크탑 환경이 같은 Phase 14를 `.planning/phases/14-mcp/`(12 plan, 마이그레이션 `0051_mcp_review_queue.sql`, 테이블 `mcp_drafts`·`mcp_kb_proposals`)로 새로 시작해 `origin/master`에 14-01·14-03까지 올려 두었다. 사용자가 두 구현을 절충하기로 했고, 로컬 구현(이 디렉터리, `mcp_proposals` 1개 테이블, 0041·0042)을 뼈대로 삼았다.

| 구분 | 내용 |
|---|---|
| 병합 | `origin/master`(Phase 19·홍보 문서·0040·0050 포함)를 이 브랜치에 병합. 코드 충돌은 `tests/mcp/read-boundary.database.test.ts` 한 곳(우리 `mcp_proposals` 카탈로그로 해결). 병합 커밋 `ae962ed` |
| 채택(데스크탑) | 한 회차에 대기 초안 여러 개(D-P14-02), 작품당 대기 30건(D-P14-13)에 작가당 100건 보조 상한, 제어 문자·BOM·양방향 제어 문자 제거, 전역 인박스·헤더 `AI 검토 대기`·회차 트리 배지(UI-SPEC A·B), `scripts/assert-vitest-json.mjs`, `scripts/check-disposable-migrations.mjs` |
| 채택하지 않음 | `0051_mcp_review_queue.sql`(테이블 2개 설계), `tests/mcp/propose-write.database.test.ts`, 데스크탑 plan 12개. 설계 문서(CONTEXT·RESEARCH·UI-SPEC·목업·plan)는 `_superseded/desktop-14-mcp/`에 참고용으로 보관 |
| 일부만 채택 | 정규화의 4줄 이상 빈 줄 접기·끝 공백 제거는 **넣지 않음**(원본과의 문단 diff에 가짜 끝 변경을 만든다). C(설정집 트리 배지)·문서 화면 안내줄·모바일 3탭 셸 배치도 이번 범위 아님 |
| 유지(우리 방식) | 수락·되돌리기를 브라우저 전용 SECURITY DEFINER 트랜잭션으로 서버가 확정. AI가 호출하는 RPC는 pending 행 INSERT만 한다 |

**새 plan.** 14-10(다중 초안·상한·정규화, `0043_mcp_proposal_multi_draft.sql`), 14-11(전역 인박스·진입점), 14-12(통합 검증·문서). 14-09 수동 인수는 이 셋 뒤의 마지막 단계다(런북 §4.4, §5.15~5.18 갱신).

**마이그레이션 상태.** 0043은 일회용 DB(`anzafn…`)에만 적용했다. 공유 DB(`ymudwg…`)에는 0037~0040까지만 적용돼 있고(2026-11-05) 0041·0042·0043·0050은 아직이다. 일회용 DB에는 0050도 이미 적용돼 있어, 병합으로 들어온 `world_work_base_visible(uuid)`를 read-boundary 분류표에 올렸다. `mcp_proposal_check_cap`은 `(uuid)`에서 `(uuid, uuid)`로 바뀌었다(옛 시그니처는 0043이 지운다).

**직접 재실행한 값(일회용 DB, 한 번에 한 스위트).** 전체 단위 203개 파일 3258/3258, `npx eslint .` 0, `npx tsc --noEmit`은 기존 `LayoutProps` 1건뿐. DB `tests/mcp tests/proposals --project db` 11개 파일: 1회차 112/112 통과·건너뜀 0. 이어 곧바로 돌린 2회차는 `DCR failed with HTTP 429`(일회용 프로젝트 OAuth 클라이언트 등록 한도)로 3건 실패, 12분 대기 뒤 3회차는 112/112(건너뜀 0)였다. 이후 `accept-revert`에 다중 초안 케이스를 더해 그 스위트는 27/27이다(자세한 한계는 14-12-SUMMARY).

**아직 안 한 것.**
- 외부 AI 교차 검증: Codex `gpt-6-sol`(추론 high, 읽기 전용)로 병합 이후 변경(0043·14-11·충돌 해결)을 교차 검토했다: **블로커 0 / 경고 5**. 고친 것 3건 — 헤더 전체 건수가 삭제된 작품의 대기 제안을 세던 문제, 작품·제안을 200건으로 자른 뒤 삭제 작품을 거르던 문제(201번째 작품·오래된 이력 누락), 트리 배지의 작은 클릭 영역. 고치지 않은 것 2건 — (1) master의 `0050` `world_work_base_visible(uuid)`가 anon에게 열린 SECURITY DEFINER라 작품 UUID를 아는 사람이 비공개 작품의 존재 여부를 참/거짓으로 알 수 있다(0050은 BUG-02 소관이라 BUG-02 쪽에서 판단, 우리는 read-boundary 분류만 `keep`으로 올림), (2) 0042 `mcp_proposal_caller`/0043의 만료 판정이 트랜잭션 시작 시각 `now()`라 작가별 잠금을 기다리는 사이 만료된 제안이 있으면 만료 ID를 돌려줄 수 있는 아주 좁은 경합(후속 후보).
- 로그인한 화면 확인(인박스·헤더 링크·트리 배지)은 14-09 수동 인수로 넘겼다. 개발 서버 컴파일과 비로그인 307만 확인했다.
- 설정집·회차 초안 패치 형식(`edits[]`: `replace` / `replace_range` / `replaceAll`)은 **plan 14-13**(사용자 호칭 14-10)로 CONTEXT·RESEARCH·PLAN까지 만들었고 checker(`sonnet`) 통과. **구현은 plan 승인 전이라 시작하지 않았다.** 마이그레이션 번호는 0044.
- kb_edit·kb_create의 동일 제안 중복 제거는 여전히 연결별이다(초안만 연결 무관). 통일할지는 결정 사항.
- 푸시, master 병합, 공유 DB 적용(0041→0042→0043, 별도로 0050)은 각각 사용자 승인 후.

## 1. 한눈에

| 항목 | 상태 |
|---|---|
| discuss / UI-SPEC / 목업 / research / plan | 완료 (14-CONTEXT, 14-UI-SPEC(승인), 14-RESEARCH, 14-VALIDATION, PLAN 9개) |
| 구현 plan | **14-01 ~ 14-08 완료**(코드), **14-09 수동 인수만 남음** (§14 참고) |
| 요구사항 | MCP-05·06·07 아직 미충족(서버 경계·도구·결정 RPC까지 끝, 서버 액션·UI·수동 인수 남음) |
| 일회용 DB(`anzafn…`) | 0041·0042 적용됨. 직접 재실행 DB 스위트 110/110 통과 |
| 공유 DB(`ymudwg…`) | **미적용·미접촉**. 0022~0039도 미적용 상태(백업 없음, STATE Blockers 참조) |
| 총괄이 하지 않은 것 | STATE / ROADMAP / REQUIREMENTS / SSOT / graphify 갱신은 총괄 세션 소관 — 이 phase 세션은 수정하지 않았다 |

## 2. 끝난 plan과 커밋

| plan | 내용 | 커밋 |
|---|---|---|
| 14-01 | 0041 `mcp_proposals` 표, bearer 전용 제안 RPC 3개, 카탈로그 갱신, `diff@9.0.0` | 0f8630f(RED) 2016da8 15f6d86 f95224d(SUMMARY) |
| 14-02 | `withMcpWriteTool`, `save_draft` / `propose_kb_document`(총 도구 9개), 교차 사용자 주입 DB 테스트 | fb183d4 fff8861 8b22808 |
| 14-03 | 순수 모듈: 문단 3-way 병합(`lib/proposals/paragraph-merge.ts`), 해시(`lib/proposals/hash.ts`) | c06db15 4162585 7d40c5e |
| 14-04 | 0042 결정 RPC: 수락 3종 / 거절 / 되돌리기, 작가 역할 재확인, 되돌리기 안전장치 | 763b61a 5acfd1e 3afa2fa 6468f50 ca77819 cc8f27c 603c8af 3b56e4c 8716b4a |
| 문서 | 모델 배정 기록 `14-ROUTING.md`, 이 문서 | (이 커밋) |

각 plan의 SUMMARY는 `.planning/phases/14-mcp-write-review/14-0N-SUMMARY.md`.

## 3. 검증 결과 (세션이 직접 재실행한 값)

- 환경: 일회용 DB `anzafn…`만. 실행 래퍼로 `MCP_DISPOSABLE_PROJECT_REF`를 `.env.disposable`의 `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF` 값으로 채운다(그 키가 `.env.disposable`에 없어서). 아래 §6 참고.
- **14-04 수정 후 전체 DB 스위트**: `tests/mcp tests/proposals --project db` 11개 파일 **110/110 통과, 실패 0, 건너뜀 0**(단일 실행). 파일별: cross-user 9, grants 6, read-boundary 20, revoke-blocks 4, sensitive-rls 3, tools.cross-user 12, tools.proposals.cross-user 4, accept-revert 26, draft-tools 12, kb-tools 10, source-snapshot 4.
- 14-03 단위: `paragraph-merge` + `hash` 22/22 직접 재실행. executor 보고: `tests/mcp` 단위 382+, `tests/proposals` 포함 404 통과(이 수치는 직접 재실행하지 않음).
- 중간 실행에서 `DCR failed with HTTP 429`로 파일 단위 실패가 여러 번 있었으나 모두 일회용 프로젝트의 OAuth 클라이언트 등록 한도(환경 요인)였고, 대기 후 같은 코드가 통과했다.
- 완료 기준(phase gate): 같은 날 **전체 DB 스위트 2회 연속 green**(skipped 0). 아직 1회 분량만 있다 — phase 끝에서 다시 2회 확인할 것.
- `tsc --noEmit`: `app/layout.tsx`의 `LayoutProps` 오류 1건은 Next 생성 타입(`.next/types`)이 없을 때 나오는 기존 환경 문제(Phase 13에서도 동일). 이 phase 변경 파일의 새 오류는 없음.

## 4. Codex 교차 검증 처리 현황 (`gpt-6-sol`, 읽기 전용)

| 대상 | 지적 | 처리 |
|---|---|---|
| 14-01 (0041) | WARNING: 제안 RPC가 호출자의 `profiles.role='writer'`를 재확인하지 않음 | **수정** — 0042에서 `mcp_proposal_caller()`를 `create or replace`해 `42501 active writer required` 추가, 테스트(강등 계정 제안 거부, 수락·되돌리기 거부, 거절 허용, 복구 후 재제안) 포함 |
| 14-04 1차 | BLOCKER: 되돌리기 확정(`p_confirm=true`)이 경고와 확정 사이의 재편집을 덮어씀 | **수정** — `p_seen_hash` 필수, 대상 행 FOR UPDATE 후 해시 대조, 불일치 시 새 `confirm_required` |
| 14-04 1차 | WARNING: 신규 문서 되돌리기가 이름·폴더 변경을 감지 못함 | **수정** — 이름·부모·카테고리·내용을 상태 해시에 포함 |
| 14-04 2차 | BLOCKER: undo 기한을 행 잠금 전에 검사 | **수정** — 잠금 뒤 `clock_timestamp()` 재검사 |
| 14-04 2차 | WARNING: 카테고리만 바뀐 경우, 잠긴 신규 문서가 불가능한 확인 흐름으로 감 | **수정** — 해시에 카테고리 포함, 잠긴 문서는 첫 호출에서 `mcp_not_revertible` |
| 14-04 3차(최종) | BLOCKER(문구상): 기한 재검사 후 UPDATE 사이의 밀리초 구간 | **수용(잔여 위험)** — 행 잠금을 쥔 단일 함수 안에서의 검사-쓰기 간극이라 구조상 제거 불가. 실질 영향은 기한 경계의 수 ms. WARNING: 잠금 대기 중 만료를 실제로 재현하는 테스트 없음 → 함수 본문 정규식 검사로 갈음 |
| 14-02, 14-03 | Codex 교차 검증 미실시 | 14-03은 순수 함수(위험 low), 14-02는 단위·실DB 교차 사용자 테스트로 갈음. **원하면 14-02에 Codex 읽기 전용 검토를 추가** |

## 5. 남은 plan과 다음 시작점

다음 시작점: **14-09** (`.planning/phases/14-mcp-write-review/14-09-PLAN.md`, Wave 8, 수동 인수). 14-05~14-08은 끝남(§13, §14 참고).

| plan | wave | 내용 | 배정(14-ROUTING.md) |
|---|---|---|---|
| 14-05 | 4 | **완료** — 큐·배지 조회, 결정 로직(`lib/proposals/queries.ts`, `actions.ts`), 커밋 0efb82a 92fe47b ca6e1f5 7813902 a45474d | opus |
| 14-06 | 5 | 리뷰 큐·상세 UI (목업 보드 기준), UI-SPEC에 이름 충돌 카피 1줄 추가 | opus |
| 14-07 | 6 | 홈·사이드바·회차·문서 대기 배지 | sonnet |
| 14-08 | 7 | 덩어리별 `AI와 다듬기` (`refineChunkAction`) | opus |
| 14-09 | 8 | 수동 인수 (일회용 DB + 터널 + 실제 Claude, 12-06 #7~#9 포함, 사람 판정) | 사람 |

실행은 `/gsd:execute-phase 14` (완료 plan은 SUMMARY가 있어 건너뛴다) 또는 plan 단위로 gsd-executor를 호출한다. 위험도 high plan(14-05, 14-06 일부, 14-08)은 끝난 뒤 Codex 읽기 전용 교차 검토를 권한다.

### plan 사이 결정 (PLAN에 없던 executor 결정 — 다음 plan이 따라야 함)

**14-05 서버 액션이 반드시 반영할 것**
- `applySelectedHunks(current, hunks, selections)`는 **알 수 없거나 중복된 index, 적용 불가 덩어리, `삭제` 덩어리의 `editedText`에서 예외를 던진다.** 서버 액션은 catch해서 정해진 오류로 바꿔야 한다. 빈 선택은 현재 본문을 바이트 그대로 반환.
- 병합 모듈 시그니처: `computeHunks(base, draft, current)`, `applySelectedHunks(current, hunks, [{index, editedText?}])`, `tokenize`; `hashContent`는 `lib/proposals/hash.ts`. SQL 해시와 일치(한글·이모지·CRLF·조합형 문자까지 검증됨).
- **되돌리기 RPC**: `revert_mcp_proposal(p_proposal_id uuid, p_confirm boolean default false, p_seen_hash text default null) returns jsonb`.
  - 확인 필요 시: `{id, status:'accepted', confirm_required:true, changed_since_accept:true, current_hash}`; 복원 시: `{id, status:'reverted', confirm_required:false, changed_since_accept, current_hash:null}`.
  - 흐름: `revert(id)` → confirm_required면 경고 표시 → `revert(id, true, current_hash)`를 **받은 값 그대로** 보냄 → 또 confirm_required면 새 hash로 경고 재표시. 해시는 서버 액션이 계산하지 않는다.
  - 오류 코드: 42501 `browser session required` / `active writer required` / `mcp_suspended`; P0001 `mcp_not_found` / `mcp_not_revertible`(잠긴 신규 문서 포함) / `mcp_undo_expired`; 22023 `mcp_invalid_decision`.
- **수락 RPC 오류 코드**: `mcp_stale`, `mcp_not_pending`, `mcp_expired`, `mcp_folder_invalid`, `mcp_folder_changed`(version 불일치), `mcp_name_collision`, `mcp_invalid_content`, `mcp_not_found`, `mcp_suspended`. 14-05가 한국어 문구로 매핑한다(고정 문구만, SQL 원문 노출 금지).
- 수락 본문은 **받은 그대로 저장**(CRLF 정규화 없음) → 선택하지 않은 문단 바이트 유지. 빈 결과 허용. 길이 상한: 회차 100,000자, 문서 50,000자.
- 거절은 살아 있는 프로필이면 허용(정지 계정도 거절 가능), 수락·되돌리기는 작가 역할 + 비정지 필요.
- 설정집 문서를 쓰는 RPC 3개(`accept_mcp_kb_edit`, `accept_mcp_kb_create`, `revert_mcp_proposal`)는 `search_path = public, pg_temp`(기존 kb_nodes 가드 트리거가 스키마 없는 참조를 쓰기 때문). 나머지는 `''`.
- 결정 RPC도 작가별 advisory lock `mcp_propose:<uid>`를 쓰며, 이때 만료된 대기 제안과 7일 지난 undo 스냅샷을 정리한다.

**0041 계약 (14-02·14-05 공통)**
- 제안 RPC 반환 `{id, status, expires_at, superseded_id}`. 오류: `42501 live MCP grant required` / `mcp_scope_denied` / `mcp_suspended` / `active writer required`; `P0001 mcp_not_found` / `mcp_no_change` / `mcp_cap_reached`; `22023 mcp_invalid_content|name|category`.
- 같은 연결이 같은 정규화 내용을 다시 보내면 같은 id를 반환(dedupe, `content_hash`). **(0043 이후)** 같은 회차에 다른 내용의 초안은 모두 pending으로 공존하고(supersede 없음), 같은 정규화 내용은 연결과 무관하게 같은 id를 돌려준다. 만료된 pending은 제안 RPC 호출 때마다 `expired`로 정리(행은 삭제하지 않음).
- `kb_edit` 허용 대상: `scope='work'`, 미삭제·미잠금 파일, category ∈ 인물/장소/사건/세력/아이템/custom(하위 폴더 파일은 부모 category 상속). template·회차·account_template·폴더는 거부. `kb_create`: 인물~아이템 카테고리만, 이름 trim 후 1..100자, 제어문자 금지.
- 되돌리기 가능 기간 **7일**, 대기 제안 만료 30일, 대기 상한 **작품당 30건·작가당 100건**(0043, `mcp_proposal_pending_cap_per_work/_per_writer`; 처음에는 작가당 50건이었다).

**기타**
- `propose_kb_document` 입력 스키마가 루트 `oneOf`(create/edit)다. 실제 claude.ai 커넥터가 이 스키마를 처리하는지는 미확인 — 14-09 수동 인수에서 확인하고, 안 되면 `mode` 하나에 선택 필드를 두는 평면 스키마로 바꾼다(CONTEXT 결정은 불변).
- 응답에 `reviewUrl`(`MCP_PUBLIC_ORIGIN` 기반 `/studio/{workId}/review/{proposalId}`)이 들어가며, origin이 유효하지 않으면 RPC를 호출하지 않는다.
- 스튜디오 쪽 세션 코드는 `lib/proposals/**`에 둔다(`lib/mcp/**`는 `no-admin-client` 테스트가 admin client·쿠키 기반 클라이언트를 금지).
- 알려진 한계(RESEARCH): 다른 탭의 에디터가 열려 있으면 이후 "회차 저장"이 수락한 내용을 덮어쓸 수 있다(에디터에 버전 검사 없음). 이 phase에서 고치지 않고 인수 체크리스트와 후속 과제로 둔다.
- 사이드 채팅(14-08)은 MCP-05~07 밖의 추가 범위(D-P14-11) — 핵심 경로와 분리돼 있다.

## 6. 마이그레이션 번호와 적용 상태

| 번호 | 내용 | 일회용 DB | 공유 DB |
|---|---|---|---|
| 0037 / 0038 / 0039 | Phase 12·13 (OAuth grant, 민감 RLS, 읽기 경계) | 적용됨 | 적용됨(2026-11-05) |
| 0040 | (master) `soft_delete_kb_node` 보호 복구 — 이 phase는 쓰지 않음 | — | 적용됨(2026-11-05) |
| **0041** | `mcp_proposals`, 제안 RPC | 적용됨 | **미적용** |
| **0042** | 결정 RPC, `mcp_proposal_caller` writer 검사 | 적용됨(수정 반영본) | **미적용** |
| **0043** | 다중 초안·작품/작가 상한·정규화 강화, 제안 RPC 3개 재정의 (14-10) | 적용됨 | **미적용** |
| 0050 | (master) 피드 공개 읽기 비용(BUG-02) | 적용됨 | **미적용** |

- 이 브랜치가 쓰는 번호는 0041·0042·0043이다. master의 0040·0050과 충돌 없음을 병합 직전에 `ls supabase/migrations`로 다시 확인할 것.
- 0042는 병합 전이라 같은 파일을 여러 번 고쳤다(재적용 안전: `create or replace` / `drop function if exists`). 일회용 DB에는 최종본이 적용돼 있다. 새 환경의 일회용 DB가 같은 프로젝트라면 다시 적용할 필요 없음(`revert_mcp_proposal(uuid,boolean,text)` 하나만 존재).
- 공유 DB 적용은 이 세션이 하지 않았다. 병합 뒤 별도 승인 하에 파일 단위로 적용한다(0022~0039 미적용·백업 없음 상태이므로 STATE Blockers/Concerns와 `.planning/gaps/2026-11-03-shared-db-catchup-plan.md` 순서를 따를 것 — 0041은 0039 뒤).

## 7. 새 환경 준비

1. 저장소 체크아웃 후 브랜치 `claude/great-hamilton-1954a6` (origin에 푸시됨). `npm install`(또는 `npm ci`) — `diff@9.0.0`이 `package.json`에 정확한 버전으로 고정돼 있다.
2. `.env.local`, `.env.disposable`은 **커밋되지 않는다**. 새 환경에서 직접 만든다. 키 존재 확인은 `node scripts/check-env.mjs .env.disposable`만 쓰고 값은 출력하지 않는다. `.env.disposable`에는 일회용 프로젝트(`anzafn…`)의 API URL·anon·service role·`SUPABASE_DB_URL`이 필요하고, `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF`가 같은 ref여야 한다. **API와 DB URL 둘 다 `anzafn`이고 공유 `ymudwg`가 아님을 확인한 뒤에만** 마이그레이션·DB 테스트를 돌린다. 합병 전에는 이 파일을 워크트리에서 지운다.
3. `MCP_DISPOSABLE_PROJECT_REF`가 필요하다(없으면 DB 스위트가 skipped로 빠진다). `.env.disposable`에 그 키가 없으면 실행 프로세스 환경에 일회용 ref를 넣는다:
   `process.env.MCP_DISPOSABLE_PROJECT_REF ||= process.env.TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF` 를 설정한 뒤 `node node_modules/vitest/vitest.mjs run tests/mcp tests/proposals --project db` 를 실행하는 작은 래퍼를 쓰거나, 환경 변수로 직접 지정한다. 모든 DB 명령은 **실행 수 > 0, skipped 0**이어야 한다.
4. 테스트 호출은 `npx`가 아니라 `node node_modules/vitest/vitest.mjs run <파일> --project unit|db`.
5. Next.js 16은 기존 지식과 다르다 — 서버 액션·라우트를 쓰는 plan(14-05~)은 코드 전에 `node_modules/next/dist/docs/`의 해당 가이드를 읽는다(CLAUDE.md / AGENTS.md).

## 8. DB 테스트 주의 (중요)

- 일회용 프로젝트는 OAuth 클라이언트 등록(DCR)에 한도가 있어, **다른 환경·다른 세션과 동시에 일회용 DB 테스트를 돌리면 서로 `DCR failed with HTTP 429`로 실패**한다. 한 번에 하나의 환경만 돌린다.
- 한 번의 전체 스위트(110건)가 한도의 상당 부분을 쓴다. 429가 나면 코드 결함으로 보지 말고 **5~15분 기다린 뒤 실패한 파일만 다시** 돌린다. 개발 중에는 필요한 파일만 돌리고 전체는 plan 끝에 1회.
- 건너뜀이 0이 아니면(특히 `beforeAll` 실패로 파일 전체가 skipped) 통과로 기록하지 않는다.
- 공유 프로젝트(`ymudwg…`)에는 어떤 테스트·마이그레이션도 돌리지 않는다.

## 9. 모델 배정 규칙과 Jev 호출

- 규칙 원본: `.planning/skills/jev-model-routing.md`(스킬 `/jev-model-routing`), 검증된 ID `.planning/model-routing/models.md`. `config.json`의 `model_overrides`(planner `gpt-6-sol`, checker `sonnet`)와 사용자 지정이 우선.
- 이 phase의 plan별 배정은 `14-ROUTING.md`(Jev 분류 결과 포함). 모두 Claude 채널로 나온 이유: 자족성(P1) 낮음 또는 일회용 DB·브라우저 필요(P2). executor는 Agent 도구 `model` 파라미터를 명시한다.
- Jev 호출(`jev_ask`): `questions`는 `{id: {type, instructions, criteria}}` 맵, **criteria는 `{클래스id: 설명}` 맵**(배열 아님). `noul` 타입도 criteria가 객체여야 한다 — 문자열을 넘기면 422. 예: `"criteria": {"true":"참","false":"거짓"}`.
- Codex 호출은 `-m`과 `-c model_reasoning_effort=…`를 매번 명시하고 로그 첫머리 `model:` 줄을 확인한다. 교차 검증은 `-s workspace-write`로 돌리되 프롬프트에 "읽기 전용, 수정·커밋 금지"를 명시한다.
- 위험도 high plan은 작성자(Claude)와 다른 계열(Codex)로 교차 검토하는 것이 규칙이다.

## 10. 병합 순서

1. master를 이 브랜치로 먼저 병합한다(master는 32커밋 앞서 있음 — Phase 19, 0040, 0050 초안 등). 충돌은 병합하는 세션이 해결한다.
2. 병합 직후 `supabase/migrations` 번호가 0041·0042와 겹치지 않는지 확인한다(현재 master에는 0040, 0050이 있고 0041~0049는 비어 있음).
3. 병합 뒤 일회용 DB 스위트를 다시 돌려 회귀가 없는지 확인한다(`tests/mcp tests/proposals --project db`).
4. 0041·0042를 공유 DB에 적용하는 것은 **사용자 승인 후 파일 단위**로 한다. 공유 DB는 0022~0039도 미적용이고 백업이 없다 — 따라잡기 계획과 순서를 지킨다.
5. 합병 전 워크트리의 `.env.disposable`을 삭제한다.

## 11. UI phase 상태

- UI-SPEC 승인(`14-UI-SPEC.md`, checker 6/6, 목업 승인 후 "추가 계약" 절로 직접 고치기·AI와 다듬기·A안 거절 반영)과 design 스킬 목업(Artifact `https://claude.ai/artifact/8zBNvn8jTMTP7fT6GjdkoW`, 7개 보드: 스튜디오 홈 배지, 리뷰 큐, 회차 초안 검토(인터랙티브), 375px 모바일, 설정집 수정안, 신규 생성안 폴더 선택, 확인 Dialog 3종)은 끝났다. Artifact 링크는 소유자 본인만 열 수 있다.
- **남은 것: 구현된 실제 화면 확인.** 14-06·14-07 구현 뒤 브라우저(데스크톱 + 375px)로 실제 화면을 UI-SPEC·목업과 대조해야 한다. 14-09 수동 인수가 이를 포함한다(키보드, 포커스, role status/alert, 44px 터치 타깃).

## 12. 14-09 수동 인수에 반드시 넣을 것

- Claude에서 `save_draft` / `propose_kb_document` 왕복, 쓰기 도구의 승인 흐름, 큐의 출처 표시, 본문은 수락 전까지 불변, 같은 회차에 다른 내용으로 재저장하면 두 건이 모두 대기(대체되지 않음), 같은 내용이면 같은 건.
- 덩어리 일부 수락, 직접 고치기, 원본 변경 경고·재비교·`적용할 수 없음`, 반영 되돌리기 1회, 되돌리기 확인 흐름(`confirm_required`), 설정집 수정안·신규 생성안(폴더 선택, 기본값 없음), 연결 해제 후 출처 `연결 해제됨`, 정지 계정 쓰기 거부.
- 12-06 Task 2 잔여: #7 동의 화면 상태, #8 375px·접근성, #9 연결 1시간 후 refresh token 재호출(시간이 걸리니 인수 시작 시점에 먼저 기다림을 걸어 둘 것).
- `propose_kb_document` 스키마 호환성(위 §5 기타).
- 다른 탭 에디터 덮어쓰기 한계(알려진 한계) 확인과 후속 과제 기록.
- 이 세션에서 만든 일회용 DB의 테스트 데이터(합성 작가 계정·작품·제안 행)가 남아 있다. 일부는 `locked_node_immutable` 보호로 지워지지 않는다.

## 13. 14-05 완료 메모 (2026-11-06)

- 직접 재실행: `tests/proposals tests/mcp --project unit` 17개 파일 **461/461 통과**. DB 코드·마이그레이션은 바꾸지 않아 DB 스위트는 재실행하지 않음.
- Codex 교차 검증(gpt-6-sol, 읽기 전용) **VERDICT: PASS, 블로커 0**. 경고 2건은 미수정 후속 항목: (a) '처리됨' 목록이 생성 시각 최신 200행을 먼저 자른 뒤 결정 시각으로 정렬함, (b) 병합 비교자가 끝 공백을 무시해 끝 공백만 바꾼 제안은 덩어리가 0개가 되어 수락 불가(거절만 가능). NIT: 연결 조회 실패 시 모든 출처가 '연결됨'으로 표시됨, 정지 계정 거절 테스트가 정지 상태를 모델링하지 않음.
- lib 함수 시그니처는 `(supabase, userId, ...)`이고 lib에는 'use server'가 없다. createClient·getUser·revalidatePath를 하는 얇은 서버 액션 래퍼는 **14-06이 `app/studio/[workId]/review/` 아래에 만든다.**
- 서버 액션 입력: acceptProposal은 strict(index, 선택적 editedText만), seenHash는 chapter/kb_edit에서 필수(없으면 invalid_request), kb_create는 folderId+folderVersion 둘 다 필수. 수락한 덩어리가 0개면 invalid_selection. 직접 고침 텍스트는 CRLF→LF 정규화 후 NUL·길이 재검사.
- 14-06 주의: 병합 모듈이 문서 끝 추가 덩어리를 줄바꿈 하나로만 이어붙이고, 줄바꿈으로 끝나는 직접 고침 텍스트는 원래 문단의 빈 줄 꼬리를 유지하지 않는다. 직접 고치기 입력란을 hunk.after(꼬리 포함)로 미리 채우면 문제없다. 목록은 200행 상한(페이지네이션 없음).

## 14. 14-06 ~ 14-08 완료 메모 (2026-11-06)

### 커밋과 직접 재실행 결과

| plan | 내용 | 커밋 |
|---|---|---|
| 14-06 | 리뷰 큐·상세 UI, 서버 액션 래퍼, UI-SPEC 이름 충돌 카피 1줄 | 1c6148e 27fea9e df2f2d5 1d4572d efc5740, 수정 0a1acbf 4533599 |
| 14-07 | 홈 카드·사이드바 배지, 회차·문서 `대기 제안 n건` 줄 | d90557d 35e8c90 0aeef97 |
| 14-08 | 덩어리별 `AI와 다듬기`(refineChunkAction, prompt `contextKind: 'refine'`), 패널 UI | ff96b25 ef0718b fb8046a 3c3a113 f1ea8e8, 수정 3805e9f cf527d1 |

- 세션이 직접 재실행: **전체 단위 `--project unit` 194개 파일 3204/3204 통과**, eslint(변경 영역) 경고 0, `tsc --noEmit`은 기존 `LayoutProps` 1건뿐. 14-06~14-08은 DB 코드·마이그레이션을 바꾸지 않았다. DB 스위트의 마지막 직접 재실행은 14-04 수정 후 110/110(§3)이다.
- Codex 교차 검증(gpt-6-sol, 읽기 전용): 14-06 PASS(경고 3건 수정 반영), 14-08 ISSUES(경고 2건 수정 반영, 블로커 1건은 아래 "알려진 한계"로 기록), 14-07은 위험도 low라 생략.

### 만든 라우트와 컴포넌트

- `/studio/[workId]/review` (`?status=pending|done|all`, 거절 직후 `?notice=rejected`), `/studio/[workId]/review/[proposalId]`.
- 서버 액션: `app/studio/[workId]/review/[proposalId]/actions.ts`(수락·거절·되돌리기), `refine-actions.ts`(AI와 다듬기), `app/studio/[workId]/review/target-actions.ts`(회차·문서 대기 줄).
- 순수 헬퍼: `components/proposals/review-model.ts`, `refine-model.ts`; 배지: `components/proposals/pending-badges.tsx`; 상세: `proposal-detail.tsx`. SUMMARY(14-06)의 "Browser check guide" 표에 상태별 화면을 띄우는 방법이 있다.

### 14-05~14-08 사이 결정

- 신규 생성안 폴더 선택은 UI-SPEC D의 Select 대신 승인 목업(KbNew)대로 **라디오 목록**, 기본 선택 없음.
- 하단 결정 바는 모바일에서도 `sticky`(fixed는 모바일 하단 탭 바를 가림). 도착 시각은 1시간 미만이면 `n분 전`.
- 완료 화면은 수락 시점에 화면에 있던 detail을 고정해 그린다(stale 새로고침 뒤에도 적용된 덩어리와 일치). 직접 고친 텍스트는 같은 세션에서만 보이고, 새로고침 후에는 서버가 덩어리별 텍스트를 저장하지 않으므로 안내 문구로 대신한다.
- 구현하지 않은 것: UI-SPEC B의 `변경 없는 문단 {k}개` 접힌 줄(승인 목업에도 없음), 대기 상한 안내 문구(작품당 30·작가당 100건. 도구가 AI에게 오류를 돌려주는 것이 본질), 설정 문서에 대기 제안이 여러 건일 때 해당 문서로 거른 큐 링크(큐에 대상 필터 없어 일반 대기 큐로 연결).
- 모바일 `전체 보기` 접기는 길이(240자 초과 또는 6줄 초과)만 보고 판단하며 실제 렌더 높이를 재지 않는다.
- AI와 다듬기: 입력은 ID·seenHash·메시지(≤1000자)·이력(≤6턴)·UUID 멱등성 키만(추가 필드는 거부), 덩어리는 서버가 저장된 제안과 현재 원문에서 재계산(대기·미만료·본인 소유, 바뀜/추가 덩어리, 잠기거나 삭제된 대상 제외, kb_create 제외). 덩어리당 6회 상한, 대화 비저장. 모델을 못 정하면 사이드 채팅만 숨는다. 패널에 모델 선택·서비스 키 대체 동의 흐름은 없다. 후보에서 프로토콜 태그를 모두 제거하고 비면 `empty_answer`(재시도 버튼 없음: 같은 키 재전송은 already_processed), 후보 상한은 꼬리 줄바꿈을 포함한 삽입 길이 기준.
- **`createAdminClient` 결정**: `refine-actions.ts`가 `resolveGenerationRoute`에만 `createAdminClient()`를 넘긴다(작가 본인의 BYOK 키 복호화, 기존 `chatAction`과 동일한 방식). 제안·작품 읽기는 모두 세션 클라이언트. 이 phase의 금지 범위는 bearer 토큰 경로(`lib/mcp/**`, `app/mcp/**`)이며 `no-admin-client` 테스트가 그것을 계속 지킨다. 병합 리뷰에서 이 한 곳을 확인할 것.
- `lib/ai/chat.ts`는 `contextKind` 전달을 위해 한 줄과 타입 확장, `lib/ai/prompt.ts`는 `contextKind:'refine'`과 `stripProtocolTags` 추가. 전체 단위 3204건으로 회귀 확인.

### 알려진 한계 (미수정, 후속 후보)

1. **BYOK 재시도 중복 호출(공용 게이트웨이)**: `lib/ai/paid-generation.ts`의 BYOK 분기는 Phase 11부터 멱등성 키의 완료 확인과 생성 임대를 건너뛴다. 응답이 유실된 뒤 같은 키로 재시도하면 BYOK 제공자가 두 번 호출될 수 있다(서비스 키 경로는 정상 중복 방지). 스튜디오 AI 패널·문서 재생성과 공통 동작이고 비용은 작가 본인의 키로 나간다. 이 phase에서 고치지 않았다. Codex가 14-08에서 블로커로 표시한 항목.
2. 끝 공백만 바꾼 제안은 덩어리가 0개라 수락 불가(거절만 가능).
3. '처리됨' 목록이 생성 시각 최신 200행을 자른 뒤 결정 시각으로 정렬.
4. 다른 탭의 에디터가 열려 있으면 이후 "회차 저장"이 수락한 내용을 덮어쓸 수 있음(에디터에 버전 검사 없음).
5. 프롬프트 주입 방어는 설계 판단이며 실제 모델로 시험하지 않았다. 14-09에서 실제 호출로 확인할 것.
6. 되돌리기 기한 재검사와 UPDATE 사이의 수 ms 간극(구조상 제거 불가, §4).

### 아직 브라우저로 보지 못한 것 (14-09에서 확인)

- 화면 전부: 이 세션의 executor에는 브라우저가 없었고, 일회용 DB의 로그인된 작가 세션과 시드된 제안이 있어야 볼 수 있다. 데스크톱과 375px, 44px 터치 타깃, 키보드 순서, 대화상자 초기 포커스·닫힌 뒤 포커스 복귀, role=status/alert의 포커스 이동(특히 14-06 수정의 대화상자 오류 포커스), 배지·줄 위치.
- 실제 AI 호출(사이드 채팅)의 지갑 차감 또는 BYOK 정산과 실패 문구, 프롬프트 주입 시도에 대한 실제 모델 반응.
- 실제 claude.ai 커넥터의 쓰기 도구 흐름과 `propose_kb_document`의 `oneOf` 스키마 호환(§5 기타).

### 14-09 시작 전 체크

1. 새 환경 준비(§7), 일회용 DB 스위트 2회 연속 green 확인(§3 gate, 한도 주의 §8). 코드가 바뀌었으므로 14-09 전에 `tests/mcp tests/proposals --project db`를 먼저 돌린다.
2. 14-09-PLAN.md의 Task 구성과 `autonomous: false` 체크포인트를 따른다. 사람이 판정하는 항목은 12-06 #7·#8·#9를 포함해 한 번의 일회용 환경에서 묶는다. #9(연결 1시간 후 refresh)는 시간이 걸리므로 인수 시작과 동시에 연결을 만들어 둔다.
3. 판정은 사람이 남긴다(13-05 Task 3 형식: 표 + 관찰 + 후속 조치). FAIL이나 pending을 완료로 기록하지 않는다.

## 15. 2026-11-10 14-13 패치 형식 구현 완료 (이 절이 §0의 "구현은 plan 승인 전" 문장보다 우선)

브랜치 `claude/phase14-patch`(기반 `claude/phase14-merge` `2e7a6a0`). 푸시·master 병합·공유 DB 적용은 하지 않았다. 자세한 내용은 `14-13-SUMMARY.md`.

- 커밋: `2b4a5e2`(읽기 `contentHash`), `50372f9`(입력 계약·구조화 오류), `f95157a`(0044 + DB 테스트), `e1d9b1b`(Codex 지적 반영). 이 문서 갱신은 그 뒤 별도 커밋.
- **마이그레이션 0044**는 일회용 DB(`anzafn…`)에만 적용했다. 공유 DB 적용 순서는 0041 → 0042 → 0043 → **0044**(+ 별도로 0050). §6 표에 0044 행을 더해 읽을 것: 일회용 적용됨 / 공유 미적용.
- 직접 재실행: 단위 203개 파일 3396/3396, eslint 0, tsc는 기존 `LayoutProps` 1건뿐, DB `patch-edits` 26/26(건너뜀 0). 나머지 DB 스위트 수치는 `14-13-SUMMARY.md` 참조.
- Codex `gpt-6-sol`(high, 읽기 전용) 교차 검증: 블로커 1 / 경고 2, 모두 고침.
- 병합 브랜치와 합치는 방법: `claude/phase14-patch`는 `claude/phase14-merge` 위에 커밋 5개(+문서)만 얹었다. `phase14-merge`가 푸시·병합된 뒤 그 위로 fast-forward하거나 함께 병합하면 된다. 겹치는 파일은 없다.
- **14-09 수동 인수에 추가할 것(런북 반영 필요):** (1) 실제 Claude 커넥터에서 `get_kb_document`가 `contentHash`를 주고 `propose_kb_document`/`save_draft`가 `baseHash`+`edits`로 성공하는지, 도구 스키마가 Claude에게 어떻게 보이는지. (2) 오래된 `baseHash`로 호출하면 Claude가 `latestHash`로 재읽기·재시도하는지. (3) 같은 수정에서 전체 `content` 방식과 `edits` 방식의 쓰기 출력 토큰을 비교하는 계측(PLAN 위험 7). 이번 구현에서는 측정하지 않았다.
- 알려진 한계는 `14-13-SUMMARY.md`의 "남은 위험·한계".

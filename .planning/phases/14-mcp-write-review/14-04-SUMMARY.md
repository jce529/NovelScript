---
phase: 14-mcp-write-review
plan: 04
subsystem: database
tags: [mcp, supabase, security-definer, proposals, accept, revert]
requirements: [MCP-05, MCP-06, MCP-07]
dependency_graph:
  requires: [14-01 (0041 mcp_proposals + propose RPCs), 14-03 (hashContent)]
  provides:
    - accept_mcp_chapter_draft(uuid,text,text,jsonb)
    - accept_mcp_kb_edit(uuid,text,text,jsonb)
    - accept_mcp_kb_create(uuid,uuid,text)
    - reject_mcp_proposal(uuid)
    - revert_mcp_proposal(uuid,boolean,text)
    - mcp_proposal_caller() active-writer check (cross-review fix)
  affects: [14-05 server actions (acceptProposal/rejectProposal/revertProposal), 14-06 review UI copy]
tech_stack:
  added: []
  patterns: [browser-only definer RPC with OAuth guard as first statement, private invoker helpers, per-writer advisory lock shared with propose, hash compare under FOR UPDATE]
key_files:
  created:
    - supabase/migrations/0042_mcp_proposal_decisions.sql
    - tests/proposals/accept-revert.database.test.ts
  modified:
    - tests/mcp/read-boundary.database.test.ts
decisions:
  - "Error contract: 42501 browser session required / active writer required / mcp_suspended; P0001 mcp_not_found, mcp_not_pending, mcp_expired, mcp_stale, mcp_folder_invalid, mcp_folder_changed, mcp_name_collision, mcp_not_revertible, mcp_undo_expired; 22023 mcp_invalid_content, mcp_invalid_decision"
  - "revert_mcp_proposal(p_proposal_id uuid, p_confirm boolean default false, p_seen_hash text default null): if the target changed since accept it returns {status:'accepted', confirm_required:true, changed_since_accept:true, current_hash}; it restores only when p_confirm=true and p_seen_hash equals the current state hash under FOR UPDATE (else a fresh confirm_required). p_confirm without p_seen_hash -> mcp_invalid_decision. kb_create: name/parent/lock changes also count as changed"
  - "Accept stores p_new_content byte-for-byte (no CRLF rewrite) so unselected paragraphs keep their bytes; empty result allowed; length cap 100000 chapter / 50000 kb"
  - "Accept/revert require profiles.role='writer' and user_can_write; reject requires only a live profile (suspended writers and demoted readers may clear their queue)"
  - "kb-writing RPCs (accept_mcp_kb_edit, accept_mcp_kb_create, revert_mcp_proposal) use search_path 'public, pg_temp' because the 0002/0004 kb_nodes guard triggers reference kb_nodes unqualified; chapter accept, reject and all helpers keep search_path ''"
  - "Decision calls take the same per-writer advisory lock as mcp_proposal_caller(), so propose/supersede and accept never interleave; they also retire expired pending rows and drop undo snapshots past undo_until (opportunistic cleanup)"
  - "Folder version = root->folder 'id:name' joined by '/', identical to lib/kb/actions.ts FolderCandidate.version; invalid folder -> mcp_folder_invalid, version mismatch -> mcp_folder_changed"
metrics:
  duration: ~50min
  completed: 2026-11-05
  tasks: 2
  files: 3
---

# Phase 14 Plan 04: 작가 결정 RPC (수락·거절·되돌리기) Summary

0042에서 작가 브라우저 세션 전용 결정 RPC 다섯 개를 만들었다. 모든 함수는 첫 문장이 `perform public.mcp_reject_oauth_caller();`이고, definer 안에서 `owner_id = auth.uid()`를 직접 검사한다. 제안 행과 대상 행을 `FOR UPDATE`로 잠근 뒤 현재 원문의 UTF-8 SHA-256을 비교하고(`mcp_stale`이면 아무것도 바뀌지 않는다), 원문·제안 상태·7일 undo 스냅샷을 한 트랜잭션에 쓴다. 교차 리뷰 지적도 같은 마이그레이션에서 고쳤다. `mcp_proposal_caller()`가 이제 `profiles.role = 'writer' and deleted_at is null`(0037과 같은 조건)을 확인하므로, reader로 강등된 계정은 예전 bearer 토큰으로 제안할 수 없다.

## What was built

### 0042_mcp_proposal_decisions.sql
- `mcp_proposal_caller()`는 `create or replace`로 0041 본문을 그대로 두고 `active writer required`(42501) 검사만 추가했다. 위치는 연결 행 확인 뒤, scope 확인 앞이다. `volatile`, invoker, `search_path=''`, `revoke all ... from public, anon, authenticated, service_role` 설정은 다시 명시했고 카탈로그 테스트로 고정했다. 세 propose RPC의 grant는 건드리지 않았다.
- 비공개 헬퍼는 넷이다. 모두 invoker이고 `search_path=''`이며 EXECUTE 권한을 가진 역할이 없다.
  - `mcp_decision_caller(boolean)`: 브라우저 신원과 live profile을 확인하고, 인자가 true면 writer 역할도 확인한다. 이어서 작가별 advisory lock을 잡고 만료된 pending 행과 undo 스냅샷을 정리한다.
  - `mcp_decision_check_pending`: `mcp_expired`와 `mcp_not_pending`을 판정한다.
  - `mcp_decision_check_content`: 내용 길이를 검사한다.
  - `mcp_decision_check_decision`: decision이 jsonb object이고 200KB 이하인지 검사한다.
- `accept_mcp_chapter_draft` / `accept_mcp_kb_edit`: 처리 순서는 다음과 같다.
  1. 정지 계정이면 `mcp_suspended`로 막는다.
  2. 내용 길이와 decision을 검사한다.
  3. 제안 행을 소유자와 kind 조건으로 `FOR UPDATE` 잠근다.
  4. pending이고 만료되지 않았는지 확인한다.
  5. 대상 행을 `FOR UPDATE of` 잠근다. 작품 소유·미삭제를 확인하고, 문서는 추가로 `scope='work'`, file, 미잠금, 인물~아이템/custom 카테고리여야 한다.
  6. 해시를 비교한다.
  7. content와 updated_at을 바꾸고, 제안에 accepted·decision·undo_content·`undo_until = now() + interval '7 days'`·applied_hash를 같은 트랜잭션에서 쓴다.

  발행된 회차도 수락할 수 있다.
- `accept_mcp_kb_create(uuid,uuid,text)`: 폴더에서 루트까지 거슬러 올라가며 각 단계가 소유·작품·`scope='work'`·folder·`category = proposed_category`·미삭제인지 확인한다. 이 행들은 `FOR SHARE`로 잠그고, 깊이는 32 이하로 제한하며 순환을 막는다. 루트가 하나뿐인지도 확인한다. 그다음 계산한 `id:name` 체인을 `p_folder_version`과 비교하고 file을 삽입한다. 이름 충돌(`23505`)은 `mcp_name_collision`으로 바꾸고, 제안은 pending으로 남는다. 성공하면 `created_node_id`를 기록한다.
- `reject_mcp_proposal(uuid)`: pending 제안만 rejected로 바꾼다. 정지 계정이나 강등된 reader도 거절할 수 있다.
- `revert_mcp_proposal(uuid, boolean default false, text default null)`: accepted 상태이고 `undo_until > now()`이며 정지 계정이 아닐 때 한 번만 된다.
  - 회차와 문서는 `undo_content`로 되돌리고, 신규 문서는 `created_node_id`를 소프트 삭제한다(잠그지 않는다).
  - 수락 뒤 대상이 바뀌었으면(신규 문서는 이름·부모 폴더·잠금 변경 포함) 복원하지 않고 `current_hash`가 담긴 확인 요청을 돌려준다. `p_confirm=true`와 그 `p_seen_hash`가 잠금 아래 현재 해시와 같을 때만 복원하고, 다르면 새 `current_hash`로 다시 확인을 요청한다.
  - 복원 후 상태는 `reverted`, `undo_content`는 null이고, decision에 `reverted_at`과 `changed_since_accept`를 덧붙인다.
- EXECUTE는 다섯 함수 모두 authenticated에게만 열었다(public·anon·service_role은 revoke).

### Tests (일회용 DB `anzafn…` 전용)
- `tests/proposals/accept-revert.database.test.ts` (24건)
  - 해시: SQL `mcp_proposal_sha256`·`encode(sha256(convert_to()))`와 `hashContent`가 같은 값을 낸다(한글, 이모지·ZWJ 가족, 국기, CRLF/CR, 조합형 é, 빈 문자열, 개행만 있는 문자열).
  - 원자성: 성공하면 본문·상태·decision·undo·7일·applied_hash가 함께 반영된다. 제안 UPDATE에 실패 트리거를 걸면 본문과 제안이 함께 롤백된다.
  - 실패 경로: stale(편집기에서 바뀐 원문, null 해시), 타 작가 제안, kind 불일치, 이중 수락, 만료, 삭제된 회차, 길이·decision 형식 오류.
  - kb_edit: 성공, null content, locked·deleted·stale·초과 길이.
  - kb_create: 루트·하위 폴더에 생성된다. 다른 카테고리, custom, 다른 작품, `account_template`, 삭제된 폴더, 타 작가 폴더, 없는 폴더, 이름이 바뀐 version, null version은 모두 거부되고 kb_nodes 개수도 변하지 않는다. 이름 충돌은 `mcp_name_collision`으로 거부된다.
  - reject: B는 `mcp_not_found`, A는 rejected가 된다. 다시 거절하거나 수락하면 `mcp_not_pending`.
  - revert: 한 번만 된다(`mcp_not_revertible`). 되돌린 뒤 다시 수락할 수 없다. 변경 경고 뒤 confirm으로 복원하는 흐름, kb_edit 복원, kb_create 소프트 삭제, 7일 경과 `mcp_undo_expired`, 기회적 undo 정리를 확인했다.
  - 정지 계정: 수락 3종과 되돌리기는 `mcp_suspended`, 거절은 허용된다.
  - 강등된 reader:
    - bearer로 부르는 propose RPC 3종은 `active writer required`로 막히고 행이 생기지 않는다.
    - 브라우저에서도 수락·되돌리기·kb_create 수락이 `active writer required`로 막힌다.
    - 거절은 허용되고, 다시 writer가 되면 같은 bearer로 제안할 수 있다.
  - bearer: 다섯 RPC를 A·B 토큰으로 부르면 모두 403 `browser session required`(42501)이고 anon은 401/403/404다. 아무것도 바뀌지 않는다.
- `tests/mcp/read-boundary.database.test.ts` (20건, +1)
  - 노출 definer RPC 45개 중 결정 RPC 5개를 `block`으로 분류했다. OAuth claims는 `browser session required`를 받고 브라우저 claims는 가드를 통과하며, plpgsql 가드가 첫 문장인지 확인한다.
  - 결정 RPC lockdown: definer, authenticated만 EXECUTE, PUBLIC ACL 없음, 고정 search_path. 헬퍼는 EXECUTE 권한이 없다.
  - `mcp_proposal_caller` 하드닝(`search_path=""`, ACL 비노출, 새 writer 검사 문자열)을 고정했다.

## Verification

| Command | Result |
|---------|--------|
| run-db.mjs `tests/proposals/accept-revert.database.test.ts --project db` (Task 1) | 1 file, 12 passed, 0 skipped |
| run-db.mjs `tests/proposals/accept-revert.database.test.ts tests/mcp/read-boundary.database.test.ts --project db` (Task 2) | 2 files, 41 passed, 0 failed, 0 skipped |
| run-db.mjs `tests/mcp tests/proposals --project db` (full regression, once) | 11 files, 105 passed, 0 failed, 0 skipped |
| run-db.mjs `accept-revert --project db` (cc8f27c 수정 후) | 1 file, 24 passed, 0 skipped |
| run-db.mjs `tests/mcp tests/proposals --project db` (cc8f27c 수정 후 전체 1회) | 8 files 통과, 97 passed. 나머지 3 files는 DCR HTTP 429로 4 failed, 7 skipped(코드 결함 아님) |
| 10분 대기 후 429가 난 3 files만 재실행 (sensitive-rls, source-snapshot, revoke-blocks) | 3 files, 11 passed, 0 skipped. 합계 108/108 passed |
| `vitest run tests/proposals tests/mcp --project unit` | 15 files, 404 passed |
| eslint `--max-warnings=0` on both changed test files | clean |

0042는 일회용 DB(ref 접두 `anzafn`, API·DB URL이 같은 ref, 공유 `ymudwg` 아님. 값은 출력하지 않고 확인했다)에만 `scripts/apply-migration.mjs`로 세 번 적용했다(re-runnable). 0040은 쓰지 않았다.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (RED) | 763b61a | test(14-04): add failing DB tests for chapter/KB accept RPCs and demoted-writer propose |
| 1 (GREEN) | 5acfd1e | feat(14-04): add browser-only chapter/KB accept RPCs and active-writer check on propose (0042) |
| 2 (RED) | 3afa2fa | test(14-04): add failing DB tests for kb_create accept, reject, revert and decision RPC catalog |
| 2 (GREEN) | 6468f50 | feat(14-04): add kb_create accept, reject and one-time revert decision RPCs (0042) |

## Deviations from Plan

**1. [Cross-review WARNING - Security] Active writer check in `mcp_proposal_caller()` and the decision RPCs**
- 오케스트레이터가 지시한 수정이다. 0041 caller를 `create or replace`해 0037과 같은 조건을 추가했다. 수락·되돌리기도 같은 조건을 요구하고, 거절은 live profile만 확인한다. 강등된 reader 시나리오 DB 테스트를 추가했다. 커밋 5acfd1e, 6468f50.

**2. [Rule 2 - Correctness] `revert_mcp_proposal`에 확인 인자 추가 (`p_confirm`, `p_seen_hash`)**
- 플랜의 "확인된 요청일 때만 복원"을 단일 인자 서명으로는 표현할 수 없어서 인자를 더 받는다. 카탈로그 키는 `revert_mcp_proposal(uuid,boolean,text)`이다(아래 7번 참고).

**3. [Rule 3 - Blocking] kb 쓰기 RPC의 search_path를 `public, pg_temp`로 지정**
- `''`로 두면 0004 `guard_chapter_folder_no_kb_files` 트리거가 `relation "kb_nodes" does not exist`로 실패한다. 함수 본문의 참조는 모두 스키마를 붙였고, pg_temp를 마지막에 둬서 임시 객체가 끼어들 수 없다. 기존 definer RPC(`soft_delete_kb_node`가 `public`)와 같은 결이다.

**4. [Rule 2 - Correctness] 작가별 advisory lock 공유와 기회적 정리**
- 결정 RPC도 `mcp_propose:<uid>` lock을 잡는다. 그래서 같은 회차의 supersede와 accept가 엇갈리지 않고, 정리 UPDATE 사이의 교착도 막는다. 만료된 pending 행은 정리하지만, 그 정리를 거친 행의 수락 시도는 `mcp_not_pending`이 아니라 `mcp_expired`로 거부한다.

**5. 오류 코드 세분화**
- `mcp_not_pending`, `mcp_expired`, `mcp_folder_invalid`, `mcp_folder_changed`, `mcp_not_revertible`, `mcp_undo_expired`, `mcp_invalid_decision`을 추가했다(decisions 참고). 14-05 액션은 이 메시지를 매핑해야 한다.

**6. RED 단계 실행 생략**
- DCR 429 한도 때문에, 함수가 아직 없어 실패가 확실한 RED 실행은 돌리지 않고 커밋만 했다. 대신 GREEN 실행에서 0 skipped를 확인했다.

**7. [교차 검증 BLOCKER/WARNING 후속 수정] 되돌리기 확정과 신규 문서 변경 감지 (커밋 cc8f27c)**
- BLOCKER: 첫 버전은 `p_confirm=true`만으로 복원해서, 경고와 확정 사이에 작가가 다시 고친 최신 내용을 스냅샷으로 덮어쓸 수 있었다.
  - 이제 확인 요청 응답에 `current_hash`를 담고, 확정 호출은 `p_seen_hash`를 함께 보내야 한다.
  - 대상 행 `FOR UPDATE` 아래에서 현재 해시가 `p_seen_hash`와 같을 때만 복원한다. 다르면 새 `current_hash`로 다시 확인을 요청한다.
  - `p_confirm=true`인데 `p_seen_hash`가 null이면 `mcp_invalid_decision`(22023)이다.
  - 이전 시그니처 `(uuid, boolean)`은 0042 안에서 `drop function if exists`로 지웠고, grant/revoke와 search_path는 그대로 다시 걸었다.
- WARNING: 신규 문서 되돌리기가 내용 해시만 봤다.
  - 이제 이름(`proposed_name`), 부모 폴더(`decision.folder_id`), 잠금 상태가 수락 때와 다르면 changed로 판정한다. 필요한 값이 이미 제안 행에 있어서 컬럼은 추가하지 않았다.
  - 상태 해시: 신규 문서는 `sha256(jsonb_build_array(name, parent_id, is_locked, coalesce(content,''))::text)`, 회차·문서 수정은 `sha256(content)`.
  - 확정했는데 문서가 잠겨 있으면 `mcp_not_revertible`.
- 추가한 테스트:
  - 경고 뒤 다시 편집하면 확정해도 복원되지 않고 최신 편집이 보존된다. 잘못된 해시도 거부된다.
  - 올바른 `p_seen_hash`로는 복원된다.
  - 해시 없이 확정하면 `mcp_invalid_decision`.
  - 이름만 또는 폴더만 바뀐 신규 문서는 확인 요청을 거쳐 확정할 때만 soft-delete된다.
- 일회용 DB에 다시 적용한 뒤 accept-revert 24건이 통과했다.

## Deferred Issues

- 14-01에서 이어진 `tsc --noEmit`의 `LayoutProps` 오류와 vitest config 경고는 이번 범위가 아니다.

## Known Stubs

None.

## Self-Check: PASSED

---
phase: 14-mcp-write-review
plan: 01
subsystem: database
tags: [mcp, supabase, rls, security-definer, proposals, diff]
requirements: [MCP-05, MCP-06, MCP-07]
dependency_graph:
  requires: [0037_mcp_oauth_grants, 0038_oauth_sensitive_rls, 0039_mcp_read_boundary]
  provides:
    - public.mcp_proposals (single proposal table, oauth_browser_only, owner SELECT only)
    - mcp_propose_chapter_draft(uuid,uuid,text)
    - mcp_propose_kb_edit(uuid,uuid,text)
    - mcp_propose_kb_create(uuid,text,text,text)
    - diff@9.0.0 dependency
  affects: [14-02 write tools, 14-03 merge engine, 14-04 accept/reject/revert (0042)]
tech_stack:
  added: [diff@9.0.0]
  patterns: [bearer-only SECURITY DEFINER RPC with private invoker helpers, advisory xact lock per writer, partial unique index for one pending draft]
key_files:
  created:
    - supabase/migrations/0041_mcp_proposals.sql
    - tests/helpers/proposals-db.ts
    - tests/proposals/draft-tools.database.test.ts
    - tests/proposals/kb-tools.database.test.ts
    - tests/proposals/source-snapshot.database.test.ts
  modified:
    - tests/mcp/read-boundary.database.test.ts
    - package.json
    - package-lock.json
decisions:
  - "Single mcp_proposals table + kind CHECK; bearers get no table privilege, only 3 definer RPCs (guard class)"
  - "Added content_hash column (sha256 of normalized proposal text) as the dedupe key for idempotentHint:true"
  - "kb_edit targets: scope=work live unlocked files with category in 인물/장소/사건/세력/아이템/custom (custom = files under top-level user folders, since createFolder(parentId null) creates category custom and nested folders/files inherit the parent category); template/회차/account_template/folders refused"
  - "kb_create categories: 인물/장소/사건/세력/아이템 only; work must be owned and live; folder chosen at accept time (0042)"
  - "Proposal identical to current original -> mcp_no_change; input errors -> mcp_invalid_content/mcp_invalid_name/mcp_invalid_category (22023), not in the 14-02 allowlist so they map to the generic failure"
  - "Error contract: 42501 'live MCP grant required' (browser/anon/revoked), 42501 mcp_scope_denied, 42501 mcp_suspended, P0001 mcp_not_found / mcp_no_change / mcp_cap_reached"
  - "Cap counted after superseding, so replacing a chapter's pending draft needs no capacity; expired pending rows are retired to 'expired' inside every propose call"
metrics:
  duration: ~45min
  completed: 2026-11-04
  tasks: 2
  files: 8
---

# Phase 14 Plan 01: 제안 전용 DB 경계와 저장 RPC Summary

`mcp_proposals` 단일 표를 OAuth bearer에게 완전히 닫고(RESTRICTIVE `oauth_browser_only`, DML 권한 없음), 살아 있는 grant·`propose_draft` scope·`user_can_write`·소유권을 재검증하는 bearer 전용 SECURITY DEFINER RPC 3개로만 pending 제안을 만들게 했다. 원본 `chapters.content`/`kb_nodes`는 어떤 경로로도 바뀌지 않는다.

## What was built

### 0041_mcp_proposals.sql
- `mcp_proposals`: `kind in ('chapter_draft','kb_edit','kb_create')`, `content`(LF 정규화) + `content_hash`, `base_content`(원문 그대로) + `base_hash`(SHA-256 hex), 출처 스냅샷 `source_client_id/source_client_name/source_host`(RPC가 `mcp_connections`에서 채움), `status`(pending/accepted/rejected/superseded/expired/reverted), `expires_at = now() + interval '30 days'`, `decided_at`, `decision`, `undo_content`, `undo_until`, `applied_hash`, `created_node_id`. 종류별 모양 CHECK(`mcp_proposals_kind_shape`).
- `mcp_proposals_one_pending_draft` 부분 유니크 인덱스(회차당 pending 초안 1건), 큐/소유자 pending 인덱스.
- RLS: `mcp_proposals_select_own`(브라우저 본인 SELECT) + `oauth_browser_only` RESTRICTIVE. `authenticated`에는 SELECT만 grant.
- 비공개 헬퍼(EXECUTE 아무에게도 없음, definer 본문에서만 호출): `mcp_proposal_caller()`(bearer client_id·`mcp_grant_is_live`·연결 행·scope·`user_can_write`·advisory lock·만료 pending 정리), `mcp_proposal_normalize`, `mcp_proposal_sha256`, `mcp_proposal_check_cap`(50건).
- `mcp_propose_chapter_draft` / `mcp_propose_kb_edit` / `mcp_propose_kb_create`: definer, `search_path=''`, authenticated EXECUTE만. 반환은 `{id,status,expires_at,superseded_id}`만.

### Tests (disposable DB `anzafn…` only)
- `draft-tools`: 저장 성공·발행 회차 허용·dedupe 같은 id·다른 내용/다른 연결 supersede·DB 유니크 인덱스·만료 pending 비차단·교차 사용자/삭제/작품 불일치 `mcp_not_found`·길이/공백/NUL/no_change·브라우저/anon 거부·정지 `mcp_suspended`·scope 누락 `mcp_scope_denied`(롤백 트랜잭션 안에서 CHECK 제거 후 시뮬레이션)·50건 상한 `mcp_cap_reached`·대체는 용량 불필요·동시 4건 경합 시 pending 1건.
- `kb-tools`: edit 허용(중첩 폴더 상속 카테고리·custom·빈 본문), dedupe, 잠금/삭제/template/회차/account_template/폴더/타 작품/타 사용자 거부, 길이 검증; create 카테고리·이름·내용 검증, 타 사용자/삭제 작품 거부, 정지 거부.
- `source-snapshot`: 출처가 연결 행과 일치, base는 CRLF 포함 원문 그대로·TS/SQL 해시 일치, 출처/소유자 인자 위조 불가(RPC 서명에 없음), bearer REST 읽기·쓰기 거부, 브라우저는 본인 행만, 연결 해제 뒤에도 출처 보존·해제된 토큰은 제안 불가.
- `read-boundary`(확장): 41개 표 / 차단 37개, 노출 definer RPC 40개(제안 3개 `guard`), `mcp_proposals`에 대한 bearer REST SELECT/INSERT/UPDATE/DELETE 및 브라우저 DML 거부, 제안 RPC lockdown·헬퍼 비노출, 브라우저 claims는 `live MCP grant required`, live OAuth claims는 입력 검증까지 도달.

## Verification

| Command | Result |
|---------|--------|
| `node --env-file=.env.disposable node_modules/vitest/vitest.mjs run tests/proposals/draft-tools.database.test.ts tests/proposals/kb-tools.database.test.ts tests/proposals/source-snapshot.database.test.ts --project db` | 3 files, 26 passed, 0 skipped |
| `... run tests/mcp/read-boundary.database.test.ts --project db` | 1 file, 19 passed, 0 skipped |
| `... run tests/mcp tests/proposals --project db` (regression) | 9 files, 79 passed, 0 skipped |
| eslint `--max-warnings=0` on changed test files | clean |

`MCP_DISPOSABLE_PROJECT_REF` is not in `.env.disposable`; a scratchpad launcher set it from `TEMPLATE_MIGRATION_DISPOSABLE_PROJECT_REF` (same disposable ref, verified `anzafn` prefix and API/DB URL match without printing) before spawning vitest. 0041 applied only to the disposable DB; 0040 unused.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 (RED) | 0f8630f | test(14-01): add failing DB tests for MCP proposal RPCs |
| 1 (GREEN) | 2016da8 | feat(14-01): add mcp_proposals table and bearer-only propose RPCs (0041) |
| 2 | 15f6d86 | test(14-01): extend D-17 catalog to mcp_proposals and propose RPCs; add diff@9.0.0 |

## Deviations from Plan

### Auto-fixed / added

**1. [Rule 3 - Blocking] Shared fixture helper `tests/helpers/proposals-db.ts`**
- Not in `files_modified`; the three suites need identical writer/token/REST/claims setup and cleanup that hard-deletes locked fixture nodes (`session_replication_role = replica`, since `guard_kb_template_policy` forbids deleting locked nodes). Commit 0f8630f.

**2. [Rule 2 - Correctness] `content_hash` column**
- Dedupe ("same connection + same content -> same id") needs a stable key; stored sha256 of the normalized text. Commit 2016da8.

**3. [Rule 2 - Correctness] `mcp_no_change` and input error codes**
- Proposal equal to the current original is refused (`mcp_no_change`, already in 14-02's allowlist). Invalid content/name/category raise `mcp_invalid_*` (22023). NUL never reaches the RPC (Postgres JSON/text rejects `\u0000` first; test asserts non-200 and no row).

**4. [Rule 2 - Correctness] kind-shape CHECK null hole**
- Added explicit `is not null` for `proposed_category`/`proposed_name` so a NULL-valued CHECK cannot pass silently.

**5. diff pinned exactly** (`"diff": "9.0.0"`, `--save-exact`); shadcn keeps its nested diff 8.0.4.

## Deferred Issues

- `tsc --noEmit` reports `app/layout.tsx: Cannot find name 'LayoutProps'` — pre-existing (Next-generated type; `.next/types` absent in this worktree). Unrelated to this plan.
- Vitest prints "ESM syntax in a file loaded as CommonJS (vitest.config.ts)" warnings; tests run normally. Not investigated (out of scope).

## Known Stubs

None. `decision`, `undo_content`, `undo_until`, `applied_hash`, `created_node_id` are intentionally unused until 0042 (14-04 accept/reject/revert).

## Self-Check: PASSED

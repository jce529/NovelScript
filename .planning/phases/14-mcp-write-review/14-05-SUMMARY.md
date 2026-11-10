---
phase: 14-mcp-write-review
plan: 05
subsystem: proposals
tags: [review-queue, server-actions, paragraph-merge, staleness, supabase-rpc]
requires: [14-03, 14-04]
provides: [lib/proposals/queries.ts, lib/proposals/actions.ts]
affects: [14-06, 14-07, 14-08]
tech-stack:
  added: []
  patterns:
    - session-client data layer (supabase + session userId parameters, no 'use server' in lib)
    - server-side hunk recomputation; client sends indexes + optional 직접 고침 only
    - exact RPC message -> fixed Korean copy allow-list
key-files:
  created:
    - lib/proposals/queries.ts
    - lib/proposals/actions.ts
    - tests/proposals/queries.test.ts
    - tests/proposals/actions.test.ts
    - tests/helpers/proposals-fake-supabase.ts
  modified: []
requirements: [MCP-05, MCP-06, MCP-07]
decisions:
  - lib/proposals/actions.ts is a plain server-only module taking (supabase, userId, input); the 'use server' wrappers (auth.getUser + createClient + revalidatePath) belong to 14-06 under app/studio/[workId]/review/**
  - "Disconnected source = neither the source client id nor the (client_name, redirect_host) pair is an active connection (RESEARCH Pitfall 6: re-connect revokes the old client id)"
  - Accept with zero accepted hunks is refused (invalid_selection); rejecting is the separate action
  - 직접 고침 text is CRLF->LF normalized, NUL / length (100,000 chapter, 50,000 document) re-checked server-side
  - "'done' tab is ordered by decided_at (expires_at for lapsed pending), 'pending'/'all' by created_at desc; list capped at 200 rows"
metrics:
  duration: ~15min
  completed: 2026-11-06
---

# Phase 14 Plan 05: Review queue reads + decision logic Summary

Owner-scoped review queue/detail/badge reads and server-recomputed accept/reject/revert logic over the 0042 RPCs, where the client can only send hunk indexes, optional 직접 고침 text and the opaque seenHash it was shown.

## What was built

### `lib/proposals/queries.ts` (Task 1)
- `listWorkProposals(supabase, userId, workId, filter='pending')` → `{ok, work, filter, pendingCount, proposals[]}` | `{ok:false, reason:'not_found'|'error'}`. Work ownership checked first (foreign/missing/malformed id → same `not_found`); every proposal query also filters `owner_id` + `work_id`. `pending` = `status='pending' and expires_at > now`; `done` = non-pending rows plus lapsed pending rows (shown as `expired`). Summary: kind, effective status, times, target title (chapter title / document name / proposed name), category, `changeCount` (base→draft hunks), `source {clientName, host, disconnected}` from the stored snapshot.
- `getProposalDetail(supabase, userId, workId, proposalId)` → `ProposalDetail` with `hunks` (each with `currentText`), `currentContent`, `isStale`, `seenHash`, `target.state` (`ok|locked|missing`), `draft`, `undoUntil`, `canRevert`, recorded `decision {acceptedIndexes, editedIndexes}`, `folders` (kb_create pending: `listCategoryFolderCandidates`), `savedFolderId`, `createdNodeId`. Hunks are computed against the CURRENT original only while pending + target ok; decided/expired/locked views get the proposal's own static diff and `seenHash: null`. Chapter content is read through `read_chapter_content` (column revoked since 0005). The stored `base_hash` is never put in the DTO.
- `countPendingProposalsByWork(supabase, userId, workIds)` → `{[workId]: n}` with a single query (no N+1); failure → zeros.
- `countPendingProposalsForTarget(supabase, userId, workId, 'chapter'|'node', targetId)` → `{count, proposalIds}` (UI: 1건이면 상세로).

### `lib/proposals/actions.ts` (Task 2)
- `acceptProposal(supabase, userId, input)`; input is `z.strictObject({workId, proposalId, seenHash?, selections:[{index, accepted, editedText?}], folderId?, folderVersion?})` — any extra field (hunk text, final content, ownerId) → `invalid_request`. Flow: re-load via `getProposalDetail` (ownership, pending, unexpired, target state) → `seenHash !== hash(current)` → `{ok:false, status:'stale', error, detail}` with no RPC → `applySelectedHunks` on the re-read current with server hunks (throws mapped to `invalid_selection`) → `accept_mcp_chapter_draft` / `accept_mcp_kb_edit` with server-computed `p_expected_hash`, final text and decision JSON `{accepted_indexes, edited_indexes, hunk_count, stale_base}`. RPC `mcp_stale` re-reads and returns a fresh stale detail. kb_create requires `folderId` + `folderVersion` (`folder_required`), pre-checks them against the re-read candidates (`folder_changed`) and calls `accept_mcp_kb_create`.
- `rejectProposal(supabase, userId, {workId, proposalId})`: ownership in this work, then `reject_mcp_proposal`; no write-access pre-check (suspended writers may reject, D-P14-07).
- `revertProposal(supabase, userId, {workId, proposalId, confirm?, seenHash?})`: returns `{status:'confirm_required', confirmHash}` with the RPC `current_hash` unchanged; the confirm call passes it back as `p_seen_hash`. `confirm` without `seenHash` → `invalid_request` before the RPC. No hashing in the action.
- `PROPOSAL_ERROR_COPY` + exact-message allow-list: `browser session required`/`active writer required` → forbidden, `mcp_suspended` → `WRITE_SUSPENDED_MESSAGE`, `mcp_not_found`, `mcp_not_pending`, `mcp_expired`, `mcp_folder_invalid`/`mcp_folder_changed` → folder copy from UI-SPEC D, `mcp_name_collision` → `같은 이름의 문서가 있어요. 다른 폴더를 선택하거나 제안을 거절해 주세요.`, `mcp_invalid_content`, `mcp_invalid_decision`, `mcp_not_revertible`, `mcp_undo_expired`; anything else → per-action failure copy from UI-SPEC (no SQL text).

## Tests (run in this session)
- `tests/proposals/queries.test.ts`: 16 passed (owner, expired, snapshot/disconnected, count/no-N+1, detail stale/locked/missing/kb_create/accepted).
- `tests/proposals/actions.test.ts`: 41 passed (identity/ownership, client text tampering, stale (pre-check and RPC race), state + RPC error mapping with SQL-leak check, kb_edit/kb_create, suspended reject, revert confirm round-trip).
- Plan verify set `actions + paragraph-merge + queries + hash` (unit): 79 passed, 0 failed, 0 skipped.
- `tests/proposals tests/mcp --project unit`: 17 files, 461 passed, 0 failed.
- `tsc --noEmit`: only the known pre-existing `app/layout.tsx` `LayoutProps` error (missing `.next/types`). ESLint clean on the new files.
- DB suite not run (no DB code or migration changed; DB atomicity gate = 14-04's 110/110). Phase-end double green run is still pending per HANDOVER §3.

## Commits
- 0efb82a test(14-05): add failing tests for proposal queue, detail and badge queries
- 92fe47b feat(14-05): owner-scoped review queue, detail and pending badge queries
- ca6e1f5 test(14-05): add failing tests for accept/reject/revert decision logic
- 7813902 feat(14-05): server-recomputed accept, reject and revert decision logic

## Deviations from Plan

1. **[Rule 3 - Blocking] Test helper file added** — `tests/helpers/proposals-fake-supabase.ts` (in-memory query builder + RPC handlers) is not in `files_modified`; both test files need it. Commit 0efb82a.
2. **[Rule 2 - Correctness] Disconnected detection also matches (client_name, host)** — the plan says compare `source_client_id` with current connection IDs; RESEARCH Pitfall 6 shows that alone mislabels a re-connected client (0037 revokes the old client id on re-approval). Both are checked. Commit 92fe47b.
3. **Signatures take `(supabase, userId, ...)`** — plan wrote `listWorkProposals(workId,status)` etc.; the repo pattern (`lib/chapters/actions.ts`, `lib/kb/actions.ts`) is session client + session user ID injected by the `'use server'` wrapper. The wrapper (createClient + auth.getUser + revalidatePath) is left to 14-06, per RESEARCH's file layout (`app/studio/[workId]/review/[proposalId]/actions.ts`).
4. **`seenHash` optional in the schema** — required (else `invalid_request`) for chapter/kb_edit, not used for kb_create (no original to compare).

## Notes for 14-06 / later
- `ProposalDetail.seenHash` and revert `confirmHash` are opaque tokens: keep them in client state, never render them.
- Paragraph-merge behaviour seen while writing tests (14-03 module, not changed here): an 추가 hunk at end of text joins with a single `\n` (`...넷째 문단\n다섯째 문단\n`), and an edited replacement that already ends with `\n` does not keep the replaced paragraph's blank-line tail. If the UI pre-fills 직접 고치기 with `hunk.after` (which carries its tail) this is fine; worth checking in 14-06/14-09.
- `listWorkProposals` caps each list at 200 rows (no pagination yet).

## Known Stubs
None.

## Self-Check: PASSED
- FOUND: lib/proposals/queries.ts, lib/proposals/actions.ts, tests/proposals/queries.test.ts, tests/proposals/actions.test.ts, tests/helpers/proposals-fake-supabase.ts
- FOUND commits: 0efb82a, 92fe47b, ca6e1f5, 7813902

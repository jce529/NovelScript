---
phase: 18-world-tree
plan: "07"
subsystem: world-tree
tags: [world-tree, server-actions, owner-state, notices, eligibility-gate, tdd]
requires: ["18-02", "18-03", "18-04", "18-14"]
provides:
  - "lib/world-tree/owner.ts: getWorldTreeOwnerState / getOwnedBranch / getOwnedTimeline / markBranchNoticeRead / OWNER_COPY"
  - "app/studio/[workId]/world/actions.ts: getBranchEligibilityAction / beginBranchAction / getBranchDiffAction / confirmBranchAction / saveWorldTimelineAction / ensureWorldTreeAction / deleteBranchAction / markBranchNoticeReadAction / getReaderPreviewAction"
affects: ["18-08", "18-09", "18-12"]
tech-stack:
  added: []
  patterns:
    - "Session -> write access (mutations only) -> owner-scoped getWork, then the domain call; no client ownerId"
    - "Server eligibility pre-check on the parent/source work; DB re-assert result passed through typed"
    - "Retry recovery: begin with an existing request_id and confirm of a confirmed branch skip the pre-check"
    - "Persisted<T> = success & { refreshed }: revalidatePath failure never looks like a failed save"
key-files:
  created:
    - lib/world-tree/owner.ts
    - tests/world-tree/owner.test.ts
    - app/studio/[workId]/world/actions.ts
    - tests/world-tree/actions.test.ts
  modified: []
requirements: [WTREE-01, WTREE-02, WTREE-03, WTREE-04, WTREE-05, WTREE-07, WTREE-10]
decisions:
  - "Owner reads are not gated by write access (a suspended writer can still view their tree and preview); every mutation action checks checkWriteAccess before the domain call, and the domain functions/RPCs check again."
  - "Timeline save takes only eras/placements from the client. Branch id/kind/work and the baseline (stored eras, placements, live child fork eras) are loaded server-side via getOwnedTimeline for the work's own branch line."
  - "confirmBranchAction pre-checks eligibility on the parent branch's work (the original source), not the draft, matching the 0034 assert target."
  - "Notice DTO drops event_key (it carries a source node id) and exposes kind/createdAt/readAt/read/message only."
  - "Added ensureWorldTreeAction (not listed in the plan) so 18-08/18-09 can create the trunk from a Server Action instead of a read page writing."
metrics:
  duration: "~30m"
  completed: "2026-10-19"
  tasks: 2
  files: 4
---

# Phase 18 Plan 07: Owner world-tree state and session Server Actions Summary

`lib/world-tree/owner.ts` gives the studio settings screen one owner-scoped state: the branch row, the draft DTO, the editable timeline with a server baseline, a delete block based on DB child rows, source-change notices, the server eligibility summary and the owner/admin tree. `app/studio/[workId]/world/actions.ts` is a thin `'use server'` boundary. Every action re-derives the user from the session, checks write access and work ownership, and only then calls the 18-02/18-03/18-04 domain functions.

## What was built

- **owner.ts**
  - `getWorldTreeOwnerState(supabase, {ownerId, workId})`:
    - Runs the owner-scoped `getWork` first. Someone else's work returns `forbidden` before any world table read or eligibility RPC.
    - Reads `world_branches`, `world_eras`, `world_era_placements` and `world_branch_notices` with explicit column lists. It never reads `world_branch_docs`, `kb_nodes` or content.
    - If a read fails or a row is malformed, the whole state is `unavailable`.
    - `deletion.canDelete` comes from live child rows (`has_children` and its copy). `soft_delete_world_branch` still enforces this.
    - The `eligibility` section comes from `getBranchEligibility`. A failed or malformed summary is `{status:'unavailable'}` and never eligible. `parent_not_visible`, `isPublished` and `readerVisible` are passed through unchanged.
    - The `tree` section accepts only the owner/admin projection. A reader-mode answer becomes `error`.
  - `getOwnedBranch` looks up a branch by branch id, work id or request id, always with an `owner_id = ownerId` filter. Someone else's id resolves to `null`.
  - `getOwnedTimeline` returns the work's own branch plus the baseline (eras, placements, `forkEraIds` of live children).
  - `markBranchNoticeRead`:
    - Calls the write gate, then the 0036 `mark_branch_notice_read` RPC with `{p_notice_id}` only.
    - Reports success only when the answer is exactly `{notice_id, read_at}` with the same id and a parseable timestamp. Anything else is `unavailable`/retryable, so the UI must keep the notice unread.
    - Error mapping: `world_tree_forbidden` → `forbidden`, `write_access_denied` → `write_suspended`.
- **actions.ts** (all exports are async functions; the rest are type exports):
  - Shared session check, in order:
    1. Id validation.
    2. `createClient().auth.getUser()`. No user → `unauthenticated`; a thrown error → `unavailable`.
    3. `checkWriteAccess` (mutations only).
    4. Owner-scoped `getWork`.
  - The action builds each domain input itself. Client `ownerId`, counts, eligibility, thresholds and visibility fields are dropped.
  - `beginBranchAction` and `confirmBranchAction` run `eligibilityGate` on the source work. An unmet summary returns `branch_ineligible` with `unmetReasons` and the summary; `parent_not_visible` uses its own copy. A failed lookup returns `eligibility_unavailable`. A DB rejection after the gate passes is returned unchanged.
  - Retries skip the gate and recover the stored result. Begin skips it when a branch already exists for the request id. Confirm skips it when the branch is already confirmed.
  - `deleteBranchAction` requires the branch to be this work's own branch.
  - `getReaderPreviewAction` calls `getWorldTree({readerPreview:true})` and rejects anything that is not reader mode or `unavailable`.
  - Revalidation happens only after a success:
    - `/studio/{id}/world` and `/works/{id}` for the work, its source and its root.
    - `/studio` after a delete.
    - A refresh failure returns `refreshed:false` on the success result.
  - No `use cache`/cacheComponents, so no updateTag/revalidateTag.

## Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | RED | faff015 | test(18-07): add failing tests for owner world-tree state and notice read |
| 1 | GREEN | e65a846 | feat(18-07): implement owner world-tree state, owned branch lookup and notice read |
| 2 | RED | 328c5dd | test(18-07): add failing tests for world-tree studio server actions |
| 2 | GREEN | 71477f0 | feat(18-07): add session-derived world-tree studio server actions |

No refactor commit was needed.

## Verification

- RED: both suites failed on import ("Cannot find package '@/lib/world-tree/owner'" and "'@/app/studio/[workId]/world/actions'").
- `npx vitest run --project unit tests/world-tree/actions.test.ts tests/world-tree/owner.test.ts`: 69 passed (owner 21, actions 48).
- `npx vitest run --project unit tests/world-tree`: 17 files, 441 tests passed.
- `npx tsc --noEmit -p .`: clean across the repo.
- eslint clean on all 4 files.
- Next docs read before writing: 05-server-and-client-components, 07-mutating-data, 09-revalidating. No route or page was added.

## Deviations from Plan

- **[Rule 2 - Correctness] Server-derived timeline baseline.** `saveTimeline` takes a baseline. The action builds it from DB rows (`getOwnedTimeline`) and overrides the branch id, kind and work id, so a client cannot send a weaker baseline or aim at another branch.
- **[Rule 2 - Correctness] Begin retry recovery.** The plan exempts only the confirm retry from the pre-check. A begin retry with the same request id is exempted too, because 18-02's RPC returns the existing draft before its assert. Without this, a stale eligibility drop would block recovering a draft that already exists.
- **Added `ensureWorldTreeAction`**, so trunk creation goes through a session-checked mutation.
- **Read actions skip write access.** Eligibility, diff and reader preview stay available to a suspended writer, following write-access.ts ("Reads never call this").

## Gaps / Not proven here (gate 18-12)

- Unit tests only. Supabase, the RPCs and the domain modules are mocked or faked, so RLS on the world tables, `mark_branch_notice_read` and the eligibility/confirm RPCs were not run against a database. Live proof belongs to 18-12.
- No page uses the actions yet. 18-08 (timeline editor) and 18-09 (settings/status UI) wire them up, so revalidated paths such as `/studio/{id}/world` do not exist as routes yet.
- The pre-check and the RPC assert are two separate reads, so eligibility can change between them. The RPC is authoritative, and its typed rejection is passed through.
- Not run, per orchestrator instruction: `graphify update .`, `scripts/graph-link-requirements.py`, STATE.md and ROADMAP.md updates.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/world-tree/owner.ts, tests/world-tree/owner.test.ts, app/studio/[workId]/world/actions.ts, tests/world-tree/actions.test.ts
- FOUND commits: faff015, e65a846, 328c5dd, 71477f0

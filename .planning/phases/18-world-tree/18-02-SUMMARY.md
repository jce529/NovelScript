---
phase: 18-world-tree
plan: "02"
subsystem: world-tree
tags: [world-tree, branching, rpc, immutability, delete-guard, migration-0034]
requires: ["18-01", "18-13", "18-14"]
provides:
  - "begin_world_branch(uuid, text, uuid, uuid) -> {draft_work_id}: create_work + is_branch_draft + KB clone + frozen baseline"
  - "get_world_branch_diff(uuid) -> {counts, entries}: owner-only, never content"
  - "confirm_world_branch(uuid, text, uuid) -> {work_id, branch_id}: assert(original parent) + server diff + snapshot + flip + clone_world_branch_timeline"
  - "soft_delete_world_branch(uuid) -> {branch_id, work_id}"
  - "clone_world_branch_timeline(uuid, uuid) contract (fail-closed placeholder; 0035 replaces it)"
  - "lib/world-tree/branches.ts: beginBranch/getBranchDiff/confirmBranch/deleteBranch/getBranchEligibility + BRANCH_COPY"
affects: ["18-03", "18-07", "18-09", "18-12"]
tech-stack:
  added: []
  patterns:
    - "Fixed lock order root work -> parent work -> draft work -> branch row (FOR UPDATE); FK KEY SHARE conflict serialises phantom chapter/KB inserts"
    - "Idempotent retry: request_id for begin, confirmed status returned before re-evaluation for confirm"
    - "BEFORE triggers without current_user bypass so SECURITY DEFINER KB paths are guarded too"
key-files:
  created:
    - supabase/migrations/0034_world_tree_branching.sql
    - tests/world-tree/branching-source.test.ts
    - tests/world-tree/branching.database.test.ts
    - lib/world-tree/branches.ts
    - tests/world-tree/branches.test.ts
  modified: []
requirements: [WTREE-03, WTREE-04, WTREE-05, WTREE-10]
decisions:
  - "Phantom guard: begin/confirm hold FOR UPDATE on the parent works row, which conflicts with the FK KEY SHARE every chapter/kb_nodes insert takes; 0033's FOR SHARE covers existing rows. SERIALIZABLE is not used (cannot be set inside a PostgREST RPC function)."
  - "begin returns an existing draft for a retried request_id before the eligibility assert; confirm returns the stored result for a confirmed branch before the assert, so a later eligibility drop never creates a second branch."
  - "Confirmed-branch freeze covers the 5 setting categories (files and folders) only; the template and 회차 areas of the new work keep working so the author can still organise chapters and templates."
  - "inherited_from_node_id is set on every cloned setting row (If and expand). Only expand drafts treat it as immutable; If copies stay editable and are diffed against world_branch_docs baselines."
  - "Moving a kb_nodes row into or out of any non-trunk branch work (work_id change) is rejected (world_branch_cross_work_move) so the baseline/snapshot mapping cannot be bypassed."
  - "Source-change notices: event_key 'source_kb:<node id>' per confirmed child (re-opened as unread on later edits), plus 'source_changed_before_confirm' written by confirm. Copies are never updated."
  - "A works soft delete through any path tombstones its world_branches row in the same transaction (AFTER UPDATE OF deleted_at trigger)."
metrics:
  duration: "~35m"
  completed: "2026-10-19"
  tasks: 2
  files: 5
---

# Phase 18 Plan 02: Self-branch drafts, server diff, atomic confirm and immutability Summary

Migration 0034 adds the four branch RPCs. Begin and the first confirm call the 0033 `world_tree_assert_branch_eligible` on the original parent, after the auth, ownership and lock steps. The migration also adds KB/snapshot immutability triggers and live-child delete guards. `lib/world-tree/branches.ts` wraps these RPCs for the 18-07 Server Actions. It passes only whitelisted arguments, uses typed error copy, and separates retryable failures from rule rejections.

## What was built

- **begin_world_branch**: steps run in this order.
  1. `world_tree_require_writer()` checks auth.uid, then the writer role, then `user_can_write`.
  2. Source ownership is checked. A missing work and someone else's work raise the same `world_tree_forbidden`.
  3. Locks are taken root first, then source.
  4. A retry with the same `request_id` returns the existing draft. A conflicting reuse raises `world_branch_request_conflict`.
  5. `world_tree_assert_branch_eligible(p_source_work_id)` runs.
  6. A trunk row is created if the source has none.
  7. `create_work` creates the draft, which is then marked `is_branch_draft`.
  8. The 5 locked default templates are seeded from `kb_template_seed_catalog`, so the 0023 guard accepts them unchanged.
  9. The work-scope KB is cloned using an old->new id map. Structural roots, locked category folders and locked default files map onto the draft's own rows and are never duplicated. The 회차 area and chapters are not cloned.
  10. A frozen baseline row (`world_branch_docs`) is written for every setting file.
- **get_world_branch_diff**: owner only. While the branch is a draft, the diff is recomputed as frozen baseline vs draft. Once confirmed, the stored snapshot is returned. Entries carry only `{draftNodeId, sourceNodeId, name, category, changeKind}`.
- **confirm_world_branch**: steps run in this order.
  1. Writer check, then ownership.
  2. Locks: root, then parent work, then draft work, then the branch row.
  3. A confirmed branch returns its stored result.
  4. Title and era are checked. The era must be on the parent line and match the stored fork.
  5. The assert runs on `v_parent.work_id`, not the draft. Its `branch_ineligible` DETAIL passes through unchanged and the whole transaction rolls back.
  6. The server diff is checked. If needs at least 1 change in total (`world_branch_zero_changes`). Expand needs zero modifications or deletions (`world_branch_inherited_mutation`) and at least 1 addition (`world_branch_zero_additions`).
  7. In one transaction: the snapshot is written, the draft is flipped to confirmed, and `clone_world_branch_timeline` is called. If the source changed between begin and confirm, a `source_changed_before_confirm` notice is also written.
- **soft_delete_world_branch**: locks root then the work. Raises `world_branch_has_children` if a live child exists. Otherwise it tombstones the branch and soft-deletes the work.
- **Guards**:
  - `guard_world_branch_kb` (BEFORE INSERT/UPDATE/DELETE on kb_nodes, no current_user bypass, so `soft_delete_kb_node` is covered):
    - In expand drafts, inherited rows cannot change name, content, category, parent, scope, work, owner, type, source ref or deleted_at, and cannot be hard-deleted. This includes inherited folders.
    - Confirmed branches have a frozen setting KB.
    - Cross-work moves are rejected.
  - `world_branch_docs` baseline and snapshot rows are immutable.
  - Source-change notice trigger (dedupe, copies untouched).
  - `world_branches` / `works` children guards cover both soft and hard delete.
  - A work soft delete tombstones its own branch row.
- **clone_world_branch_timeline(uuid, uuid)**: created only when it does not exist yet. Until 0035 is applied it raises `world_tree_timeline_not_ready`, so confirm fails closed.
- **lib/world-tree/branches.ts**:
  - Each write runs zod validation, then `checkWriteAccess`, then an owner-scoped `getWork` (begin only), and only then the RPC.
  - `branch_ineligible` is returned with the typed `unmetReasons`. `parent_not_visible` gets its own copy; everything else gets "아직 가지 치기 조건을 채우지 못했어요." The result also carries the latest `getBranchEligibility` status, or null if that lookup fails, so a failed lookup is never read as eligible.
  - Diff entries get editor links to `/studio/{draftWorkId}/kb/{nodeId}`.

## Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | — | 465892c | feat(18-02): add 0034 branch RPCs, KB immutability and delete guards |
| 2 | RED | d8aae18 | test(18-02): add failing tests for branch domain functions |
| 2 | GREEN | 9fba0ed | feat(18-02): implement branch domain functions over the 0034 RPCs |

No refactor commit was needed.

## Verification

- RED: `branches.test.ts` failed with "Cannot find package '@/lib/world-tree/branches'".
- `npx vitest run --project unit tests/world-tree/branches.test.ts tests/world-tree/branching-source.test.ts`: 2 files, 58 tests passed.
- `npx vitest run --project unit tests/world-tree`: 9 files, 213 tests passed. The 0032/0033 static suites still pass.
- `npx tsc --noEmit -p .` reports no errors in the world-tree files. eslint is clean on all new files.
- **`branching.database.test.ts` was NOT run.** It is opt-in (`describe.skipIf(!SUPABASE_DB_URL)`, db project). Its race block also requires `WTREE_BRANCH_RACE_SCHEMA_COMMIT=1`, because two sessions need a committed isolated schema, which is dropped in afterAll. The live run belongs to 18-12. The static checks above are not DB proof.

## Deviations from Plan

- **[Rule 2 - Correctness] Confirmed-branch freeze scope.** The plan says a confirmed branch's KB blocks "all INSERT/UPDATE/DELETE". I applied the freeze to the 5 setting categories (files and folders) only. Freezing template and 회차 rows too would stop the new work from organising its chapter folders and templates.
- **[Rule 2 - Correctness] Cross-work move guard.** Changing `kb_nodes.work_id` into or out of a branch work would have bypassed both the baseline mapping and the expand immutability guard. It is now rejected.
- **[Rule 2 - Correctness] Baseline/snapshot immutability trigger.** API roles already had no write grants. I added a trigger anyway so that SECURITY DEFINER code also cannot alter baseline columns, snapshotted rows or delete rows.
- **[Rule 3 - Blocking] Timeline contract placeholder.** 0035 does not exist yet, so 0034 defines `clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid)` only when it is absent, and that placeholder raises `world_tree_timeline_not_ready`. 18-03 must keep this exact signature (`create or replace`). In the DB suite, the isolated schema swaps in a no-op unless the 0035 file exists.
- **Phantom serialisation approach.** I used FOR UPDATE on the parent works row, which blocks FK inserts, instead of SERIALIZABLE plus retry. The plan allows this ("등"), and PostgREST RPCs cannot raise their isolation level from inside the function. This is documented in the migration header.
- **Begin idempotency position.** A begin retry returns the existing draft before the assert runs (after auth and locks). The plan only requires this ordering for confirm. A stale draft is harmless because confirm re-asserts.
- **Read-only diff (decision, not a fix).** `get_world_branch_diff` only requires auth and ownership, not write access, so a suspended writer can still read the diff.

## Gaps / Not proven here

- **The SQL has not been run on Postgres.** No local Postgres is available, and the shared Supabase project must not be used. 18-12 must confirm:
  - plpgsql syntax, including the recursive CTE inside the `for ... loop`, `foreach` over the OLD/NEW work-id array in the trigger, and OLD access in INSERT triggers (needs PG 11+).
  - That the 0023 template guard accepts the catalog seeds when they are inserted from the SECURITY DEFINER begin.
  - That the FK KEY SHARE vs FOR UPDATE lock wait is what serialises the chapter/KB phantom inserts.
- The DB suite also applies 0012 and 0023, unlike the 18-14 suite. Whether the isolated-schema apply of 0001–0009 + 0012 + 0022 + 0023 + 0032–0034 works must be checked in 18-12.
- Migration 0034 has not been applied to any database.
- Out of scope, as planned:
  - 0035 timeline body and `ensure_world_tree` (18-03).
  - Server Actions and notice read (18-07).
  - UI (18-09).
  - WTREE-09.
- Not run, per orchestrator instruction: `graphify update .` and `scripts/graph-link-requirements.py`. STATE.md and ROADMAP.md were not updated either.

## Known Stubs

- `clone_world_branch_timeline` placeholder in 0034 always raises `world_tree_timeline_not_ready`. This is intentional fail-closed behaviour until 18-03 (0035) replaces it, so a real confirm cannot succeed before 0035 is applied.

## Self-Check: PASSED

- FOUND: supabase/migrations/0034_world_tree_branching.sql, tests/world-tree/branching-source.test.ts, tests/world-tree/branching.database.test.ts, lib/world-tree/branches.ts, tests/world-tree/branches.test.ts
- FOUND commits: 465892c, d8aae18, 9fba0ed

---
phase: 18-world-tree
plan: "04"
subsystem: world-tree
tags: [world-tree, reader-visibility, broken-branch, rls, view-count, migration-0036, tdd]
requires: ["18-01", "18-02", "18-03", "18-14"]
provides:
  - "get_world_tree(p_work_id uuid, p_reader_preview boolean default false) -> reader projection | owner/admin full projection | {status:'unavailable'}"
  - "get_world_tree_metric_baseline() -> {maxTotalViews, maxLikeCount, authorViewsExcludedSince}"
  - "mark_branch_notice_read(p_notice_id uuid) -> {notice_id, read_at} (owner writer only)"
  - "world_work_public_meta_visible(uuid): 0033 helper OR existing blind-notice case, used by works/chapters RLS and TOC/viewer RPCs"
  - "increment_chapter_view: signed-in owner skip (auth.uid vs works.owner_id), reader-visible + unblinded only"
  - "lib/world-tree/queries.ts: getWorldTree(supabase,{workId,readerPreview}) / getWorldTreeMetricBaseline(supabase) / WORLD_TREE_QUERY_COPY"
affects: ["18-05", "18-07", "18-09", "18-11", "18-12"]
tech-stack:
  added: []
  patterns:
    - "Visible works first, then a recursive walk up their ancestor paths; non-visible ancestors become 4-field stubs keyed per response"
    - "Internal projection functions (reader / full) with no API grant behind one audience-deciding entry point"
    - "Migration apply time baked once into an immutable cutoff function (guarded DO block)"
    - "Strict zod schemas + whole-response checks (links, focus, header, UUID scan) as the second fail-closed layer"
key-files:
  created:
    - supabase/migrations/0036_world_tree_reader_visibility.sql
    - tests/world-tree/visibility-source.test.ts
    - tests/world-tree/visibility.database.test.ts
    - tests/world-tree/view-count.database.test.ts
    - lib/world-tree/queries.ts
    - tests/world-tree/projection.test.ts
  modified: []
requirements: [WTREE-06, WTREE-07, WTREE-08, WTREE-10]
decisions:
  - "Audience comes from auth.uid() only: owner = works.owner_id with a live profile; admin = admin_users.revoked_at is null with a live profile. A reader preview by anyone else returns unavailable instead of silently serving the reader view."
  - "Public metadata paths (works/chapters RLS, list_chapter_access, get_chapter_access_state) use world_work_public_meta_visible = world_work_reader_visible OR (work-wide blind on a live, non-draft, published work). This keeps the 0009 blind notice/'blinded' contract; body rights (can_view) use world_work_reader_visible alone."
  - "A published work without a world_branches row is projected as a single trunk fruit (n0)."
  - "Stub positionHint = number of ancestors in the response (equal to depth because every ancestor of a kept node is kept). Reader placement order is re-densified among visible placements; concurrency survives only when the real predecessor is visible and adjacent."
  - "Reader header = the requested published work's title. queries.ts accepts any visible work title or '세계수' (the 18-01 fixtures use the visible root title), and rejects everything else."
  - "Author self-view cutoff = first apply time of 0036, stored in world_tree_author_view_cutoff() and returned as authorViewsExcludedSince. Historical view_count values are never touched."
metrics:
  duration: "~35m"
  completed: "2026-10-19"
  tasks: 3
  files: 6
---

# Phase 18 Plan 04: Reader projection, broken-branch stubs and author view exclusion Summary

Migration 0036 adds `get_world_tree`. Owners and active admins get the full tree from the real DB rows. Everyone else gets the reader projection: published works first, then each non-visible ancestor on their paths as an identity-free broken-branch stub. The same migration moves works/chapters public reads and the TOC/viewer/body RPCs onto the 0033 helper, and stops counting a signed-in author's own opens. `lib/world-tree/queries.ts` wraps both reader RPCs with strict validation. Any failure comes back as a typed failure, never as an empty success tree.

## What was built

- **Projection (Task 1)**
  - `get_world_tree` decides the audience from `auth.uid()` and nothing else. The reader preview is honoured only for the owner and admins, and it returns the same DB reader projection.
  - `world_tree_reader_projection` (internal):
    - The entry is decided by the requested work's own `world_work_reader_visible`, so unpublished, draft, deleted, blinded and missing ids all get the same `unavailable`.
    - A private root does not reject the tree; it becomes a stub.
    - Recursive CTE: visible branches first, then their ancestors.
    - Keys are `n0..` and `e0..` in (depth, confirmed_at, id) order.
    - Stubs carry exactly `{nodeType, nodeKey, parentNodeKey, positionHint}`, and their works row is never joined.
    - Eras come only from visible lines (name, year and inherited flag; no source_era_id or memo).
    - Structural checks fail closed: exactly one top node, no dangling parent, and the focus must be a visible node.
  - `world_tree_full_projection` (internal): real ancestry, drafts, isPublished/readerVisible, eras and placements. It never returns setting content.
  - `get_world_tree_metric_baseline`: global maxima over reader-visible works only, plus the cutoff.
  - `mark_branch_notice_read`: `world_tree_require_writer()` and then an ownership-scoped update. It only sets `read_at`.
  - Internal functions have every API role revoked. Every SECURITY DEFINER function uses `search_path = public`.
  - 0036 never creates, replaces, grants or revokes `world_work_reader_visible`.
- **Guards (Task 2)**
  - `works_public_read` / `chapters_public_read` now use `world_work_public_meta_visible`. Only these two policies are replaced; owner_all and the restrictive write policies are untouched.
  - `can_view` additionally requires `world_work_reader_visible(w.id)`.
  - `read_chapter_content` is not redefined; it inherits the rule through `can_view`.
  - `list_chapter_access` / `get_chapter_access_state` hide draft and unpublished works from everyone except their live owner.
  - Purchase and settlement bodies (0008/0009/0017) are not redefined, and neither are entitlements.
  - No parent-state rule exists on any path. A published child of a private parent reads, lists, buys and counts like any other work.
  - `increment_chapter_view`:
    - Keeps the 0008 skip for suspended users.
    - Counts only live, published, unblinded chapters of reader-visible works.
    - Skips the signed-in owner (`w.owner_id <> auth.uid()`). It takes no client user id.
- **Domain wrapper (Task 3)**
  - `getWorldTree`:
    - Validates the uuid input and sends only `{p_work_id, p_reader_preview}`.
    - Takes `mode` from the server's `audience`, and a preview must come back as a reader projection.
    - Uses strict zod schemas for ReaderWorkNode, BrokenBranchStub, eras, placement, metrics and the owner DTO.
    - Then checks the whole response: links stay inside the response with no cycles, the focus is a work node, eras sit on visible work lines, the header is a visible title or "세계수", and no UUID appears anywhere except as a whole visible `workId` value.
    - Runs the 18-01 `parseWorldTreeResponse` as a second gate.
    - Never maps keys back to ids and keeps no cache.
  - `getWorldTreeMetricBaseline` uses a strict schema.

## Commits

| Task | Phase | Commit | Message |
|------|-------|--------|---------|
| 1 | — | 2a6024e | feat(18-04): add 0036 world-tree reader projection, stubs and writer RPCs |
| 2 | — | 19dfe1f | feat(18-04): guard public reads and view counts on the work's own publish state |
| 3 | RED | 26ac04d | test(18-04): add failing tests for strict world-tree query wrapper |
| 3 | GREEN | 06a2c11 | feat(18-04): implement strict world-tree query wrapper |

No refactor commit was needed.

## Verification

- RED: `projection.test.ts` failed with "Cannot find package '@/lib/world-tree/queries'".
- `npx vitest run --project unit tests/world-tree/projection.test.ts tests/world-tree/visibility-source.test.ts`: 95 tests passed (58 + 37).
- `npx vitest run --project unit tests/world-tree`: 13 files, 354 tests passed.
- Related static suites (`tests/admin/blinding`, `user-flows`, `tests/reader/*-migration`): pass.
- `npx tsc --noEmit -p .`: clean across the repo, no errors.
- eslint is clean on all 6 files.
- **`visibility.database.test.ts` and `view-count.database.test.ts` were NOT run.** Both are opt-in (`describe.skipIf(!SUPABASE_DB_URL)`, db project). The live run belongs to 18-12. The static source checks are not RLS/RPC proof.

## Deviations from Plan

- **[Rule 1 - Correctness] Blind contract kept on the metadata paths.** The plan says to swap `works_public_read` / `chapters_public_read` to `world_work_reader_visible`. That helper is false for a work-wide blind, so a direct swap would have turned the existing blind notice and the `blinded` TOC/viewer states (0009 D-11..D-14) into not-found. That contradicts the plan's own rule to keep the existing blind rules. I added `world_work_public_meta_visible`, which is the 0033 helper OR the blind-notice case (live, non-draft, published, blinded). Metadata paths use it. Body rights (`can_view`) and the projection use the 0033 helper alone. The 0033 helper itself is untouched.
- **[Rule 2 - Correctness] Owner path on the TOC/viewer RPCs.** `list_chapter_access` and `get_chapter_access_state` keep returning rows to the work's live owner, which matches the 0009 owner correction path. Without that, the owner's view of their own draft would show every chapter as locked.
- **[Rule 2 - Security] Reader preview by a non-owner/admin** returns `unavailable` rather than the reader view, so the flag cannot be used to probe.
- **Placement same-line rule not enforced client-side.** The 18-01 fixture `readerNormalTree` places the expand work on the root line's era, so queries.ts only requires the placement's era to exist in the response on a visible line.
- Next.js docs were skimmed as required. No route, Server Action or cache code was touched.

## Gaps / Not proven here (gate 18-12)

- **0036 has never run on Postgres or been applied to any database.** 18-12 must confirm:
  - plpgsql syntax, including the recursive CTE, `jsonb_to_recordset` joins and `jsonb_object_agg`.
  - The guarded `DO` block that creates `world_tree_author_view_cutoff()` with `format('%L')`.
  - That RLS calling a SECURITY DEFINER helper does not recurse.
  - Feed/detail performance now that `world_work_public_meta_visible` runs per row in `works_public_read`. The baseline also scans every work.
- **Behaviour change to check in 18-12.** Non-owners can no longer SELECT unpublished works (0 live published chapters) through RLS. This is intended. Run the public-read-rls, view-count and admin blind regression suites together, and look for any page that listed another user's unpublished works.
- **Not covered by the projection.** Plain fruits (`world_era_placements` rows for works that have no `world_branches` row) are not projected as nodes, because the 18-01 types have no node kind for them. Such a work is shown as a single trunk. Follow-up for 18-05/18-11 if plain fruits must appear in the reader tree.
- **Purchase bodies were not changed (as planned).** `create_purchase_order` therefore still has no branch-draft check. A draft's chapter ids are hidden by RLS and by the RPCs above, but the order path itself does not reject them.
- **Anonymous author opens.** A signed-out author's own opens still count, because they cannot be identified. This is not claimed as solved.
- **Unrelated pre-existing failure.** `tests/admin/sanctions.test.ts > charges normally when access holds through generation (control)` fails. It is an AI-generation mock test that does not touch any file from this plan, and it was not fixed here.
- Not run, per orchestrator instruction: `graphify update .`, `scripts/graph-link-requirements.py`, STATE.md and ROADMAP.md updates.

## Known Stubs

None. BrokenBranchStub is the designed rule-23 node type, not a placeholder.

## Self-Check: PASSED

- FOUND: supabase/migrations/0036_world_tree_reader_visibility.sql, tests/world-tree/visibility-source.test.ts, tests/world-tree/visibility.database.test.ts, tests/world-tree/view-count.database.test.ts, lib/world-tree/queries.ts, tests/world-tree/projection.test.ts
- FOUND commits: 2a6024e, 19dfe1f, 26ac04d, 06a2c11

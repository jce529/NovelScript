---
phase: 18-world-tree
plan: "01"
subsystem: world-tree
tags: [world-tree, contracts, schema, rls, draft-isolation]
requires: ["02-08", "03-08"]
provides:
  - "lib/world-tree/types.ts: BranchKind/BranchStatus/BranchDraft/Era/EraPlacement/BranchDiff/WorldTreeProjection/WorldTreeLayout, ReaderWorkNode | BrokenBranchStub union, BranchEligibilitySummary, RPC arg/result types, fail-closed parseWorldTreeResponse"
  - "tests/world-tree/fixtures.ts: Wave 0 fixtures (root/if/expand, private root/middle stubs, consecutive stubs, republish, 3-era timeline, 0/add/modify/delete diff, eligibility short-circuit)"
  - "supabase/migrations/0032_world_tree_schema.sql: world_branches/world_branch_docs/world_eras/world_era_placements/world_branch_notices + works.is_branch_draft + kb_nodes.inherited_from_node_id"
affects: ["18-02", "18-03", "18-04", "18-05", "18-06", "18-07", "18-08", "18-09", "18-10", "18-11", "18-12", "18-13", "18-14"]
tech-stack:
  added: []
  patterns:
    - "Discriminated reader union with field whitelists (READER_WORK_NODE_FIELDS / BROKEN_BRANCH_STUB_FIELDS / READER_FORBIDDEN_FIELDS)"
    - "Response-scoped opaque node keys (n0, n1...) instead of DB UUIDs"
    - "RPC-only writes: SELECT-only grants + restrictive current_user_can_write policies + column guard trigger"
key-files:
  created:
    - lib/world-tree/types.ts
    - tests/world-tree/fixtures.ts
    - tests/world-tree/contracts.test.ts
    - supabase/migrations/0032_world_tree_schema.sql
    - tests/world-tree/schema-source.test.ts
  modified: []
decisions:
  - "Publish state reuses the existing rule (live published chapter >= 1); no second publish flag added"
  - "works.is_branch_draft / kb_nodes.inherited_from_node_id are protected by a BEFORE trigger that rejects anon/authenticated direct changes; SECURITY DEFINER RPCs bypass it via current_user"
  - "fork_era_id FK added by ALTER after world_eras creation to break the create-table cycle"
  - "Eligibility thresholds values are not defined here (owned by 18-13); 18-01 only defines the Summary shape and parent_not_visible short-circuit"
metrics:
  completed: 2026-10-19
  tasks: 2
  files: 5
---

# Phase 18 Plan 01: World-tree data contracts and draft isolation Summary

Typed world-tree contracts (reader stub union with opaque keys, owner DTO, eligibility summary, RPC I/O, fail-closed parser), shared Wave 0 fixtures, and migration 0032 adding the branch/era/placement/doc/notice tables with RPC-only writes and branch-draft hiding in `works_public_read`/`chapters_public_read`.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Interfaces and Wave 0 fixtures (TDD) | c46bd01 (RED), 7595c40 (GREEN) | lib/world-tree/types.ts, tests/world-tree/fixtures.ts, tests/world-tree/contracts.test.ts |
| 2 | 0032 schema and minimal public-policy isolation | 455f4a4 | supabase/migrations/0032_world_tree_schema.sql, tests/world-tree/schema-source.test.ts |

The run was interrupted by an API rate limit after Task 2 was committed. The continuation agent checked that all three commits exist, re-ran verification, and wrote this SUMMARY. No code changes were needed.

## Verification

- `npx vitest run --project unit tests/world-tree/schema-source.test.ts tests/world-tree/contracts.test.ts`: 2 files, 71 tests passed.
- `npx tsc --noEmit -p .`: no errors reported in world-tree files.

## Deviations from Plan

None. The plan was executed as written.

## Gaps / Not Proven Here

- The schema-source test only checks the SQL text: added columns, policy replacement, and the GRANT whitelist. It does not prove RLS behavior at runtime. Migration 0032 has **not** been applied to any database. Live RLS/RPC proof belongs to 18-12.
- Full public RPC blocking and reader projection are completed in 0036 (18-04). The shared visibility helper and eligibility queries come in 0033 (18-14).
- `graphify update .` and `scripts/graph-link-requirements.py` were not run, per orchestrator instruction.

## Known Stubs

None. This plan has no UI-facing code.

## Self-Check: PASSED

- FOUND: lib/world-tree/types.ts, tests/world-tree/fixtures.ts, tests/world-tree/contracts.test.ts, supabase/migrations/0032_world_tree_schema.sql, tests/world-tree/schema-source.test.ts
- FOUND commits: c46bd01, 7595c40, 455f4a4

---
phase: 18-world-tree
plan: "03"
subsystem: world-tree
tags: [world-tree, timeline, eras, placements, inherited-span, migration-0035, tdd]
requires: ["18-01", "18-02", "18-14"]
provides:
  - "ensure_world_tree(uuid) -> {branch_id, root_work_id, created}: trunk + first era (1기) + original placement, idempotent"
  - "clone_world_branch_timeline(uuid, uuid): replaces the 0034 fail-closed placeholder with the SAME signature; internal (no API grant), called inside confirm_world_branch"
  - "save_world_timeline(uuid, jsonb, jsonb) -> {branch_id, eras, placementCount}: auth/owner/write access, inherited span resent exactly, dense orders, first-concurrent/memo/duplicate/fork-era/era-not-empty rules"
  - "Deferrable order exclusion constraints world_eras_live_position_excl / world_era_placements_live_order_excl (replace 0032 partial unique indexes)"
  - "lib/world-tree/timeline.ts: draftFromTimeline/validateTimeline/movePlacement/setConcurrent/addEra/removeEra + saveTimeline/ensureWorldTree + TIMELINE_COPY"
affects: ["18-07", "18-08", "18-04", "18-12"]
tech-stack:
  added: []
  patterns:
    - "Inherited eras/placements are immutable via BEFORE triggers (binds SECURITY DEFINER paths); only clone sets a transaction-local clone flag"
    - "Same lock order as 0034: root work -> parent work -> branch work -> branch row -> plain fruit works (by id)"
    - "One pure movePlacement transition for drag and prev/next/up/down buttons; broken concurrent links are released and reported"
    - "Client-side validation mirrors the RPC but the RPC stays authoritative; success only after a well-formed RPC result matching the sent payload"
key-files:
  created:
    - supabase/migrations/0035_world_tree_timeline.sql
    - tests/world-tree/timeline-source.test.ts
    - tests/world-tree/timeline.database.test.ts
    - lib/world-tree/timeline.ts
    - tests/world-tree/timeline.test.ts
  modified: []
requirements: [WTREE-01, WTREE-02, WTREE-03, WTREE-04]
decisions:
  - "lib/world-tree/timeline.ts has no 'server-only' import: it holds no secret and the 18-08 client editor needs the pure transitions. saveTimeline/ensureWorldTree take the caller's Supabase client and are meant for Server Actions (18-07); the RPCs re-check auth.uid()."
  - "A move releases every concurrentWithPrev link whose previous work changed (including the moved work's own), so a concurrent work never lands first; released work ids are returned for the UI."
  - "Inherited span check compares id, position, trimmed name, normalised year label and memo=null for eras, and the exact (era, work, order, concurrent, relationLabel) set for placements; omission, change or addition all yield inherited_locked."
  - "saveTimeline fails closed (unavailable, retryable) unless the RPC result has exactly {branch_id, eras, placementCount}, the branch id matches, era ids/positions match the sent order and placementCount equals the sent placement count."
  - "Unknown DB errors map to unavailable+retryable; rule tokens (world_timeline_*, world_tree_forbidden, write_access_denied) map to typed non-retryable codes."
metrics:
  duration: "~20m (continuation; Task 1 and Task 2 RED by previous executor)"
  completed: "2026-10-19"
---

# Phase 18 Plan 03: 분기 시점 연표 상속과 독립 배치 저장 Summary

0035 migration with ensure_world_tree / clone_world_branch_timeline / save_world_timeline (inherited-span locks, dense deferrable orders, memo/concurrency rules) plus a pure TypeScript timeline domain (validate, shared button/drag move, concurrency toggle, era add/remove) and fail-closed RPC wrappers.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | 0035 연표 저장·상속 원자 계약 | 8d4c478 | supabase/migrations/0035_world_tree_timeline.sql, tests/world-tree/timeline-source.test.ts, tests/world-tree/timeline.database.test.ts |
| 2 (RED) | 연표 전이·저장 래퍼 실패 테스트 | b8e3521 | tests/world-tree/timeline.test.ts |
| 2 (GREEN) | 연표 도메인 전이·저장 래퍼 구현 | 6b13bd1 | lib/world-tree/timeline.ts |

REFACTOR: not needed (no changes after GREEN).

## Hand-off check (18-02 -> 18-03)

- 0034 defines a fail-closed placeholder `clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid)` (only if absent) and `confirm_world_branch` calls `perform clone_world_branch_timeline(v_branch.id, p_era_id)`.
- 0035 `create or replace function clone_world_branch_timeline(p_branch_id uuid, p_fork_era_id uuid) returns void` uses exactly that signature, with no API grant (verified in 8d4c478).

## Verification

- `npx vitest run --project unit tests/world-tree/timeline.test.ts tests/world-tree/timeline-source.test.ts tests/world-tree/branching-source.test.ts` — 3 files, 82 tests passed.
- `npx vitest run --project unit tests/world-tree` — 11 files, 259 tests passed.
- `npx tsc --noEmit` — clean (repo-wide, no errors).
- `npx eslint lib/world-tree/timeline.ts` — clean.

## Deviations from Plan

None - plan executed as written. (Continuation note: Tasks 1 and 2 RED were committed by the previous executor; this run implemented GREEN only.)

## Gaps / Not proven here (gate 18-12)

- 0035 was not applied to any database; `tests/world-tree/timeline.database.test.ts` (live-DB suite) was written in Task 1 but NOT run. RLS/RPC behaviour, trigger enforcement, deferrable constraint behaviour, lock ordering under concurrency and the confirm -> clone transaction are only statically checked by `timeline-source.test.ts`. Real proof belongs to 18-12.
- No UI uses the module yet (editor 18-08, Server Actions 18-07); the "no success toast before confirmation" rule is enforced only at the wrapper level (message returned after RPC success).
- graphify update / requirement linking were not run in this session (orchestrator instruction).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/world-tree/timeline.ts, supabase/migrations/0035_world_tree_timeline.sql, tests/world-tree/timeline.test.ts, tests/world-tree/timeline-source.test.ts, tests/world-tree/timeline.database.test.ts
- FOUND commits: 8d4c478, b8e3521, 6b13bd1

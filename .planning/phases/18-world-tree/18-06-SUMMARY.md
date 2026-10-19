---
phase: 18-world-tree
plan: "06"
subsystem: world-tree
tags: [world-tree, layout, svg, windowing, broken-branch]
requires: ["18-01"]
provides:
  - "lib/world-tree/layout.ts: buildWorldTreeLayout(projection,{eraWidth,nodeGap}) -> WorldTreeLayoutResult (status ok|fallback|invalid, nodes, SVG path strings, extent, listOrder, nodeColumns); getVisibleEraWindow(layout, viewport, {overscan, selectedKey})"
requirements: [WTREE-01, WTREE-02, WTREE-06]
key-files:
  created:
    - lib/world-tree/layout.ts
    - tests/world-tree/layout.test.ts
    - tests/world-tree/layout-scale.test.ts
  modified: []
decisions:
  - "x = era.position column (past left, latest right); same-named eras on different lines are never merged (columns only follow position)"
  - "Concurrent fruits share the anchor x and alternate above/below on their own lane; first fruit with concurrentWithPrev=true fails closed"
  - "A path from a visible parent starts at the child's inherited-era fork column; a path from a stub starts at the stub (real private fork position is never restored)"
  - "Layout extends WorldTreeLayout with status/columns fields locally in layout.ts rather than editing 18-01 types.ts"
metrics:
  completed: 2026-10-19
  tasks: 2
  files: 3
---

# Phase 18 Plan 06: Chronological world-tree layout Summary

Dependency-free layout: era-column x coordinates, concurrent lanes, broken-branch stubs connected to published children, deterministic ordering, and era-column windowing with a list fallback above 1000 nodes.

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Pure era/branch layout | cf1016e | lib/world-tree/layout.ts, tests/world-tree/layout.test.ts |
| 2 | Windowing and list fallback | 6962b45 | tests/world-tree/layout-scale.test.ts (windowing lives in layout.ts, committed with Task 1) |

## Verification

- `npx vitest run --project unit tests/world-tree/layout.test.ts tests/world-tree/layout-scale.test.ts`: 2 files, 24 tests passed.
- `npx tsc --noEmit -p .`: no errors in world-tree files.

## Deviations from Plan

- **[Process] TDD order:** layout.ts was written before its tests, so no separate RED commit exists; tests were then written and passed on the first run. Windowing (`getVisibleEraWindow`) was implemented in the Task 1 commit together with the layout, and Task 2 only added its scale tests.
- Owner/admin projections are also accepted by `buildWorldTreeLayout` (keyed by workId); the plan only named the reader projection.
- Next.js docs reading was skipped: no Next/route/server code is touched (pure TypeScript).

## Gaps / Not Proven Here

- Real render time (100ms target), scrollIntoView behavior and visual overlap in a browser are for 18-12.
- Lanes are one per unit, so very large trees get tall canvases; no lane reuse/compaction.
- Reader projection carries no explicit fork era, so the fork column is inferred from the child's inherited eras; a child without inherited eras and without placement is drawn one column after its parent.
- `graphify update .` and `graph-link-requirements.py` were not run, per orchestrator instruction.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/world-tree/layout.ts, tests/world-tree/layout.test.ts, tests/world-tree/layout-scale.test.ts

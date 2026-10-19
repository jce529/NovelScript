---
phase: 18-world-tree
plan: "08"
subsystem: world-tree
tags: [timeline, dnd-kit, server-actions, owner-studio]
requires: [18-03, 18-07]
provides:
  - EraBoard desktop timeline editor
  - /studio/[workId]/world/timeline owner page
affects: [18-12]
tech-stack:
  added: []
  patterns: [bound server action as client onSave, shared pure transitions for DnD and buttons]
key-files:
  created:
    - components/world-tree/era-board.tsx
    - app/studio/[workId]/world/timeline/page.tsx
    - tests/world-tree/timeline-entry.test.ts
  modified: []
decisions:
  - branchId query is validated against the world's owner tree, then that branch's work is loaded owner-scoped; save is bound to that work.
  - EraBoard is re-keyed on the canonical draft so router.refresh() replaces local state with the server state.
requirements: [WTREE-01, WTREE-02, WTREE-06]
metrics:
  completed: 2026-10-19
  tasks: 2
---

# Phase 18 Plan 08: Timeline editor Summary

Desktop era-board editor wired to session-derived `saveWorldTimelineAction`: DnD and the prev/next/up/down buttons share `movePlacement`, inherited eras are locked, independent branch eras carry the memo input.

## Commits
- 2f5be50 feat(18-08): EraBoard
- b9b2e41 feat(18-08): timeline page + tests

## Tests
- `npx vitest run --project unit tests/world-tree/timeline-entry.test.ts tests/world-tree/timeline.test.ts`: 35 passed.
- `tsc --noEmit`: no errors in this plan's files.

## Deviations from Plan
None to behavior. Task 2 RED was observed (page import failed) but the test and implementation were committed together.

## Known Stubs / Gaps
- When the work has no world tree yet the page shows a text notice only; nothing on this page calls `ensureWorldTreeAction` (the entry that starts the tree is 18-09/18-11 territory).
- Browser verification not done (gate 18-12): real pointer/keyboard DnD, focus retention after a move, toast display, sticky move bar layout, tab navigation.
- EraBoard save-failure behavior is checked by a source-order test, not a rendered test (no DOM test infra).
- graphify update not run (per instruction).

## Self-Check: PASSED

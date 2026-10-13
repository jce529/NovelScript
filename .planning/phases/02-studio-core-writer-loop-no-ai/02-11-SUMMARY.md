---
phase: 02-studio-core-writer-loop-no-ai
plan: "11"
subsystem: studio-ui
tags: [studio, panels, save-status, reducer, gap-closure]
requires: []
provides:
  - "lib/studio/editor-state.ts: pure save-status reducer (saved/dirty/saving/failed)"
  - "lib/studio/panel-controller.ts: pure left/right collapse controller and slot descriptors"
  - "components/studio/studio-panel-shell.tsx: StudioPanelProvider, StudioSidebar, StudioEditorPanels, useStudioPanels"
  - "components/studio/save-status-chip.tsx: SaveStatusChip"
affects: [02-10, 02-12, 02-13, phase-16-mobile-adapter]
tech-stack:
  added: []
  patterns: ["pure controller + thin React adapter", "collapse via visibility only, fixed child positions"]
key-files:
  created:
    - lib/studio/editor-state.ts
    - lib/studio/panel-controller.ts
    - components/studio/studio-panel-shell.tsx
    - components/studio/save-status-chip.tsx
    - tests/studio/editor-state.test.ts
    - tests/studio/studio-panel-shell.test.ts
  modified:
    - app/studio/[workId]/layout.tsx
key-decisions:
  - "Provider shares only collapse state and resourceKey/hasAi metadata; editor/AI nodes render in each page's own tree so collapse never remounts them."
  - "Save status 'saving' exists only while a save request id is pending; edit after failure keeps 저장 실패 until a new save starts."
  - "Chip copy lives in editor-state.ts so it is testable in the node vitest environment."
requirements-completed: [KB-02, CONT-01, CONT-03]
duration: 20min
completed: 2026-10-13
---

# Phase 2 Plan 11: Shared panel collapse and save-status components Summary

Pure save-state reducer and panel controller, with a React shell (provider, collapsible sidebar, editor/AI slots) and a save-status chip; layout now mounts the provider and wraps the existing sidebar.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1. Save-state and panel contracts | 866aa63 | editor-state reducer + 9 tests |
| 2. Shell slots and chip | 035e1f8 | panel-controller, shell, chip, layout wiring, 11 tests |

## Verification actually run

- `npx vitest run --project unit tests/studio/editor-state.test.ts tests/studio/studio-panel-shell.test.ts`: 20/20 pass.
- `npx tsc --noEmit`: only error is the pre-existing `app/layout.tsx(22,50) Cannot find name 'LayoutProps'` (Next typegen types not generated in this worktree); no errors from the new files.
- Not run: real DB and browser checks. Real React mount count, cursor/selection retention, AI message and in-flight request retention across collapse are 02-13 browser gate items. The static source checks in the shell test are not a mount-count proof.

## Deviations from Plan

- [Rule 3 - Blocking] The worktree had no `node_modules` and did not contain the 02-07..13 plan files (uncommitted in the main checkout). Linked `node_modules` (git-ignored) to the main checkout and read the plan from there. No tracked files were affected.
- The RED-then-GREEN commit split of TDD was collapsed: the reducer and its tests were written together and committed once per task.
- Docs under `node_modules/next/dist/docs` (layouts-and-pages) were consulted; no Next API beyond plain client components and layout children was used.

## Notes for follow-up plans

- `StudioEditorPanels` is exported but no page uses it yet; 02-12 wires pages to it (and `SaveStatusChip`).
- Phase 16 can consume `mobileNavigation` / `activeSurface` from `useStudioPanels` (contract only, no tab UI here).
- Collapse is active at `lg` and up; below that the existing vertical/mobile layout is unchanged.

## Known Stubs

None.

## Self-Check: PASSED

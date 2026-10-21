---
phase: 16-studio-workflow-upload
plan: "01"
subsystem: studio-ui
tags: [studio, mobile, tabs, gap-closure]
requires: ["02-11"]
provides:
  - "components/studio/workspace/mobile-pane-state.ts: studioPaneReducer, getPanePresentation, isSameDocumentActivation"
  - "components/studio/workspace/mobile-tabs.tsx: StudioWorkspace, StudioMobileNavigation, useStudioWorkspace"
  - "components/studio/workspace/StudioPane.tsx: always-mounted pane with max-lg visibility and inert"
affects: [16-02, 16-03]
key-files:
  created:
    - components/studio/workspace/mobile-pane-state.ts
    - components/studio/workspace/mobile-tabs.tsx
    - components/studio/workspace/StudioPane.tsx
    - tests/studio/mobile-pane-state.test.ts
    - tests/studio/mobile-workspace.test.ts
requirements-completed: [STUDIO-04]
completed: 2026-10-17
---

# Phase 16 Plan 01: Mobile studio tabs shell Summary

Client-only mobile tab layer (tree / write / ai) with a pure reducer, a bottom nav, and an always-mounted StudioPane. It touches no Phase 2 shell, page, layout or AiPanel file, and adds no dependency or DB change.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1. Pane state and visibility contract | e402e62 | reducer, presentation helper and click-activation predicate; 23 tests |
| 2. Provider, nav, pane adapter | 21c6e39 | 3 components; 5 SSR tests |

## Verification actually run

- `npx vitest run --project unit tests/studio/mobile-pane-state.test.ts tests/studio/mobile-workspace.test.ts tests/studio/client-bundle-fs-free.test.ts`: 28/28 pass.
- `tsc --noEmit` and eslint on the new files: no errors.
- Not run: browser or real-device checks. Real mount preservation across tab switches, focus handoff, matchMedia subscription at 1023/1024px, and the same-document click handler are covered only by pure-function and SSR checks. They are deferred to the 16-03 browser/UAT checkpoint.

## Decisions

- `inert`/`aria-hidden` apply only when `isMobile`. The SSR and hydration snapshot is desktop, so no pane starts inert, and mobile state is set after hydration through `useSyncExternalStore`.
- Inactive panes use only `max-lg:absolute inset-0 invisible pointer-events-none`, which keeps layout, scroll and selection.
- `StudioPane` also takes an optional `notice` slot (AI pane guidance on pages without a document).
- A same-document tree click is detected in `StudioPane` (tree pane `onClick`) via the pure `isSameDocumentActivation`. It never calls preventDefault.

## Deviations from Plan

- [Minor] `StudioWorkspace` also exposes `notifyInsert()` and `pathname` in `useStudioWorkspace`. 16-02 needs both for the insert path and for the tree click check.
- [Minor] Tests wrap `StudioPane` as `ComponentType<Record<string, unknown>>` because of a `createElement` children typing/lint conflict.
- Task 1 and Task 2 are split into separate commits, but the RED step was only run (and confirmed failing) for Task 1. Task 2 tests were written together with the implementation.

## Gaps for 16-02 / 16-03

- Nothing is wired into the real routes yet. 16-02 must place `StudioWorkspace` and `StudioMobileNavigation` in the layout (via the 02-11 `mobileNavigation` slot), wrap tree/editor/ai with `StudioPane`, and call `notifyInsert()` on the successful insert path.
- The adapter does not sync `StudioPanelProvider.activeSurface`. 02-11 only provides the contract, and no consumer exists yet.
- The stage height (`calc(100dvh - 3.5rem)` minus the nav) is not set here and belongs to the 16-02 wiring.
- STUDIO-04 scope conflict (account and AI settings pages) is unchanged and recorded for 16-03, per the plan's Open Decisions.

## Known Stubs

None.

## Self-Check: PASSED

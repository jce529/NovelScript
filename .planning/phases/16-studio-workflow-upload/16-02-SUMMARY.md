---
phase: 16-studio-workflow-upload
plan: "02"
subsystem: studio-ui
tags: [studio, mobile, tabs, gap-closure, wiring]
requires: ["16-01", "02-10", "02-11", "02-12"]
provides:
  - "layout/pages wired to StudioWorkspace, StudioStage, StudioPane, StudioMobileNavigation"
  - "AST wiring guard and SSR/pure-state integration tests"
affects: [16-03]
key-files:
  created:
    - components/studio/workspace/StudioStage.tsx
    - tests/studio/mobile-workspace-wiring.test.ts
    - tests/studio/mobile-workspace-integration.test.ts
  modified:
    - app/studio/[workId]/layout.tsx
    - app/studio/[workId]/chapters/[chapterId]/page.tsx
    - app/studio/[workId]/kb/[nodeId]/page.tsx
    - components/studio/workspace/StudioPane.tsx
requirements-completed: [STUDIO-02, STUDIO-04]
completed: 2026-10-19
---

# Phase 16 Plan 02: Mobile wiring into the studio shell Summary

The legacy mobile `<details>` is gone. The layout now wraps the studio in `StudioWorkspace`. Below lg, `StudioStage`, a tree pane and a bottom nav provide the three tabs. At lg and above, the Phase 2 `StudioSidebar` is unchanged. Both editor pages put the editor and toolbar in the write pane and `AiPanel` in the ai pane, and call `notifyInsert()` when an insert is accepted.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1. Wire mobile slots + AST guard | see `git log` (feat(16-02)) | layout, 2 pages, StudioStage, StudioPane `domId`; 10 guard tests, including negative fixtures |
| 2. Integration contract tests | see `git log` (test(16-02)) | 6 tests: SSR composition with the real `StudioPanelProvider`/`StudioEditorPanels`, reducer transitions, desktop inert/aria clearing |

## Verification actually run

- vitest unit: mobile-pane-state, mobile-workspace, wiring, integration, client-bundle-fs-free, upload-classify, studio-panel-shell, kb-editor-state, chapter-editor-state and editor-state. All pass (89 tests).
- eslint (max-warnings=0) is clean on the touched route files, the workspace components and the new tests. A tsc run filtered to studio paths shows no errors.
- Not run: the live-DB suites and browsers or real devices. The `graphify` step was skipped on instruction.

## Deviations from Plan

- [Rule 3] `StudioPane` (a 16-01 file) gained an optional `domId` prop (default true). The toolbar and editor are both write-pane content, and the id `studio-pane-write` must stay unique for the nav's aria-controls.
- [Rule 3] Added `StudioStage.tsx`, which was not in the plan's file list. It keeps `{children}` at a fixed position, hides it on the tree tab, and shows an AI guidance pane on pages without an AI panel.
- The nav is rendered directly in the layout via `StudioMobileNavigation`. The 02-11 `mobileNavigation` context slot is not used, because it has no consumer.
- The sidebar is passed once to `StudioSidebar` (desktop). The same `sidebar` element is also rendered in the mobile tree pane (`lg:hidden`). The guard enforces a single `StudioSidebar` and a single tree pane. The two KbTree scopes are untouched, so the tree DOM exists twice, with one copy hidden per breakpoint. Stage height and scroll are not browser-verified.

## Gaps for 16-03 (UAT)

- Browser or real-device checks are still needed for mount preservation across tabs, scroll and cursor retention, in-flight AI response retention, the 1023/1024px boundary, and same-document tree-click return to write.
- The duplicated sidebar markup (desktop and mobile tree pane) should be checked for duplicate ids and focus order.
- `activeSurface` in `StudioPanelProvider` is not synced (no consumer).
- The STUDIO-04 wording conflict (account and AI settings pages) is still open for 16-03.
- Out-of-scope, uncommitted changes from other plans in the shared checkout were not touched.

## Known Stubs

None.

## Self-Check: PASSED

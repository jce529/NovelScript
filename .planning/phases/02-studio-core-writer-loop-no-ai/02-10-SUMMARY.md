---
phase: 02-studio-core-writer-loop-no-ai
plan: "10"
subsystem: studio-sidebar
tags: [sidebar, templates, context-menu, long-press, collapsible-tree]
gap_closure: true
requirements: [KB-02]
dependency_graph:
  requires: [02-09 dialogs, 02-11 StudioPanelProvider/StudioSidebar]
  provides:
    - partitionStudioSidebar(workTree, accountTree)
    - createNodeMenuController / menuActionsFor / toggleCollapsed / folderPresentation
    - KbNodeMenu, KbTemplateSection, TemplateSidebarEntry
  affects: [02-13 browser gate]
key_files:
  created:
    - lib/kb/sidebar-sections.ts
    - lib/kb/kb-node-menu-controller.ts
    - components/studio/kb-node-menu.tsx
    - components/studio/template-sidebar-entry.tsx
    - tests/kb/sidebar-sections.test.ts
    - tests/kb/kb-node-menu.test.ts
  modified:
    - app/studio/[workId]/layout.tsx
    - components/studio/kb-tree.tsx
    - tests/kb/template-tree-ui.test.ts
decisions:
  - "Defaults are deduped by category across scopes; the work copy wins, account is the fallback."
  - "Template category folders are flattened for display only (grouped, collapsible) - DB tree is untouched."
  - "KbNodeMenu imports the existing 02-09 dialogs directly and owns its own dialog state, so kb-node-dialogs.tsx (not in this plan's files) is unchanged."
  - "Menu popup is a small fixed-position role=menu, not the base-ui dropdown, because it must open at a pointer point."
metrics:
  tasks: 2
  completed: 2026-10-13
---

# Phase 02 Plan 10: Template section, collapsible tree, context menu and long press Summary

The studio sidebar now shows 새 문서 (템플릿에서) / 템플릿 만들기, a 기본 템플릿 (5) plus 내 템플릿 section, 내 폴더, 계정 공유 폴더 and 회차, all derived from the existing trees. File rows open one shared menu via right-click, 500ms touch long press, or Shift+F10 / ContextMenu.

## Commits

| Task | Commit | Content |
|------|--------|---------|
| 1 | 0bbb442 | sidebar-sections.ts, template-sidebar-entry.tsx, layout wiring, sidebar-sections tests |
| 2 | 31ce0da | kb-node-menu-controller.ts, kb-node-menu.tsx, kb-tree.tsx (menu, toggles, KbTemplateSection), tests |

## Verification (actually run)

| Command | Result |
|---------|--------|
| `npx vitest run --project unit tests/kb tests/studio` | 18 files, 236 passed |
| `npx tsc --noEmit` | no errors outside pre-existing untracked `tests/payments/*` |

Controller tests use fake timers: 499ms pointerup does not open and allows navigation; 500ms opens once and blocks one click; pointercancel, scroll, >8px move and dispose before 500ms never open; keyboard open/Escape close; folder toggle flips visibility and aria-expanded together.

## Deviations from Plan

**1. [Process] No separate RED commits.** Tests were written with the implementation.

**2. [Rule 3] Existing test adjusted.** `template-tree-ui.test.ts` mocks `useEffect` to run effects; the new row menu registers window listeners, so that test now sets `skipEffects` (real server rendering never runs effects).

**3. Docs.** The Next.js docs named in the plan were not newly consulted in depth; no new server actions or Next APIs were introduced (layout stays a server component passing serializable props to client components).

## Pending gates (02-13, not verified here)

- No browser/DB run. Real DOM behaviour is unverified: dialog opening from the entry button and menu items, focus return after Escape/outside click, click-block after long press on a real touch device, the menu popup position/clipping, `hidden` collapse visuals.
- Source-level wiring only is asserted for layout/entry/menu (string checks plus the pure controller).
- Mobile `<details>` fallback kept; Phase 16 bottom-tab adapter not implemented (by plan).
- Chapter leaves have no menu (by plan). Folder rows keep the existing icon buttons; the menu covers file rows only.

## Known Stubs

None.

## Self-Check: PASSED

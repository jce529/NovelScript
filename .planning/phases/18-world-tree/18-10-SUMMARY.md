---
phase: 18-world-tree
plan: "10"
subsystem: world-tree
tags: [world-tree, svg, ui, mobile, list-view, broken-branch]
requires: ["18-05", "18-06", "18-07"]
provides:
  - "components/world-tree/world-tree-view.tsx: WorldTreeView({projection,metricResult,mode,onRetry,onReaderPreview,studioLinks})"
  - "components/world-tree/world-tree-canvas.tsx: WorldTreeCanvas({layout,entries,selectedKey,onSelect})"
  - "components/world-tree/world-tree-list.tsx: WorldTreeList (keyboard/list alternative sharing selection)"
  - "components/world-tree/world-tree-detail.tsx: WorldTreeDetail + buildWorldTreeEntries shared entry model"
requirements: [WTREE-06, WTREE-07, WTREE-08]
key-files:
  created:
    - components/world-tree/world-tree-canvas.tsx
    - components/world-tree/world-tree-list.tsx
    - components/world-tree/world-tree-detail.tsx
    - components/world-tree/world-tree-view.tsx
    - components/world-tree/world-tree.module.css
    - tests/world-tree/view.test.ts
  modified: []
decisions:
  - "Mobile detail is a persistent, non-modal bottom panel (sticky, min-height max(220px, 100dvh - canvas - chrome)), not the modal Sheet: UI-SPEC requires it to be always visible without covering the canvas. Focus moves to its title on user selection (mobile only)."
  - "Stroke/proximity: the projection has no fork baseline document count, so branchProximity uses the eligibility minimum (WORLD_TREE_ELIGIBILITY.minSettingDocuments) as baseline and the detail labels the value as an estimate."
  - "Reader surfaces fail closed: an owner/admin projection passed with mode='reader' (or during preview) renders the error state, never the data."
  - "Owner unpublished chip is a single '미발행' (projection only has readerVisible, so published-then-private vs never-published ('비공개' vs '초안') cannot be told apart)."
metrics:
  completed: 2026-10-19
  tasks: 2
  files: 6
---

# Phase 18 Plan 10: SVG world tree, detail, mobile and list view Summary

One SVG plus native 44px buttons on the 18-06 layout coordinates, a shared selection feeding a 340px detail panel (desktop) or a bottom panel (mobile), a list alternative, and loading/error/empty/single-fruit/fallback/preview states, all driven by the reader or owner projection.

## What was built

- **world-tree-detail.tsx**
  - `buildWorldTreeEntries(projection, scores)` normalizes reader (nodeKey) and owner (workId) projections into one entry model with kind, era, concurrent flag, real placement relation label (owner only, never invented), depth, visible descendants, proximity estimate, stroke (`strokeForNode`) and fruit diameter (`fruitDiameter`).
  - A stub entry has `title/kind/workId/score = null`, fixed 2px stroke and 44px size, so no component can render a name, id, link or metric for it.
  - `WorldTreeDetail`: fruit (kind chip, era, branch, popularity "점 (임시 지수)", publish state, work link), branch section (proximity/diff/stroke/snapshot chip + notice), trunk counts, stub generic copy only, owner-only `연표 편집` / `이 세계관에서 가지 치기` links.
- **world-tree-canvas.tsx**: windowed via `getVisibleEraWindow` (selected node always rendered), era scale labels, `aria-label` = name+kind+era, stub button `aria-label="비공개된 본작 자리"` with `?` aria-hidden and `부러진 가지` label above, broken path dashed, clicking a path selects its child, scrolls the selected node into view on selection change.
- **world-tree-list.tsx**: `ol` in `layout.listOrder` (never windowed), same selection, per-row work link, stub is one line, `원래 본작이 있었던 자리예요.` before a child of a stub, no parent id/name in the DOM.
- **world-tree-view.tsx**: title/help/legend/`산식은 임시안` chip/metric note (cutoff date and limitations) copy, tree/list toggle (forced list when layout is `fallback`), skeleton, error+retry, `아직 발행된 작품이 없어요.`, `아직 갈라진 가지가 없어요`, metric-failure note, owner `작가 보기/독자 보기` toggle that calls `onReaderPreview` (the 18-07 server action projection), clears selection on each switch and shows `독자에게 어떻게 보이는지 확인해요.`.
- **world-tree.module.css**: scoped light/dark tokens (`--tree-*`, 8 fruit colors, broken `#78716c` / dark `#a8a29e`), accent 3px selection, 44px node buttons, mobile 340px scroll area and bottom panel, no scale transform, `globals.css` untouched.

## Commits

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1 | 7890c88 | world-tree-canvas.tsx, world-tree-list.tsx, world-tree.module.css |
| 2 | 6007c81 | world-tree-detail.tsx, world-tree-view.tsx, tests/world-tree/view.test.ts |

Note: Task 1's canvas/list import constants from `world-tree-detail.tsx` (Task 2), so the Task 1 commit alone does not type-check; the pair does.

## Verification

- `npx vitest run --project unit tests/world-tree/view.test.ts`: 14 passed (SSR markup: states, one SVG and 3 work buttons with width >= 44px, stub privacy (no title/id/work link), list note/stub rows, owner-only actions, reader fail-closed on owner projection, republished restore).
- `npx tsc --noEmit`: no errors in the 18-10 files (other plans' in-flight files, e.g. branch-flow test, are not mine).
- `npx eslint` on the four components and the test: clean.
- Next docs read: 05-server-and-client-components. No route, params or revalidation touched; the components are presentational.

## Deviations from Plan

- **[Decision] Bottom detail is not the modal `Sheet`.** See decisions. `components/ui/sheet.tsx` is unused.
- **[Rule 2] Reader fail-closed** for mismatched audience (not in plan text, required by the "no client filtering of owner data" rule).
- Task commit order: no RED commit; component tests were written after the components (UI work, SSR tests).

## Gaps / Not proven here (gate 18-12, browser)

- 100ms render target for 300/1000 nodes, `scrollIntoView`/`scrollTo` behavior, ResizeObserver windowing while scrolling.
- Real 44px hit areas and overlap (fruits near each other at nodeGap 64), stub 34px visual with 44px hit on mobile.
- Mobile bottom panel height (`--wt-chrome` is a fixed 220px estimate to tune with the real page header), sticky behavior, focus move to the panel title.
- Keyboard flow (Tab/Enter) and dark-mode contrast of the `--tree-*` colors.
- Not wired to a page: no route renders `WorldTreeView` yet (18-11 injects it; `onReaderPreview`/`studioLinks`/data loading are the caller's job). Popularity scores must be keyed by reader nodeKey / owner workId.
- Proximity is an estimate (baseline = eligibility minimum), and "published-then-private vs draft" owner chips are one chip (see decisions).
- `graphify update .`, `graph-link-requirements.py`, STATE.md and ROADMAP.md were not touched, per orchestrator instruction.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: the five component/CSS files and tests/world-tree/view.test.ts
- FOUND commits: 7890c88, 6007c81

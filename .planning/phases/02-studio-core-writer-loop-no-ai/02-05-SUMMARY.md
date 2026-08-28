---
phase: 02-studio-core-writer-loop-no-ai
plan: 05
subsystem: ui
tags: [nextjs-app-router, base-ui, shadcn, kb-tree, server-actions]

# Dependency graph
requires:
  - phase: 02-studio-core-writer-loop-no-ai
    provides: "lib/kb/tree.ts (FlatKbNode/TreeNode/buildTree), lib/kb/actions.ts (getKbTree/listTemplateOptions/createNode/renameNode/deleteNode/saveNodeContent), lib/works/actions.ts (getWork), shadcn UI toolkit"
provides:
  - "Work-scoped IDE-style tree sidebar UI wiring KB-01/KB-02 business logic to actual screens"
  - "D-14 pinned 회차 nav link kept visible alongside the KB tree at all times"
  - "D-10 create-time template picker Select surfacing every available template (work/account/canonical)"
  - "D-12 single-textarea KB document editor with real content hydration and save"
affects: [02-06, chapters-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "base-ui/react Tooltip and Select components use a `render` prop (accepting a ReactElement to merge props onto) instead of Radix's `asChild` — this project's Next.js/base-ui version has no asChild support"
    - "Select's onValueChange signature is (value: string | null, eventDetails) => void, not (value: string) => void — always null-coalesce before writing into non-nullable string state"

key-files:
  created:
    - components/studio/kb-tree.tsx
    - components/studio/chapters-nav-link.tsx
    - components/studio/kb-node-dialogs.tsx
    - app/studio/[workId]/layout.tsx
    - app/studio/[workId]/page.tsx
    - app/studio/[workId]/kb/[nodeId]/page.tsx
    - app/studio/[workId]/kb/[nodeId]/actions.ts
  modified: []

key-decisions:
  - "Replaced every planned Radix-style `<TooltipTrigger asChild><button/></TooltipTrigger>` with base-ui's `<TooltipTrigger render={<button/>} />` pattern, matching how components/ui/select.tsx already uses `render` for its Icon subcomponent"
  - "Select's onValueChange handler wraps the nullable value with `?? 'canonical'` before writing to selectedTemplateId state, since base-ui's Select allows a null value where Radix's did not"

patterns-established:
  - "KbTree's renderRowActions render-prop lets kb-tree.tsx stay decoupled from kb-node-dialogs.tsx while still rendering per-row actions — reusable pattern for future tree-like UIs (e.g. chapters list)"

requirements-completed: [KB-01, KB-02]

duration: 5min
completed: 2026-08-28
---

# Phase 02 Plan 05: KB Tree Sidebar + Document Editor + Template Picker Summary

**IDE-style KB tree sidebar with pinned 회차 nav link, create/rename/delete dialogs (D-10 template picker), and a single-textarea document editor — wiring Plan 02-03's tested business logic into actual screens under `/studio/[workId]`**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-28T14:00:36+09:00
- **Completed:** 2026-08-28T14:05:05+09:00
- **Tasks:** 2
- **Files modified:** 7 (all created)

## Accomplishments
- A writer opening `/studio/[workId]` now sees a recursive tree sidebar (fixed 6 folders + account template root) plus a pinned, always-visible `회차` nav link that survives navigation into any KB document (D-14)
- Create/rename/delete flows are wired end-to-end through thin `'use server'` wrappers around Plan 02-03's `createNode`/`renameNode`/`deleteNode`, with locked folders visibly (Lock icon + tooltip) and functionally (hidden rename/delete buttons) protected
- `CreateNodeDialog` fetches `listTemplateOptionsAction` on open and renders a `Select` of every available template (work-level, account-level, canonical), defaulting to the `isDefault`-flagged option per D-10, and forwards the writer's explicit choice as `templateOverrideContent`
- `/studio/[workId]/kb/[nodeId]` hydrates the document's real current content on mount into a single textarea (D-12) and saves via `saveNodeContentAction`

## Task Commits

Each task was committed atomically:

1. **Task 1: Tree sidebar component + pinned chapters nav link + work-scoped layout + work home page** - `eaa5639` (feat)
2. **Task 2: Create/Rename/Delete dialogs (D-10 template picker) + tree wiring + KB document editor** - `242e5c1` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/studio/kb-tree.tsx` - Recursive client tree rendering `TreeNode[]`, per-row `renderRowActions` slot, locked-folder Lock icon with tooltip/aria-label, account/work template scope badges
- `components/studio/chapters-nav-link.tsx` - Pinned sidebar link to `/studio/[workId]/chapters`, synthetic UI element (D-14), not a `kb_nodes` row
- `components/studio/kb-node-dialogs.tsx` - `KbTreeActions` dropdown, `CreateNodeDialog` (D-10 Select), `RenameNodeDialog`, `DeleteNodeDialog`, all UI-SPEC-exact Korean copy
- `app/studio/[workId]/layout.tsx` - Work-scoped shell: loads work, KB tree, and pinned chapters nav link for every nested page
- `app/studio/[workId]/page.tsx` - Work home page rendering title/synopsis and a secondary 회차 link
- `app/studio/[workId]/kb/[nodeId]/page.tsx` - D-12 single-textarea document editor
- `app/studio/[workId]/kb/[nodeId]/actions.ts` - Thin server-action wrappers: `getNodeContentAction`, `saveNodeContentAction`, `listTemplateOptionsAction`, `createNodeAction`, `renameNodeAction`, `deleteNodeAction`

## Decisions Made
- Used base-ui's `render` prop instead of the plan's literal `asChild` code sample wherever `TooltipTrigger` wrapped a custom element — this repo's Next.js/base-ui version (per `AGENTS.md`'s "not the Next.js you know" warning) doesn't support Radix's `asChild` API; `components/ui/select.tsx` already established the `render`-prop convention for its own subcomponents, so this plan followed that existing pattern rather than introducing a new one.
- `Select`'s `onValueChange` receives `string | null`; wrapped with `?? 'canonical'` before writing to `selectedTemplateId` state (which is typed `string`) to satisfy base-ui's nullable-value contract without changing the component's external behavior.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Radix-style `asChild` prop usage that doesn't exist in this repo's base-ui-backed Tooltip/Select**
- **Found during:** Task 2 (`npx tsc --noEmit` full-repo check)
- **Issue:** The plan's literal code samples used `<TooltipTrigger asChild><button>...</button></TooltipTrigger>` (Radix convention). This project's `components/ui/tooltip.tsx` and `select.tsx` are built on `@base-ui/react`, whose `Trigger`/`Icon` components don't accept `asChild` — they accept a `render` prop taking a `ReactElement` to merge props onto instead. `tsc` reported `Property 'asChild' does not exist on type 'IntrinsicAttributes & Props<unknown>'` in both `kb-tree.tsx` (Lock icon tooltip) and `kb-node-dialogs.tsx` (`IconButton`'s tooltip).
- **Fix:** Replaced `<TooltipTrigger asChild><Element/></TooltipTrigger>` with `<TooltipTrigger render={<Element/>} />` in both files, matching the `render`-prop convention already used by `components/ui/select.tsx`'s own `Icon`/`ItemIndicator` subcomponents.
- **Files modified:** `components/studio/kb-tree.tsx`, `components/studio/kb-node-dialogs.tsx`
- **Verification:** `npx tsc --noEmit` — both errors resolved
- **Committed in:** `242e5c1` (Task 2 commit)

**2. [Rule 1 - Bug] Fixed Select's `onValueChange` type mismatch (nullable value)**
- **Found during:** Task 2 (`npx tsc --noEmit` full-repo check)
- **Issue:** base-ui's `Select.Root` `onValueChange` signature is `(value: string | null, eventDetails) => void`, but the plan's code passed the raw `setSelectedTemplateId` (typed `Dispatch<SetStateAction<string>>`) directly, which can't accept `null`.
- **Fix:** Wrapped with an inline handler: `onValueChange={(value) => setSelectedTemplateId(value ?? 'canonical')}`.
- **Files modified:** `components/studio/kb-node-dialogs.tsx`
- **Verification:** `npx tsc --noEmit` — error resolved
- **Committed in:** `242e5c1` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs caused by the plan's literal code samples targeting a different, Radix-based component API than what this repo actually has installed)
**Impact on plan:** Both fixes were required for the plan's own acceptance criteria (`npx tsc --noEmit` reports zero errors across the whole repo) to pass. No scope creep — no other files touched, no behavior changed beyond making the tooltip/select props type-correct against the actual installed API.

## Issues Encountered
- `npx tsc --noEmit` reports one pre-existing, unrelated error in `app/layout.tsx` (`Cannot find name 'LayoutProps'`) — confirmed via `git log`/`git diff` that this file was untouched by this plan (last touched by the initial `create-next-app` scaffold commit `191bd39`). Out of scope per the deviation rules' scope boundary; not fixed.
- `npx vitest run tests/kb/ tests/works/` fails 6 of 7 test files with `Error: supabaseUrl is required.` — these are integration tests requiring `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env vars pointing at a live Supabase instance, which aren't configured in this execution environment. This plan added no new tests and didn't touch `tests/helpers/db.ts` or any env config; pre-existing environment limitation, not a regression from this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- KB-01 and KB-02 are fully realized end-to-end in the UI: tree browsing, create/rename/delete, D-10 template selection, D-12 single-textarea editing, and D-14 pinned chapters navigation all work through real Server Actions wired to Plan 02-03's tested business logic.
- Manual QA (tree create/rename/delete, KB doc create-from-template including a non-default pick, locked-folder visual cues, pinned 회차 nav link) is deferred to the phase-gate per 02-VALIDATION.md's Manual-Only Verifications — not part of this plan's automated tasks.
- Plan 02-06 (chapters UI, wave 2) can now safely assume `/studio/[workId]` renders a working sidebar shell to nest its own pages under.

---
*Phase: 02-studio-core-writer-loop-no-ai*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 7 created files confirmed present on disk; both task commits (`eaa5639`, `242e5c1`) confirmed present in git log.

---
phase: 02-studio-core-writer-loop-no-ai
plan: 06
subsystem: ui
tags: [nextjs, dnd-kit, shadcn, react-server-actions, supabase]

# Dependency graph
requires:
  - phase: 02-studio-core-writer-loop-no-ai
    provides: "lib/chapters/actions.ts (createChapter/saveChapterContent/publishChapter/unpublishChapter/reorderChapters/listChapters) from Plan 02-04"
provides:
  - "/studio/[workId]/chapters — chapter list with dnd-kit drag-reorder"
  - "/studio/[workId]/chapters/new — new-chapter draft form"
  - "/studio/[workId]/chapters/[chapterId] — chapter editor with publish/unpublish controls"
affects: [phase-02-validation, phase-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thin 'use server' action wrappers colocated per-route, delegating to lib/*/actions.ts business logic"
    - "Client pages use useTransition + toast (sonner) for save/publish/unpublish feedback instead of full page reload"
    - "dnd-kit sortable list: optimistic local reorder via arrayMove, persisted via server action, no rollback UI on failure (acceptable per plan scope)"

key-files:
  created:
    - "components/studio/chapter-list.tsx"
    - "app/studio/[workId]/chapters/page.tsx"
    - "app/studio/[workId]/chapters/actions.ts"
    - "app/studio/[workId]/chapters/new/page.tsx"
    - "app/studio/[workId]/chapters/new/actions.ts"
    - "app/studio/[workId]/chapters/[chapterId]/page.tsx"
    - "app/studio/[workId]/chapters/[chapterId]/actions.ts"
  modified: []

key-decisions:
  - "Followed plan's exact code verbatim (glue-code plan, no new business logic) — no architectural deviations"

patterns-established:
  - "Non-destructive confirmation dialogs use variant=\"outline\" on both dialog buttons, reserving variant=\"destructive\" exclusively for irreversible/content-loss actions"

requirements-completed: [CONT-01, CONT-02, CONT-03]

# Metrics
duration: 12min
completed: 2026-08-28
---

# Phase 02 Plan 06: Chapter List, Draft Form & Publish Editor Summary

**Wired Plan 02-04's tested chapter business logic into a dnd-kit drag-reorderable chapter list, a shadcn-based new-chapter form, and a chapter editor with a free/4-tier-price publish toggle and non-destructive unpublish confirmation.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-28T05:00:00Z
- **Completed:** 2026-08-28T05:12:00Z
- **Tasks:** 2 completed
- **Files modified:** 7 created

## Accomplishments
- Chapter list at `/studio/[workId]/chapters` renders `ChapterList` (dnd-kit `DndContext`/`useSortable`), 44px-tall touch-safe rows, drag-to-reorder persisted via `reorderChaptersAction`
- New-chapter form at `/studio/[workId]/chapters/new` built entirely from shadcn `Input`/`Label`/`Button`, calls `submitCreateChapter` and redirects into the new chapter's editor
- Chapter editor at `/studio/[workId]/chapters/[chapterId]` provides a plain textarea (D-19), a free/paid toggle via shadcn `Button`, a 4-fixed-tier price `Select` (D-20), edit-while-published support (D-21), and an unpublish confirmation dialog styled with `variant="outline"` on both buttons — never `destructive` (D-22)

## Task Commits

Each task was committed atomically:

1. **Task 1: Chapter list with drag-reorder + new-chapter form (shadcn components)** - `2986f12` (feat)
2. **Task 2: Chapter editor + publish/unpublish controls (shadcn components)** - `cc0133e` (feat)

**Plan metadata:** (this commit, following SUMMARY/STATE/ROADMAP update)

## Files Created/Modified
- `components/studio/chapter-list.tsx` - dnd-kit sortable chapter list, drag-reorder calling `reorderChaptersAction`
- `app/studio/[workId]/chapters/page.tsx` - chapter list page, empty-state copy, renders `ChapterList`
- `app/studio/[workId]/chapters/actions.ts` - `reorderChaptersAction` (thin wrapper around `reorderChapters`)
- `app/studio/[workId]/chapters/new/page.tsx` - new-chapter draft form (shadcn `Input`/`Label`/`Button`)
- `app/studio/[workId]/chapters/new/actions.ts` - `submitCreateChapter` (thin wrapper around `createChapter`)
- `app/studio/[workId]/chapters/[chapterId]/page.tsx` - chapter editor: textarea, free/paid toggle, price `Select`, publish/unpublish + confirm dialog
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` - `getChapterAction`/`saveChapterContentAction`/`publishChapterAction`/`unpublishChapterAction` (thin wrappers, ownership-scoped via authed user)

## Decisions Made
None - followed plan as specified. This was a glue-code plan (no `tdd="true"`, no new business logic) wiring Plan 02-04's already-tested `lib/chapters/actions.ts` functions into UI built strictly from shadcn primitives per UI-SPEC's component contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` reports one pre-existing, out-of-scope error (`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`), already logged in `deferred-items.md` from Plans 02-02/02-03 (root scaffold issue, unrelated to any file this plan touches). No new errors introduced by this plan's 7 files.
- `app/studio/[workId]/layout.tsx` and `app/studio/[workId]/page.tsx` (owned by the parallel Plan 02-05) did not exist yet at execution time in this worktree; this plan's routes are self-contained under `chapters/` and do not depend on those files being present to typecheck or to be internally consistent.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
CONT-01, CONT-02, CONT-03 fully realized end-to-end in the UI: a writer can draft, reorder, publish (free or fixed-price via shadcn Select), edit while published, and unpublish chapters. Manual QA (drag-and-drop feel, full draft-to-publish-to-unpublish walkthrough) is deferred to the phase-gate per 02-VALIDATION.md's Manual-Only Verifications — not a task in this plan. Phase 02's Wave 2 (02-05 + 02-06) completes the writer-loop-no-ai phase once both parallel plans merge.

---
*Phase: 02-studio-core-writer-loop-no-ai*
*Completed: 2026-08-28*

## Self-Check: PASSED

All 7 created files confirmed present on disk. Both task commits (`2986f12`, `cc0133e`) confirmed present in `git log`.

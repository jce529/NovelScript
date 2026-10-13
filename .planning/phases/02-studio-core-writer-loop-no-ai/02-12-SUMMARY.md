---
phase: 02-studio-core-writer-loop-no-ai
plan: "12"
subsystem: studio-editors
tags: [kb-editor, chapter-editor, readonly-template, save-chip, panel-shell, gap-closure]
requires: [02-09, 02-11]
provides:
  - "KB editor page: mode-driven readOnly, template toolbar, save chip, shared panel shell"
  - "Chapter editor page: shared panel shell, save chip, separate save vs publish pending"
  - "lib/studio/editor-session.ts: performSave / applyEdit / spliceAtSelection guards"
affects: [02-13, phase-16]
key-files:
  created:
    - lib/studio/editor-session.ts
    - tests/studio/kb-editor-state.test.ts
    - tests/studio/chapter-editor-state.test.ts
  modified:
    - app/studio/[workId]/kb/[nodeId]/page.tsx
    - app/studio/[workId]/chapters/[chapterId]/page.tsx
key-decisions:
  - "Load result is stored with its resourceKey and treated as not loaded when the key differs, so node/chapter switches need no synchronous reset effect."
  - "All body changes (typing, AI insert, mention replace) go through one edit event; read-only drops them."
  - "Save guard logic lives in lib/studio/editor-session.ts so it runs in the node test environment with mocked actions."
requirements-completed: [KB-01, CONT-01, CONT-03]
completed: 2026-10-13
---

# Phase 2 Plan 12: Editor pages wired to read-only mode, panels and save chip Summary

KB and chapter editor pages now share the 02-11 desktop panel shell and a reducer-backed save chip; the locked default template is read-only with no AI context, AI panel or save.

## Tasks

| Task | Commit | Result |
|------|--------|--------|
| 1. KB editor | f44ae71 | readOnly default template, TemplateEditorToolbar, chip, workId passed to getNodeContentAction, load error screen |
| 2. Chapter editor | def9574 | StudioEditorPanels slots, chip, save pending separate from publish pending, stale chapter guards |

## Behavior

- KB: `default_template` -> readOnly textarea, no `getNodeAiContextAction` call, no AiPanel/MentionAutocomplete, save button disabled, chip "읽기 전용". `user_template` and `document` edit/save/AI as before, chip reflects saved/dirty/saving/failed.
- Save records the submitted snapshot at click; typing or AI insert during a save stays dirty; failure keeps the body and shows toast + chip.
- Node/chapter switch: effect `cancelled` flag drops late loads; reducer drops late save answers (resourceKey/requestId mismatch).
- Chapter: publish/unpublish keep existing actions, price tiers (10/30/50/100), review panel and unpublish confirm; their pending flag is a separate transition and never feeds the chip. Late publish answers for a previous chapter are ignored.
- Collapse: pages never read collapse state; editor/AI render through fixed `StudioEditorPanels` slots, `AiPanel key` preserved.

## Verification actually run

- `npx vitest run --project unit tests/studio/kb-editor-state.test.ts tests/kb/template-dialogs.test.ts tests/studio/editor-state.test.ts`: 3 files, 40 passed.
- `npx vitest run --project unit tests/studio/chapter-editor-state.test.ts tests/studio/studio-panel-shell.test.ts tests/studio/editor-state.test.ts`: 3 files, 28 passed.
- `npx vitest run --project unit tests/studio tests/kb`: 220 passed, 1 failed (`tests/kb/template-tree-ui.test.ts`, `window is not defined` in `components/studio/kb-node-menu.tsx` - plan 02-10's concurrent work, not touched by this plan).
- `npx tsc --noEmit`: only the 3 pre-existing untracked `tests/payments/*` TS2307 errors. eslint on the changed files: clean.

## Not verified (02-13 gate)

No live DB or browser. Real mount counts, textarea selection/cursor, AI conversation and in-flight request retention across collapse, real DOM readOnly behavior, and Next dev rendering of both pages were not exercised. Collapse tests are controller-level plus static source checks only.

## Deviations from Plan

1. [Rule 3] Added `lib/studio/editor-session.ts` (not in files_modified) so the save/edit guards can be executed by node-environment tests; no jsdom is available. No other phase's file touched.
2. TDD RED commits skipped; implementation and tests were written together.
3. Chapter load failure (`getChapterAction` null) now shows an error message instead of an empty editor.
4. Pre-existing `getNodeContentAction` workId arg is now passed, enabling the work-membership check from 02-09.

## Known Stubs

None.

## Self-Check: PASSED

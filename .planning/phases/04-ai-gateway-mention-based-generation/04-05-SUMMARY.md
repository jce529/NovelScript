---
phase: 04-ai-gateway-mention-based-generation
plan: 05
subsystem: ui
tags: [react, nextjs, base-ui, shadcn, gemini, ai-panel]

# Dependency graph
requires:
  - phase: 04-ai-gateway-mention-based-generation (04-04)
    provides: estimateCostAction/generateAction Server Actions + AiGenerationInput contract
provides:
  - "AiPanel.tsx: fixed right-side AI panel with model-tier/genre/AI-지시-프리셋/문체-프리셋 header controls, mentioned-doc chip list, debounced live cost estimate, generate button"
  - "GenerationPreview.tsx: D-10rev Claude-Code-style permission-prompt card (accept/regenerate/reject + free-text regeneration feedback)"
affects: [04-06 (chapter editor page wiring), phase-4-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Controlled, self-contained AI panel component — mention state owned by caller (page.tsx), panel owns its own model/genre/preset/style/preview state"
    - "Debounced (500ms setTimeout in useEffect) live cost-estimate pattern for expensive Server Action calls triggered by frequently-changing local state"

key-files:
  created:
    - "app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx"
    - "app/studio/[workId]/chapters/[chapterId]/ai-panel/GenerationPreview.tsx"
  modified: []

key-decisions:
  - "Wrapped genre Select's onValueChange in a null-coalescing callback (value ?? GENRES[0]) instead of passing the state setter directly — base-ui Select's onValueChange signature accepts string | null, incompatible with a string-only setState, matching this codebase's existing Select-wrapping convention (page.tsx price-tier select)"

patterns-established:
  - "Permission-prompt card pattern (bordered card, header question, numbered option rows with a single accent-bordered default option, free-text fallback row) — reusable for any future accept/reject/regenerate flow in this codebase"

requirements-completed: [EDIT-02, EDIT-03, EDIT-04, EDIT-05]

# Metrics
duration: 12min
completed: 2026-08-30
---

# Phase 4 Plan 05: AI Panel (header controls + generation preview) Summary

**Self-contained, controlled AiPanel component (model-tier/genre/AI-지시-프리셋/문체-프리셋 controls, mention chips, debounced cost estimate, generate flow) plus a Claude-Code-style D-10rev accept/regenerate/reject permission-prompt card, both wired directly to Plan 04-04's estimateCostAction/generateAction Server Actions.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-30T06:24:00Z (approx, worktree sync preceded task work)
- **Completed:** 2026-08-30T06:36:01Z
- **Tasks:** 3
- **Files modified:** 2 created

## Accomplishments
- `AiPanel.tsx`: fixed 384px-wide (`w-96`) right-side panel with the D-05rev single-row header (AI 모델/장르 selects + AI-지시-프리셋 gear-icon dropdown), a separate 문체 프리셋 (D-15) select, and a conditional 자유형 custom-instruction textarea
- Mentioned-document chip list (D-03) with empty-state hint, removable via per-chip ✕ button
- Debounced (500ms) live token-cost estimate (D-12/EDIT-05) calling `estimateCostAction` on every relevant input change
- Generate button + full accept/regenerate/reject flow via `GenerationPreview`, wired to `generateAction`, including the D-13 balance-exhausted toast + inline banner path
- `GenerationPreview.tsx`: D-10rev permission-prompt card with exact copy contract strings and accent color reserved solely for the "본문에 삽입하기" option

## Task Commits

Each task was committed atomically:

1. **Task 1: AiPanel prop contract + header controls** - `1b36bdc` (feat)
2. **Task 2: GenerationPreview — the D-10rev permission-prompt card** - `d8efa2b` (feat)
3. **Task 3: Wire mentioned-doc chips, debounced cost estimate, generate button, and the preview into AiPanel** - `538189b` (feat)

**Plan metadata:** (this commit) `docs(04-05): complete AI panel plan`

## Files Created/Modified
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` - The fixed right-side AI panel: header controls, mention chips, cost estimate, generate button, GenerationPreview integration
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/GenerationPreview.tsx` - The D-10rev permission-prompt card

## Decisions Made
- Genre `Select`'s `onValueChange` wrapped in `(value) => setGenre(value ?? GENRES[0])` rather than passed directly as the plan's literal code showed (`onValueChange={setGenre}`), because base-ui's `Select.Root` `onValueChange` signature is `(value: string | null, eventDetails) => void`, which is not assignable to a `Dispatch<SetStateAction<string>>`. This exactly follows the wrap-in-callback convention already established in `app/studio/[workId]/chapters/[chapterId]/page.tsx`'s price-tier select.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed genre Select onValueChange type mismatch**
- **Found during:** Task 1
- **Issue:** The plan's literal code (`onValueChange={setGenre}`) fails `npx tsc --noEmit` because base-ui's `Select` `onValueChange` passes `string | null`, incompatible with `Dispatch<SetStateAction<string>>`.
- **Fix:** Wrapped in a callback with null-coalescing fallback: `onValueChange={(value) => setGenre(value ?? GENRES[0])}`.
- **Files modified:** `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx`
- **Verification:** `npx tsc --noEmit` clean (excluding the pre-existing, unrelated `app/layout.tsx` error).
- **Committed in:** `1b36bdc` (Task 1 commit)

**2. [Rule 1 - Bug/lint] Removed two ESLint warnings surfaced by the plan's own code**
- **Found during:** Task 3 (running `npx eslint` on both new files before committing)
- **Issue:** (a) An `eslint-disable-next-line react-hooks/exhaustive-deps` comment inside the debounce `useEffect`'s `setTimeout` callback flagged as "unused eslint-disable directive" (no violation was actually present at that line). (b) `GenerationPreview.tsx` imported `Button` from `@/components/ui/button` but never used it — the card uses plain `<button>` elements per the plan's own code.
- **Fix:** Removed the unused disable comment (line-level, not the one guarding the `useEffect` dependency array itself, which is still needed and kept) and removed the unused `Button` import.
- **Files modified:** `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx`, `app/studio/[workId]/chapters/[chapterId]/ai-panel/GenerationPreview.tsx`
- **Verification:** `npx eslint` on both files reports 0 problems; `npx tsc --noEmit` still clean.
- **Committed in:** `538189b` (Task 3 commit, since Task 2's file needed the same follow-up fix and both were verified together before any commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bug/lint fixes)
**Impact on plan:** Both fixes are mechanical type/lint corrections with no behavioral or visual change from the plan's intent. No scope creep.

## Issues Encountered
- **Worktree was initially missing this phase's planning docs and `04-05-PLAN.md` entirely** (still on the pre-Phase-4 commit `d6c1a84`). Per the task's documented fallback: confirmed working tree was clean, then ran `git merge master --ff-only`, which fast-forwarded to `68430f3` and brought in all of Phase 3/4's planning docs, code, and prior plan commits. No conflicts, no data loss.
- **`.env.local` was missing from the fresh worktree** (gitignored, not part of the merge). Copied from the main checkout (`C:\Users\chang\novelscript-mvp\.env.local`) per the task's documented fallback, so `npm test`'s Supabase-backed tests could run.
- **`npm test` full suite does not exit 0** — 8 failures, all in `tests/discovery/feed.test.ts` (`listFeed (READ-01)` "popular" sort cases). Confirmed via `git log`/prior `deferred-items.md` entry that this is the exact same pre-existing failure already documented and investigated during Plan 04-04 (unrelated Phase 3 `lib/discovery/actions.ts` code, reproduces identically with none of this plan's changes present). This plan's own two new files (`AiPanel.tsx`, `GenerationPreview.tsx`) are UI-only, touch none of `lib/discovery`/`lib/ai`, and add no new tests per this plan's own verification note ("UI-only, no dedicated test framework for React components in this codebase per prior phases' precedent"). Re-logged in `deferred-items.md` for continuity.

## Known Stubs

None — `AiPanel`/`GenerationPreview` are fully wired to Plan 04-04's real `estimateCostAction`/`generateAction` Server Actions with no hardcoded/mock data paths. The panel's `mentionedNodes`/`onRemoveMention`/`onInsertText`/`content`/`defaultGenre` props are intentionally left for Plan 04-06 to supply from the chapter editor page — this is the plan's own documented "controlled component" design (see plan Objective), not a stub: `AiPanel` cannot render mention state itself because caret-based mention detection lives in the textarea, which is Plan 04-06's scope by design.

## User Setup Required

None - no external service configuration required (Plan 04-01 already covers `GEMINI_API_KEY`).

## Next Phase Readiness
- `AiPanel`/`GenerationPreview` are ready for Plan 04-06 to import and drop into `app/studio/[workId]/chapters/[chapterId]/page.tsx` alongside the existing chapter `<Textarea>`, passing `mentionedNodes`/`onRemoveMention`/`onInsertText`/`content`/`defaultGenre` from that page's own state and Plan 04-02's mention-search/quick-add wiring.
- No blockers for Plan 04-06.

---
*Phase: 04-ai-gateway-mention-based-generation*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx`
- FOUND: `app/studio/[workId]/chapters/[chapterId]/ai-panel/GenerationPreview.tsx`
- FOUND: `.planning/phases/04-ai-gateway-mention-based-generation/04-05-SUMMARY.md`
- FOUND commit: `1b36bdc`
- FOUND commit: `d8efa2b`
- FOUND commit: `538189b`

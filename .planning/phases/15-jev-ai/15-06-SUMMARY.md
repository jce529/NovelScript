---
phase: 15-jev-ai
plan: 06
subsystem: [ai, api, ui, testing, knowledge-base]
tags: [zod, vitest, supabase, paid-generation, document-save, nextjs]

# Dependency graph
requires:
  - phase: 15-04
    provides: AI document proposal and response parsing contract
  - phase: 15-07
    provides: Category folder candidates and quick-add dialog patterns
  - phase: 15-10
    provides: Paid generation lifecycle, prompt composition, and document contract validation
provides:
  - Atomic document saving with folder and template revalidation
  - Paid-lifecycle document regeneration with selected folder and template
  - Save confirmation and regeneration UI in the AI panel
affects: [15-09, AIDOC-02, AIDOC-03]

# Tech tracking
tech-stack:
  added: []
  patterns: [single-insert initialContent, stable regeneration idempotency key, request-keyed cancellable modal loading]

key-files:
  created:
    - lib/ai/document-regenerate.ts
    - lib/kb/folder-copy.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
    - tests/ai/save-validation.test.ts
    - tests/ai/regenerate-document.test.ts
  modified:
    - lib/kb/actions.ts
    - app/studio/[workId]/chapters/[chapterId]/actions.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx

key-decisions:
  - "Persist proposal content through createNode(initialContent) so one insert creates a complete document."
  - "Run regeneration through preflightPaidGeneration and settlePaidGeneration, retaining one idempotency key across retries."
  - "Move folder copy to a client-safe module so the confirmation modal can render revalidation errors."

patterns-established:
  - "Save actions authenticate, validate input, revalidate destination folder and template, then insert once."
  - "Modal recommendation values stay immutable while selected values are controlled independently."

requirements-completed: [AIDOC-02, AIDOC-03]

# Metrics
duration: 12m
completed: 2026-09-27
---

# Phase 15 Plan 06 Summary

**Document proposals now require destination confirmation, save atomically, and regenerate through the paid-generation lifecycle when the template changes.**

## Performance

- **Duration:** 12 minutes
- **Started:** 2026-09-27T08:31:00Z
- **Completed:** 2026-09-27T08:43:28Z
- **Tasks:** 3
- **Files modified:** 13 including graphify outputs

## Accomplishments

- Added folder and template revalidation, size-limited Zod inputs, recommendation loading, and one-insert document creation.
- Added template regeneration with write-access checks, idempotency, wallet settlement, refusal handling, selected-folder prompt context, and document-contract validation.
- Added the save confirmation and regeneration dialogs and connected them to AiPanel.
- Added 9 save-validation tests and 9 regeneration tests.

## Task Commits

1. **Task 1: Atomic saving and revalidation** — 커밋 미완료 — 메인 세션에서 커밋 예정
2. **Task 2: Paid-lifecycle template regeneration** — 커밋 미완료 — 메인 세션에서 커밋 예정
3. **Task 3: Save confirmation modal and AiPanel wiring** — 커밋 미완료 — 메인 세션에서 커밋 예정

Git could not create `.git/index.lock` (`Permission denied`); commit attempts were not retried.

## Files Created/Modified

- `lib/kb/actions.ts` — added `initialContent` insert support and template membership validation.
- `lib/kb/folder-copy.ts` — exposed shared folder messages to client components.
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` — added recommendation loading, revalidated atomic save, and regeneration action.
- `lib/ai/document-regenerate.ts` — added paid lifecycle regeneration and output contract checks.
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx` — added location/template review and regeneration confirmation UI.
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` — replaced immediate save with the modal flow.
- `tests/ai/save-validation.test.ts` — covers 9 save and atomic insert behaviors.
- `tests/ai/regenerate-document.test.ts` — covers 9 lifecycle, validation, and output behaviors.
- `graphify-out/` — refreshed the project graph after code changes.

## Decisions Made

- Followed the live `parseChatResponse` export from `lib/ai/chat-parse.ts`, re-exported by `lib/ai/chat.ts`.
- Kept the original folder-copy wording while moving it to a client-safe module.
- Used a canonical-template sentinel in the Select control; no empty string is used as a template value.

## Deviations from Plan

### Auto-fixed Issues

**1. Client-safe folder message import**
- **Found during:** Task 3
- **Issue:** The modal needed folder validation messages, while `lib/kb/actions.ts` also contains server data operations.
- **Fix:** Extracted the copy constants to `lib/kb/folder-copy.ts` and re-exported them from the existing module.
- **Files modified:** `lib/kb/actions.ts`, `lib/kb/folder-copy.ts`, `SaveDocumentPlanModal.tsx`
- **Verification:** Targeted ESLint and TypeScript checks passed.

**2. Modal loading state lint rule**
- **Found during:** Task 3 verification
- **Issue:** Setting loading state synchronously inside the request effect triggered the React lint rule.
- **Fix:** Derived loading from the current request key and stored state only when the async result arrives.
- **Files modified:** `SaveDocumentPlanModal.tsx`
- **Verification:** Targeted ESLint and TypeScript checks passed.

---

**Total deviations:** 2 auto-fixed
**Impact on plan:** Both changes preserve the planned behavior and keep the client/server boundary clear.

## Issues Encountered

- `npx tsc --noEmit` passed.
- Targeted ESLint for changed source and test files passed.
- `npm run lint` remains failing on existing repository issues, including effect-state updates in `MentionAutocomplete.tsx` and `QuickAddDialog.tsx`, `any` types, `prefer-const`, and existing script lint errors. No errors were reported for the changed files after fixes.
- Full `tests/ai` run: 340 passed, 26 skipped. Three existing integration test files could not create Supabase users because the environment returned `AuthRetryableFetchError: fetch failed`.
- The new focused save and regeneration suites each passed 9/9.
- `graphify update .` completed successfully.
- `git diff --check` passed.

## User Setup Required

None.

## Next Phase Readiness

- The save and regeneration flow is implemented. Browser verification remains for Plan 15-09 as specified by the plan.
- Git changes are uncommitted because the sandbox denied `.git` index writes.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*

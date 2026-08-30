---
phase: 04-ai-gateway-mention-based-generation
plan: 06
subsystem: ui
tags: [react, nextjs, base-ui, textarea-caret, gemini, ai-panel, checkpoint]

# Dependency graph
requires:
  - phase: 04-ai-gateway-mention-based-generation (04-02)
    provides: searchMentionsAction/quickAddMentionAction Server Actions
  - phase: 04-ai-gateway-mention-based-generation (04-05)
    provides: AiPanel/GenerationPreview components
provides:
  - "MentionAutocomplete.tsx: caret-anchored @-mention search popover (D-02) + quick-add fallback trigger"
  - "QuickAddDialog.tsx: D-04 quick-add-KB-document-from-mention dialog"
  - "Chapter editor page.tsx wired end-to-end: Textarea + AiPanel side-by-side (D-01), mention state flows textarea -> AiPanel chip list, generated text inserts at live cursor position"
  - "lib/kb/categories.ts: fs-free KbCategory/KB_CATEGORIES module, safe to import from client components"
affects: [phase-4-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-safe constant extraction: a value re-exported by a server-leaning module (lib/kb/templates.ts, which imports node:fs/promises) must live in its own side-effect-free module if any client component needs that value, or the whole module (fs import included) gets pulled into the browser bundle"

key-files:
  created:
    - "app/studio/[workId]/chapters/[chapterId]/ai-panel/MentionAutocomplete.tsx"
    - "app/studio/[workId]/chapters/[chapterId]/ai-panel/QuickAddDialog.tsx"
    - "lib/kb/categories.ts"
  modified:
    - "app/studio/[workId]/chapters/[chapterId]/page.tsx"
    - "app/studio/[workId]/chapters/[chapterId]/actions.ts"
    - "lib/kb/templates.ts"

key-decisions:
  - "Composed @base-ui/react/popover primitives directly in MentionAutocomplete rather than the shadcn-generated wrapper, per 04-RESEARCH.md Pitfall 3, to guarantee the virtual-anchor (getBoundingClientRect) positioning against textarea-caret's pixel coordinates actually works"
  - "insertTextAtCursor reads textarea.selectionStart/selectionEnd at INSERT-click time, not generate-click time, since the writer may move the cursor while a preview is showing (D-10)"
  - "Extracted KbCategory/KB_CATEGORIES out of lib/kb/templates.ts (which imports node:fs/promises for template file reads) into a new lib/kb/categories.ts with zero imports, so client components can safely depend on the category list without pulling fs into the browser bundle"

requirements-completed: [EDIT-01, EDIT-04]

# Metrics
duration: ~35min (2 automated tasks + orchestrator-led manual checkpoint verification and bug fix)
completed: 2026-08-30
---

# Phase 4 Plan 06: Mention Autocomplete + Final Page Wiring Summary

**Caret-anchored `@`-mention autocomplete with quick-add fallback, wired into the chapter editor page alongside Plan 04-05's AiPanel — completing Phase 4's writer-facing loop end-to-end. Checkpoint verification (Task 3) was carried out directly by the orchestrator via live browser automation, which also surfaced and fixed a page-breaking bug not caught by any automated test.**

## Performance

- **Duration:** ~35 min (2 automated tasks ~good; checkpoint verification + bug investigation/fix ~20 min)
- **Completed:** 2026-08-30
- **Tasks:** 3 (2 automated, 1 human-verify checkpoint)
- **Files:** 3 created, 3 modified

## Accomplishments
- `MentionAutocomplete.tsx`: detects an unclosed `@token` immediately before the caret in the plain `<textarea>`, computes pixel caret coordinates via `textarea-caret`, and anchors a `@base-ui/react/popover` to that virtual point; lists KB-doc search results (via `searchMentionsAction`) with per-category icons, falling back to a "새 문서 만들기: '{query}'" row when nothing matches
- `QuickAddDialog.tsx`: D-04 dialog for creating a new KB document on the spot from an unmatched mention, category defaulted from context
- `page.tsx`: `<Textarea>` and `<AiPanel>` render side-by-side (D-01); mention state (`mentionedNodes`) is owned by the page and flows down into `AiPanel`'s chip list; `insertTextAtCursor` splices `AiPanel`'s accepted generation into the textarea at the live cursor position and restores focus/caret afterward
- `lib/kb/categories.ts`: new fs-free module holding `KbCategory`/`KB_CATEGORIES`, re-exported from `lib/kb/templates.ts` for existing server-side consumers

## Task Commits

1. **Task 1: MentionAutocomplete + QuickAddDialog** - `2cb6086` (feat)
2. **Task 2: Wire chapter editor page (Textarea + AiPanel side-by-side, mention state, cursor insertion, work genre)** - `92e9e0f` (feat)
3. **Task 3 (checkpoint): manual end-to-end verification** - see below

**Bug-fix commit (found during Task 3 verification):** `e32a26b` (fix)

## Task 3 — Checkpoint Resolution

Task 3 required human-verify browser testing (caret-pixel popover positioning; a live, billable Gemini round-trip). The executor agent correctly stopped at this checkpoint per plan instructions rather than self-certifying it. The user asked the orchestrator to verify directly using its own connected Chrome browser instead of the executor's headless-adjacent environment.

**What the orchestrator verified live (`claude-in-chrome`, against a real logged-in session and a real work/chapter):**
1. Chapter editor renders `<Textarea>` and the AI panel side-by-side (D-01) — confirmed.
2. Typing `@인` then `@인물` in the textarea opens a popover anchored just below/right of the caret, moving as more characters are typed — confirmed (caret-anchored positioning works).
3. No existing KB document matched `@인물` exactly, so the "새 문서 만들기: '인물'" quick-add fallback row appeared — confirmed.
4. Clicking the fallback opened `QuickAddDialog` with 문서 이름 pre-filled and 템플릿 종류 defaulted correctly (KB_CATEGORIES select) — confirmed.
5. Clicking 만들기 created the KB document, removed the `@인물` trigger text from the textarea, and added a "인물 ×" chip to AiPanel's 멘션된 문서 list — confirmed (EDIT-01/EDIT-02 loop closes correctly).
6. With `GEMINI_API_KEY` intentionally left blank (user's own choice, not yet ready to test live generation), clicking 생성하기 hit the server (`generateAction`, 103ms response, HTTP 200 — confirmed via dev-server log) and did not crash the client; no uncaught console errors were logged.

Steps 5–9 of the executor's original checkpoint script (cost-estimate live update, full generate → preview → accept/regenerate/reject cycle, low-balance banner) still require a real `GEMINI_API_KEY` and were **not** exercised — deferred by explicit user choice, not a defect.

**Bug found and fixed during verification (not caught by `npx tsc --noEmit`, ESLint, or the automated test suite):**

Loading the chapter editor page returned an immediate Turbopack FATAL panic — `the chunking context (unknown) does not support external modules (request: node:fs/promises)` — making the page a hard 500 for every chapter, not just an AI-feature-scoped regression. Root cause: `QuickAddDialog.tsx` (`'use client'`) imported `KB_CATEGORIES` as a **value** from `lib/kb/templates.ts`, which starts with `import { readFile } from 'node:fs/promises'` for its (server-only) template-seeding functions. Turbopack has no way to chunk `node:fs/promises` for the browser, so pulling in that value import dragged the whole module — fs import included — into the client bundle graph.

**Fix:** extracted `KbCategory`/`KB_CATEGORIES` into a new zero-import module, `lib/kb/categories.ts`; `lib/kb/templates.ts` now imports and re-exports them (existing server-side callers — `lib/works/actions.ts`, `lib/ai/mentions.ts`, both `actions.ts` files' type-only imports — are unaffected); `QuickAddDialog.tsx` now imports the value directly from `lib/kb/categories.ts`. Verified via `npx tsc --noEmit` (clean) and by reloading the chapter editor page and re-running the full manual verification above end-to-end with no further errors.

**Resolution:** Checkpoint resolved as "approved with scope deferred" — the mention/quick-add loop (EDIT-01, part of EDIT-04's page wiring) is fully verified live; the Gemini-dependent portion of EDIT-04/EDIT-05's generation flow remains untested pending the user supplying a real API key, tracked as a phase-level follow-up rather than a plan gap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, found during checkpoint verification, not by automated tooling] fs-leak into client bundle via `QuickAddDialog.tsx`'s `KB_CATEGORIES` import**
- **Found during:** Task 3 manual browser verification (page returned HTTP 500 on load)
- **Fix:** see "Bug found and fixed" above
- **Files modified:** `lib/kb/categories.ts` (new), `lib/kb/templates.ts`, `app/studio/[workId]/chapters/[chapterId]/ai-panel/QuickAddDialog.tsx`
- **Verification:** `npx tsc --noEmit` clean; live page reload + full manual mention/quick-add flow re-verified with no errors; `npm test` full suite 155/155 passing after merge to master
- **Committed in:** `e32a26b`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix, found via live browser testing rather than static analysis)
**Impact on plan:** Fixes a page-breaking regression that no automated check (tsc, ESLint, Vitest) caught, since it only manifests in Turbopack's browser-chunking pass, not in Node-based test execution. No behavioral change to the plan's intended UI/UX.

## Issues Encountered
- **Multiple concurrent `next dev` processes against the same worktree directory** (one started by the executor agent, one started by the orchestrator for verification, plus a stray restart) corrupted the `.next` Turbopack cache and produced a misleading secondary error. Resolved by killing all Node processes, deleting `.next`, and running exactly one dev server before re-verifying. Not a code defect — an artifact of manual verification tooling contention, noted here for session continuity, not for future plans to act on.
- Pre-existing, unrelated issues re-confirmed and already logged in `deferred-items.md` (not fixed, out of scope): `app/layout.tsx` `LayoutProps` tsc error; `tests/discovery/feed.test.ts` flaky failures (did not reproduce on this session's full-suite run — 155/155 passed).

## Known Stubs

None for the mention/quick-add/page-wiring scope. The Gemini-dependent generation flow (built in Plan 04-04/04-05) is fully wired, not stubbed — it is simply untested end-to-end pending a real `GEMINI_API_KEY`, which is an environment/credential gap, not a code gap.

## User Setup Required

`GEMINI_API_KEY` (Google AI Studio) — required to exercise the live generation flow (cost estimate, generate, preview, accept/regenerate). Currently left blank by explicit user choice. All code paths degrade gracefully without it (server returns a clear error, client shows a toast, no crash).

## Next Phase Readiness

Phase 4's writer-facing loop (mention → context → preset → generate → insert, with cost visibility and spend guardrails) is code-complete and wired end-to-end. Full live-generation verification (cost estimate accuracy, actual Gemini round-trip, wallet debit against a real balance, low-balance banner) is deferred until `GEMINI_API_KEY` is supplied — recommended before phase-goal verification (`/gsd:execute-phase`'s `verify_phase_goal` step) is treated as fully passed for EDIT-04/EDIT-05's live-call behavior.

---
*Phase: 04-ai-gateway-mention-based-generation*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: `app/studio/[workId]/chapters/[chapterId]/ai-panel/MentionAutocomplete.tsx`
- FOUND: `app/studio/[workId]/chapters/[chapterId]/ai-panel/QuickAddDialog.tsx`
- FOUND: `lib/kb/categories.ts`
- FOUND: `.planning/phases/04-ai-gateway-mention-based-generation/04-06-SUMMARY.md`
- FOUND commit: `2cb6086`
- FOUND commit: `92e9e0f`
- FOUND commit: `e32a26b`

---
phase: 15-jev-ai
plan: 10
subsystem: api
tags: [gemini, paid-generation, idempotency, document-generation, vitest]

# Dependency graph
requires:
  - phase: 08-ai-provider-cost
    provides: wallet charging, provider errors, usage reporting, refusal handling
provides:
  - Shared preflight and settlement lifecycle for paid Gemini generations
  - Document plan prompt directive and template heading contract validator
affects: [15-04, 15-06, document-generation]

# Tech tracking
tech-stack:
  added: []
  patterns: [shared paid-generation preflight and settlement, ordered template-heading validation]

key-files:
  created:
    - lib/ai/paid-generation.ts
    - lib/ai/document-contract.ts
    - tests/ai/paid-generation.test.ts
    - tests/ai/document-generation.test.ts
  modified:
    - lib/ai/chat.ts
    - lib/ai/prompt.ts

key-decisions:
  - "Keep the legacy prompt byte-identical when documentPlan is absent."
  - "Validate required headings as an ordered subsequence so extra body and subheadings remain allowed."

patterns-established:
  - "Paid Gemini paths should use the shared access, idempotency, cap, usage debit, refusal, and sanitized error lifecycle."
  - "Document plans extend the existing system prompt while preserving its response protocol."

requirements-completed: [AIDOC-02]

# Metrics
duration: 12min
completed: 2026-09-27
---

# Phase 15 Plan 10 Summary

**Gemini chat now delegates wallet and provider settlement to one reusable lifecycle, with plan-aware document prompts and template-contract validation.**

## Performance

- **Duration:** about 12 minutes
- **Started:** 2026-09-27T03:46:00Z (approximate)
- **Completed:** 2026-09-27T03:58:55Z
- **Tasks:** 2 implemented
- **Files modified:** 6

## Accomplishments

- Extracted write-access, idempotency, wallet cap/debit, refusal, and sanitized provider-error handling into `paid-generation.ts`; refactored `chat()` to use it.
- Added optional plan directives and recommendation fields to `prompt.ts`, plus category and ordered-heading validation in `document-contract.ts`.
- Added seven lifecycle tests and eight document-generation contract tests.

## Task Commits

The Codex sandbox couldn't write `.git/index.lock`. Committed afterward from the main session as a single plan-scoped commit: `9c4bb87` — "feat(15-10): extract paid-generation lifecycle, add document plan/contract". Full `tests/ai tests/kb` regression (310 tests) passes outside the sandbox, including the three DB-backed suites that failed only because the sandbox had no reachable Supabase instance.

## Files Created/Modified

- `lib/ai/paid-generation.ts` - shared paid-generation preflight and settlement lifecycle
- `lib/ai/chat.ts` - routes chat generation through the shared lifecycle
- `tests/ai/paid-generation.test.ts` - lifecycle behavior coverage
- `lib/ai/prompt.ts` - optional document-plan instructions and proposal recommendation fields
- `lib/ai/document-contract.ts` - required-heading extraction and proposal validation
- `tests/ai/document-generation.test.ts` - prompt and document-contract coverage

## Decisions Made

- Kept the no-plan prompt assembly identical to the prior output; the regression assertion passes.
- Used the planned ordered-subsequence heading check. Reordered content is rejected and the validator reports the heading that cannot be matched after the current cursor.

## Deviations from Plan

### Auto-fixed Issues

**1. Chat lifecycle extraction left duplicate helpers in `chat.ts`**
- **Found during:** Task 2 typecheck
- **Issue:** Extracted helpers remained in `chat.ts` and referenced removed imports.
- **Fix:** Removed the duplicate helper block after verifying the implementations reside in `paid-generation.ts`.
- **Files modified:** `lib/ai/chat.ts`
- **Verification:** TypeScript check passed.

**2. Reordered-heading test expectation conflicted with the specified ordered-subsequence algorithm**
- **Found during:** Task 2 verification
- **Issue:** The test expected every heading to be reported missing when the final heading could not be found after the cursor.
- **Fix:** Aligned the expected `missing` list with the validator's ordered-subsequence behavior.
- **Files modified:** `tests/ai/document-generation.test.ts`
- **Verification:** Document-generation and prompt-composition tests passed.

---

**Total deviations:** 2 auto-fixed (implementation cleanup, test expectation alignment)
**Impact on plan:** No scope expansion; behavior matches the supplied algorithm and tests.

## Issues Encountered

- Task 1's full command and final AI regression run could not complete DB-backed tests. Supabase test-user creation failed with `AuthRetryableFetchError: fetch failed`; `NEXT_PUBLIC_SUPABASE_URL` is unset in this shell and the Supabase CLI is unavailable. The `chat.test.ts` and mention test files were left unchanged.
- The final AI run reported 239 passed and 23 skipped tests, with three DB-backed suites failing during setup. The isolated Task 1 suite excluding the unavailable DB-backed `chat.test.ts` passed 69 tests; Task 2 verification passed 21 tests. `npx tsc --noEmit` passed.
- `graphify update .` completed and refreshed graph output. Its generated files and concurrent unrelated workspace changes were left unstaged.
- Git staging and commits remain pending because the workspace denies writes under `.git`.

## User Setup Required

None for application runtime. To complete the requested DB-backed verification, provide a reachable Supabase test instance and its test environment variables. To create the requested commits, run in a checkout where `.git` is writable.

## Next Phase Readiness

The shared lifecycle and document contract are implemented and statically verified. Before treating the plan as fully verified, rerun the DB-backed chat and AI regression tests against a reachable Supabase test instance, then create the two task commits in a writable Git checkout.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*
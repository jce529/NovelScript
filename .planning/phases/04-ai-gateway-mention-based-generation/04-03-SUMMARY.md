---
phase: 04-ai-gateway-mention-based-generation
plan: 03
subsystem: ai
tags: [prompt-engineering, gemini, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-ai-gateway-mention-based-generation (04-CONTEXT.md, 04-UI-SPEC.md)
    provides: D-07/D-08rev/D-10rev/D-14/D-15 decisions this module implements
provides:
  - "lib/ai/prompt.ts: pure prompt-composition module (composeSystemInstruction, assembleUserContent)"
  - "BASELINE_SYSTEM_PROMPT (D-14 always-on guardrails), STYLE_PRESETS/DEFAULT_STYLE_PRESET (D-15), PRESET_INSTRUCTIONS (D-08rev)"
affects: [04-04-generate-estimate-actions]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Pure-function module with fully-specified input/output contract, TDD RED-then-GREEN, no DB/network dependency"]

key-files:
  created: [lib/ai/prompt.ts, tests/ai/prompt-composition.test.ts]
  modified: []

key-decisions:
  - "PRESET_INSTRUCTIONS only defines beginner/intermediate text; freeform falls back to PRESET_INSTRUCTIONS.intermediate when customInstruction is null/empty (safe default, never an empty prompt)"
  - "assembleUserContent omits the KB-context wrapper entirely (no dangling header) when mentionedDocs is empty, per UI-SPEC's empty-state contract"

patterns-established:
  - "Prompt composition is additive/ordered: baseline -> genre -> style -> preset -> optional regeneration feedback, joined with blank-line separators, so callers can assert substring containment independent of exact formatting"

requirements-completed: [EDIT-03]

# Metrics
duration: 8min
completed: 2026-08-30
---

# Phase 4 Plan 3: AI Prompt Composition Summary

**Pure `lib/ai/prompt.ts` module composing Gemini system instructions from D-14's always-on baseline guardrails, D-07's genre, D-15's 4-style library, D-08rev's 3-level AI-지시 프리셋, and D-10rev's additive regeneration feedback — fully covered by a 10-case TDD suite.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-30T15:02:00Z
- **Completed:** 2026-08-30T15:10:00Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments
- `composeSystemInstruction()` always includes `BASELINE_SYSTEM_PROMPT` (content-policy guardrails, style continuity, non-contradiction-with-KB) regardless of which of the 3 AI-지시 프리셋 levels is active
- 자유형 (freeform) uses the writer's typed custom instruction verbatim, or safely falls back to the intermediate-preset instruction when nothing has been typed yet (no empty/malformed prompt)
- D-15's 4-option 문체 프리셋 library (`STYLE_PRESETS`) is always applied independent of the AI-지시 프리셋 level, with `concise-hemingway` as the verified default
- D-07's active genre and D-10rev's additive regeneration feedback are both correctly folded into the composed instruction without replacing other parts
- `assembleUserContent()` builds the Gemini `contents` string from mentioned KB docs + preceding text, correctly omitting the KB-section wrapper when no documents are mentioned

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write failing prompt-composition test suite** - `4497a64` (test)
2. **Task 2 (GREEN): Implement lib/ai/prompt.ts** - `5bad12d` (feat)

_TDD: RED confirmed (module not found) before GREEN implementation; both tasks committed separately._

## Files Created/Modified
- `tests/ai/prompt-composition.test.ts` - 10 test cases specifying composeSystemInstruction and assembleUserContent's full contract (D-07, D-08rev, D-10rev, D-14, D-15)
- `lib/ai/prompt.ts` - PresetLevel, StylePresetId, STYLE_PRESETS, DEFAULT_STYLE_PRESET, BASELINE_SYSTEM_PROMPT, PRESET_INSTRUCTIONS, composeSystemInstruction(), assembleUserContent()

## Decisions Made
- Followed the plan's exact reference implementation for both the test suite and `lib/ai/prompt.ts` — no deviation from the specified exports, string constants, or composition order was needed since the plan's `<action>` blocks were already a complete, directly-runnable contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. This worktree's branch was several commits behind `master` (missing all Phase 04 planning docs, including this plan file) at execution start; fast-forward-merged `master` into the branch before reading the plan. No conflicts.

## User Setup Required

None - no external service configuration required. This module is pure functions with no DB/network dependency.

## Next Phase Readiness
- `lib/ai/prompt.ts`'s `composeSystemInstruction`/`assembleUserContent` are ready for Plan 04-04's `generate()`/`estimateCost()` Server Actions to call directly before building the Gemini request body.
- No blockers.

---
*Phase: 04-ai-gateway-mention-based-generation*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: lib/ai/prompt.ts
- FOUND: tests/ai/prompt-composition.test.ts
- FOUND: .planning/phases/04-ai-gateway-mention-based-generation/04-03-SUMMARY.md
- FOUND: 4497a64
- FOUND: 5bad12d

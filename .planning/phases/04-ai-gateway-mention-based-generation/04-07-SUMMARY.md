---
phase: 04-ai-gateway-mention-based-generation
plan: "07"
subsystem: ai-prompt
tags: [prompt, tdd, freeform, gap-closure]
requires: []
provides: [composeSystemInstruction customInstruction/workSystemInstruction]
affects: [04-08, 04-09]
key-files:
  modified: [lib/ai/prompt.ts, tests/ai/prompt-composition.test.ts]
requirements-completed: [EDIT-03]
completed: 2026-10-17
---

# Phase 4 Plan 07: Freeform and work instruction composition Summary

`composeSystemInstruction` now accepts optional `customInstruction` and `workSystemInstruction`, composed in the order baseline, work block, genre, style, preset, documentPlan, response protocol.

## Tasks
- Task 1 (RED) a2beced: 7 new cases in tests/ai/prompt-composition.test.ts. 2 failed on the missing fields; 18 passed before the change. Vitest does not type-check, so the other new cases passed vacuously or via legacy behavior.
- Task 2 (GREEN): `lib/ai/prompt.ts`, committed separately (see git log, "feat(04-07)").

## Behavior
- freeform plus non-blank customInstruction replaces the preset line. Blank, null or undefined keeps PRESET_INSTRUCTIONS.freeform. The field is ignored for beginner and intermediate.
- workSystemInstruction is added as a "작품 추가 지시" block right after the baseline for intermediate and freeform. It is ignored for beginner.
- The baseline stays first and the protocol stays last. Without the new fields the output is byte-for-byte unchanged (tested).
- Stale comments ("자유형=대화만", "세션 동안 정적") were updated.

## Verification
- prompt-composition.test.ts: 20/20 pass. document-generation.test.ts: 8/8 pass. `tsc --noEmit` shows no errors in prompt files.

## Deviations
None. graphify update was skipped per the caller's instruction.

## Gaps
No live DB or provider calls (none needed). Storage is 04-08 and the call wiring is 04-09.

---
phase: 11-byok-ux
plan: "13"
subsystem: ai
tags: [byok, capped-reason, regeneration-modal, regression, tdd]
requirements: [PROV-06, BYOK-05, BYOK-09]
dependency_graph:
  requires: ["11-11", "04-10", "04-11"]
  provides: ["capped chat->panel->bubble/toast regression", "regeneration modal real-handler transition regression"]
  affects: ["11-12 (live DB/browser UAT)"]
tech-stack:
  added: []
  patterns: ["SSR + mocked hooks harness executing real component callbacks"]
key-files:
  created:
    - tests/ai/capped-ux.test.ts
  modified:
    - tests/ai/save-document-plan-modal.test.ts
decisions:
  - "UI source (AiPanel, SaveDocumentPlanModal) was not edited; both regressions were GREEN against the Phase 4 source."
metrics:
  duration: "resumed run"
  completed: 2026-10-19
  tasks: 2
  files: 2
---

# Phase 11 Plan 13: Capped-reason UX and regeneration modal regression Summary

Real-callback unit regressions: general chat result -> AiPanel message -> ChatMessageBubble/toast carries the exact capped reason, and the regeneration modal's consent, cancel, retry and click-lock transitions are exercised through the real handlers.

## Commits
- 1fc1b29 test(11-13): chat result to AiPanel bubble and toast capped-reason regression (Task 1)
- eb1dc95 test(11-13): regeneration modal consent, cancel, retry and click-lock transitions via real handlers (Task 2)

## Verification
- Combined run of tests/ai/save-document-plan-modal, regenerate-contract, document-regenerate, ai-panel-notice, capped-ux, capped-reason, ai-panel-model (--project unit): 7 files, 100 tests passed.
- `tsc --noEmit`: only errors are in tests/world-tree/timeline.test.ts (plan 18-03, out of scope); none in 11-13 files.
- The Task 1 verify command (including tests/ai/capped-ux.test.ts) passes.

## Deviations from Plan
None - executed as written. The previous executor's uncommitted modal test was reviewed against the Task 2 behavior list (replacement consent, close/reopen, cancel, retryable failure, already_processed, template change, lost response, consecutive clicks, props change) and committed unchanged.

## Gaps / UAT not run
- Browser focus behavior of the modal and live-DB suites are not covered here; left to gate 11-12 (UAT-3/4).
- invalid/rate/credit/unavailable wording is covered by the existing notice/contract tests in the combined run; no live provider was called.
- graphify update was intentionally not run in this session.

## Self-Check: PASSED

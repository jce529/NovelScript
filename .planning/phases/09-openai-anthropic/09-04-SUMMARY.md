---
phase: 09-openai-anthropic
plan: 04
subsystem: ai
status: complete_with_environment_verification_gap
completed: 2026-09-29
requirements: [PROV-02, PROV-03, PROV-04, PROV-07]
---

# Phase 9 Plan 04 Summary

The chapter chat path now passes a catalog-validated `providerId` and `model` from the AI panel through `chatAction` to the selected platform-key adapter. The shared paid-generation lifecycle uses that provider's pricing for the wallet-based output cap and the debit from reported usage, including document-planning responses. The existing document-regeneration path retains its Gemini tier input pending its own migration.

The panel lists real model names under provider headings, sends a frozen provider/model snapshot for retries, and resets to its temporary Gemini default after a successful response. Failed sends retain the selected model. It shows a pre-send wallet-token example based on the selected model's actual rates for 1,000 input plus 1,000 output tokens; actual usage is charged after generation. Account defaults are Plan 05's responsibility.

## Task order and test evidence

1. **Chat and action:** Added failing `chat-action.test.ts` cases for cross-provider model rejection, provider dispatch, and provider-specific sanitized config logs. Migrated chat/action and the shared paid-generation path, then updated affected Gemini fixtures. Added `paid-generation.test.ts` cases that prove OpenAI and Anthropic caps and debits use their own rates, differing from Gemini for identical usage. These tests pass.
2. **Panel:** Added a failing server-render test for all catalog models and the per-send hint. Implemented the grouped picker, success-only reset, and provider-rate example. The test passes.

## Verification

- `npx tsc --noEmit`: passed with zero errors.
- `npx vitest run tests/ai`: 397 passed, 26 skipped. Three files (`chat.test.ts`, `mention-context.test.ts`, `mention-search.test.ts`) fail during Supabase test-user setup because this offline environment cannot reach the test service; their teardown errors follow failed setup. No other AI test failed.
- `git diff --check`: passed. `graphify update .` completed after code changes.
- No dependencies were installed, no commit was created, and `.planning/ROADMAP.md` was not changed. Pre-existing graphify changes and `.claude/settings.local.json` were preserved.

## Remaining verification and follow-up

Live OpenAI/Anthropic platform-key generation was not possible offline. The cost example is a stated 1,000/1,000-token reference, not a prediction of a particular prompt's final usage. Plan 05 must replace the temporary Gemini reset target with the saved account default. The document-regeneration action still uses Gemini's legacy tier contract.

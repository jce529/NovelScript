---
phase: 09-openai-anthropic
plan: 03
subsystem: ai
status: complete_with_expected_integration_gap
completed: 2026-09-29
requirements: [PROV-07]
---

# Phase 9 Plan 03 Summary

Moved Gemini's USD-per-million-token pricing to `lib/ai/providers/gemini/cost.ts` alongside the existing OpenAI and Anthropic tables. `lib/ai/cost.ts` now accepts a resolved `{ input, output }` price pair for conversion, output caps, and debit. The former Gemini numeric expectations remain unchanged. The existing Gemini payment lifecycle explicitly supplies Gemini's model price until Plan 04 wires provider and model selection into that lifecycle.

`createPlatformProvider(providerId, env)` now selects the Gemini, OpenAI, or Anthropic adapter and reads `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` respectively. It preserves development fixture behavior and reports a sanitized missing-key error for the selected provider.

## Task order and test evidence

1. **Cost:** Updated `tests/ai/cost-estimate.test.ts` first. It failed because `gemini/cost.ts` did not exist. Added the table and generalized the math; all 15 cost tests passed, including different debits for the same usage under OpenAI and Anthropic prices. Updated existing Gemini payment tests to pass the explicit price pair.
2. **Registry:** Added `tests/ai/provider-registry.test.ts` first. All six new tests failed against the Gemini-only registry. Implemented provider selection and key mapping; all six passed. Updated existing registry tests for the new signature.

## Verification

- `npx vitest run tests/ai`: 389 passed, 26 skipped, 1 failed; four test files report failures. The one runnable failure is `provider-fixture.test.ts`'s `chatAction drop-response hook > never throws in production`: `actions.ts` still invokes `createPlatformProvider()` without the required provider ID. Plan 04 owns both `actions.ts` call sites. The other three failing files (`chat.test.ts`, `mention-context.test.ts`, `mention-search.test.ts`) cannot create Supabase test users because network access is unavailable; their teardown errors follow from failed setup.
- `npx tsc --noEmit`: only two TS2554 errors, both in `app/studio/[workId]/chapters/[chapterId]/actions.ts` at the Plan-04-owned calls (lines 157 and 326). No errors outside that file.
- `graphify update .` completed after code changes. Existing unrelated graphify changes and `.claude/settings.local.json` were preserved. `ROADMAP.md` was not changed. No commit was created.

## Remaining integration

Plan 04 must pass a provider ID at both action call sites and resolve the selected provider/model's pricing before the shared payment lifecycle. Live platform-key generation and pre-call UI cost display were outside this plan and were not verified. No dependency installation or package change was needed.

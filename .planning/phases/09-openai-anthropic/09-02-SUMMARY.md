---
phase: 09-openai-anthropic
plan: 02
subsystem: ai
status: complete
completed: 2026-09-29
requirements: [PROV-03, PROV-07]
---

# Phase 9 Plan 02 Summary

Implemented the Anthropic Messages adapter behind `ProviderClient` and added an Anthropic-only USD-per-million-token pricing table. The adapter converts text, usage, output limits, and structured `stop_reason: 'refusal'` into the shared `GenerateResult` contract. It builds Messages arguments without `temperature` and wraps SDK failures in sanitized `ProviderCallError` objects.

## Tasks and test-first evidence

1. **Adapter:** The Plan 00 `provider-anthropic.test.ts` scaffold was RED because the adapter module was absent. Added `mapAnthropicResponse` and `createAnthropicProvider`, removed the obsolete `@ts-expect-error`, and reran `npx vitest run tests/ai`. All five Anthropic adapter tests passed. The mapping tolerates missing usage in the refusal fixtures, with reported flags set false. `npx tsc --noEmit` passed.
2. **Pricing:** Added a test for both Anthropic model rates before creating the cost module. `npx vitest run tests/ai` was RED because `anthropic/cost.ts` was absent. Added the provider-owned table with `claude-haiku-4-5` at $1.00/$5.00 and `claude-sonnet-5` at $2.00/$10.00 per million input/output tokens. The new pricing test passed, as did `npx tsc --noEmit`.

## Verification and scope

- Final `npx vitest run tests/ai`: 383 passed, 26 skipped, 3 files failed. The Anthropic suite (six tests), Gemini suite, and OpenAI suite passed. The remaining failures are `chat.test.ts`, `mention-context.test.ts`, and `mention-search.test.ts`: their Supabase test-user setup fails with `AuthRetryableFetchError: fetch failed` in this no-network environment; teardown errors follow from missing users.
- Final `npx tsc --noEmit`: passed. `graphify update .` completed after the code changes.
- This plan adds the adapter and isolated pricing data. The provider registry, chat selection, and provider-specific pre-call cost lookup are owned by later Phase 9 plans, so real Anthropic generation through the chat UI and displayed costs were not verified here. No live Anthropic call was made.
- Dependencies were already installed; no `package.json` or lockfile changes were needed. `ROADMAP.md` was not changed and no commit was created.

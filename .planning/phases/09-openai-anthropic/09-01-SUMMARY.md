---
phase: 09-openai-anthropic
plan: 01
subsystem: ai
status: complete
completed: 2026-09-29
requirements: [PROV-02, PROV-07]
---

# Phase 9 Plan 01 Summary

Implemented the OpenAI Responses adapter behind `ProviderClient` and added an OpenAI-owned USD-per-million-token pricing table. The adapter maps reported usage, reasoning tokens, normal completions, output limits, both structured refusal shapes, and SDK errors to the existing shared contracts. The existing chat registry and cost calculations are wired in later Phase 9 plans; no live OpenAI call was made here.

## Tasks and TDD evidence

1. **Adapter:** The Plan 00 `provider-openai.test.ts` scaffold was RED because `openai.ts` was absent. Added `mapOpenAiResponse` and `createOpenAiProvider`, then removed the scaffold's `@ts-expect-error`. All six adapter tests passed. Adjusted the refusal-content traversal to satisfy the installed OpenAI SDK's TypeScript response union; `npx tsc --noEmit` then passed.
2. **Pricing:** Added an assertion for both researched OpenAI rates before creating `openai/cost.ts`; `npx vitest run tests/ai` showed the expected missing-cost-module failure. Added the isolated table with `gpt-4o-mini` at $0.15/$0.60 and `gpt-5.6-terra` at $2.00/$12.00 per million input/output tokens. The pricing test then passed.

## Verification

- `npx tsc --noEmit`: passed.
- `npx vitest run tests/ai`: 377 passed, 26 skipped; 4 files failed for conditions outside this plan. The OpenAI file's seven tests passed, and the Gemini provider file remained green. `provider-anthropic.test.ts` is the planned RED scaffold awaiting Plan 09-02. `chat.test.ts`, `mention-context.test.ts`, and `mention-search.test.ts` could not create Supabase test users because the service fetch failed in the no-network environment; their teardown errors follow from that setup failure.
- OpenAI pricing rows match the plan's acceptance values. `graphify update .` completed after code changes.

## Scope and state

No dependency installation or package change was needed: `openai@7.23.0` was already installed. Existing unrelated working-tree changes were preserved. `ROADMAP.md` was not changed, and no commit was created. Real OpenAI generation through the chat UI and provider-specific pre-call cost display depend on later Phase 9 integration plans and remain unverified here.

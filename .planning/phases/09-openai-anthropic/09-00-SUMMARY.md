---
phase: 09-openai-anthropic
plan: 00
subsystem: ai
status: complete
completed: 2026-09-29
requirements: [PROV-02, PROV-03]
---

# Phase 9 Plan 00 Summary

Expanded `ProviderId` to Gemini, OpenAI, and Anthropic. Added a provider-owned model catalog with real model IDs and names, provider-scoped lookup, and a default model helper. Kept the legacy Gemini `ModelTier` mapping for later migration plans.

## Tasks and TDD evidence

1. **Contract and catalog:** Added `tests/ai/provider-catalog.test.ts` first. It failed because `catalog.ts` did not exist. Added the catalog and widened the type; the two catalog tests then passed, and `npx tsc --noEmit` passed.
2. **Adapter test scaffolds:** Added real mapping, refusal, call-shape, and error-scrubbing assertions in `provider-openai.test.ts` and `provider-anthropic.test.ts`. Each fails only on resolution of its missing adapter module, as specified for Wave 0. Plans 09-01 and 09-02 provide the implementations and turn these suites green. The temporary `@ts-expect-error` on each import preserves this plan's TypeScript gate and must be removed when the module is added.

## Verification

- `npx tsc --noEmit`: passed.
- `npx vitest run tests/ai/provider-gemini.test.ts tests/ai/cost-estimate.test.ts tests/ai/provider-catalog.test.ts`: 59 passed.
- `npx vitest run tests/ai/provider-openai.test.ts` and the Anthropic counterpart: expected module-resolution RED.
- `npx vitest run tests/ai`: 31 files and 370 tests passed; five files failed. Two are the expected adapter RED suites. The other three (`chat`, `mention-context`, `mention-search`) require Supabase auth and failed on `AuthRetryableFetchError: fetch failed` under the stated no-network environment. Their follow-on teardown errors result from user creation failing.
- Acceptance text checks and `git diff --check`: passed. `graphify update .` completed.

## Scope notes

The extra catalog test is a deliberate deviation from the four-file plan list to satisfy the requested test-first order for Task 1. This plan is only Wave 0; no OpenAI or Anthropic adapter or live platform-key call was implemented or verified. OpenAI Organization Verification remains a live-call constraint for `gpt-5.6-terra`.

No commit was created.

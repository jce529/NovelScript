---
phase: 08-provider-adapter-idempotent-debit
plan: 02
subsystem: ai
tags: [provider-adapter, gemini, refusal, usage, error-boundary]
requires:
  - 08-01 (ProviderClient types, ProviderCallError/toSanitizedProviderError, estimateGeminiInputTokens)
provides:
  - lib/ai/providers/gemini.ts (mapGeminiResponse, createGeminiProvider)
  - lib/ai/providers/registry.ts (createPlatformProvider)
affects: [08-05, 08-07]
tech-stack:
  added: []
  patterns: [pure response mapper + thin SDK wrapper, allowlisted refusal signals, SDK retry pinned to 1 attempt]
key-files:
  created:
    - lib/ai/providers/gemini.ts
    - lib/ai/providers/registry.ts
    - tests/ai/provider-gemini.test.ts
  modified: []
decisions:
  - "Response text built from candidates[0].content.parts (non-thought) instead of the SDK .text getter, so plain fixtures and real responses behave identically"
  - "thoughtsTokenCount reported separately and not added to outputTokens (thinking billing is a later decision)"
metrics:
  duration: ~4min
  completed: 2026-09-17
  tasks: 2
  files: 3
---

# Phase 8 Plan 02: Gemini Provider Adapter + Platform Registry Summary

Gemini `ProviderClient` adapter with a pure response mapper (input/output refusal from structured signals only, prompt/candidates usage with reported flags), a single-attempt SDK client that rethrows only sanitized `ProviderCallError`, and an env-driven `createPlatformProvider`.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Pure response mapping — text, finishReason, refusal, usage | 610a849 |
| 2 | createGeminiProvider (single attempt, sanitized throw, no countTokens) + registry | b18c996 |

Both TDD (test failed on missing module, then green). `tests/ai/provider-gemini.test.ts` 43 tests; together with provider-errors and token-estimate 78/78 pass. Filtered `npx tsc --noEmit` shows no errors in this plan's files. All grep acceptance criteria hold; `@google/genai` imported only by `lib/ai/providers/gemini.ts` and legacy `lib/ai/gemini.ts`.

## Deviations from Plan

**1. [Rule 3 - Acceptance grep] Reworded JSDoc** — a comment containing "attempts: 1" made `grep -c "attempts: 1"` return 2; reworded. No behavior change.

## Deferred Issues

None for this plan. `graphify update .` run; `graphify-out/` left uncommitted (shared generated artifacts, parallel wave).

## Known Stubs

None. No runtime consumer switched yet (08-05 wires chatAction).

## Self-Check: PASSED

- lib/ai/providers/gemini.ts, lib/ai/providers/registry.ts, tests/ai/provider-gemini.test.ts exist.
- Commits 610a849, b18c996 present in git log.

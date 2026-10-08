---
phase: 11-byok-ux
plan: 02
subsystem: api
tags: [providers, byok, errors, retry]
requires:
  - phase: 11-byok-ux
    provides: ai_usage schema and usage recording contract from plan 11-01
provides:
  - Provider-specific sanitized BYOK failure classifications
  - Explicit single-attempt SDK configuration for all providers
affects: [byok-generation, chat-failure-ui]
tech-stack:
  added: []
  patterns: [structured provider error allowlists, key-source-aware classification]
key-files:
  created: []
  modified: [lib/ai/providers/types.ts, lib/ai/providers/errors.ts, lib/ai/providers/openai.ts, lib/ai/providers/anthropic.ts, lib/ai/providers/gemini.ts, tests/ai/provider-errors.test.ts, tests/ai/provider-openai.test.ts, tests/ai/provider-anthropic.test.ts, tests/ai/provider-gemini.test.ts]
key-decisions:
  - "Unknown provider codes are discarded; only explicitly allowlisted structured values cross the adapter boundary."
  - "Anthropic 400 natural-language spend messages remain config failures because no stable structured code is available."
requirements-completed: [BYOK-05]
duration: 15min
completed: 2026-10-08
---

# Phase 11 Plan 02: Provider Failure Classification Summary

**Provider adapters now classify allowlisted BYOK failures and prevent SDK retries before a user requests another attempt.**

## Performance

- **Duration:** ~15 minutes
- **Started:** 2026-10-08
- **Completed:** 2026-10-08
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `invalid_key` and `credit_exhausted` to the provider error kinds and introduced key-source context for classification.
- Classified OpenAI spend-limit codes, Anthropic structured enforced spend limits and billing status, and Gemini payment-required signals without parsing message text.
- Set OpenAI and Anthropic constructor retries to zero; retained and tested Gemini's single attempt.
- Added sanitizer and adapter tests for classification, BYOK authentication failures, retry settings, and non-disclosure.

## Task Commits

No commits were created, as instructed; the orchestrator will commit task changes separately.

## Files Created/Modified

- `lib/ai/providers/types.ts` - Expanded error kind and code contracts.
- `lib/ai/providers/errors.ts` - Added provider-specific structured allowlist classification.
- `lib/ai/providers/openai.ts`, `lib/ai/providers/anthropic.ts`, `lib/ai/providers/gemini.ts` - Forward source context, sanitize errors, and pin retry settings.
- `tests/ai/provider-errors.test.ts`, `tests/ai/provider-openai.test.ts`, `tests/ai/provider-anthropic.test.ts`, `tests/ai/provider-gemini.test.ts` - Cover classifications, sanitization and retry behavior.

## Decisions Made

- Anthropic 400 natural-language spend messages stay `config`; message parsing is excluded by the security contract.
- Unknown structured error codes are discarded and fall back to the HTTP status code where available.

## Deviations from Plan

OpenAI and Anthropic already passed `maxRetries: 0` in individual request options before this plan. Their constructors now also explicitly set `maxRetries: 0`, as required by the plan, with constructor-level regression assertions. Gemini already used `attempts: 1`; that behavior remains unchanged and is covered by its existing assertion.

No other deviations.

## Verification

- `npx.cmd vitest run tests/ai/provider-errors.test.ts tests/ai/provider-openai.test.ts tests/ai/provider-anthropic.test.ts tests/ai/provider-gemini.test.ts --no-file-parallelism` — **PASSED**, 4 files / 105 tests.
- `npx.cmd tsc --noEmit` — **FAILED**. Plan-related errors remain in `lib/ai/paid-generation.ts:189`: the existing chat failure mapping does not yet accept `invalid_key` or `credit_exhausted`. That file is outside this plan's `files_modified` list. The same run also reports three unresolved imports from pre-existing untracked `tests/payments/` files; those files were not changed.
- The prescribed unsafe-pattern search under `lib/ai/providers` returned no matches.

## Issues Encountered

The expanded provider error union exposes a dependency on the subsequent lifecycle/UI work: `paid-generation.ts` still maps only the old chat failure kinds. Fixing it would exceed the explicit file scope for this plan. The existing untracked payment tests also prevent a clean whole-project typecheck.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The provider classification and retry boundaries are ready for the BYOK generation lifecycle. The lifecycle work must map `invalid_key` and `credit_exhausted` into chat results. Whole-project typecheck remains blocked by those out-of-scope lifecycle types and the unresolved imports in untracked payment tests.

## Self-Check: FAILED

- All nine planned source/test files exist and the focused unit suite passes.
- `11-02-SUMMARY.md` exists.
- `npx.cmd tsc --noEmit` does not pass; see Verification and Issues Encountered.
- No commits were expected or created.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*

## 오케스트레이터 메모 (2026-10-08)

- 단위 테스트 `tests/ai` 46파일 596개 통과(DB 통합 제외). tsc 오류는 `paid-generation.ts:189`의 `ProviderErrorKind → ChatFailureKind` 매핑뿐이며, 이는 11-04(paid-generation 일반화)·11-06(`ChatFailureKind` 확장)에서 해소한다. 전이 상태로 허용한다. `tests/payments/*`의 import 오류는 Phase 5 미구현 라우트 때문인 기존 미추적 파일 문제다.
- Codex 샌드박스는 커밋 불가 → 오케스트레이터가 커밋.

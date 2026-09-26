---
phase: 09-openai-anthropic
verified: 2026-09-22T05:13:45Z
status: gaps_found
score: 0/9 must-haves verified
overrides_applied: 0
gaps:
  - truth: "A writer can select an OpenAI model and receive generation/assist output through the existing draft and proposal UI."
    status: failed
    reason: "The OpenAI adapter, catalog entries, SDK dependency, registry branch, UI option, and tests do not exist; the runtime still accepts only ProviderId 'gemini'."
    artifacts:
      - path: "lib/ai/providers/openai.ts"
        issue: "Missing."
      - path: "lib/ai/providers/openai/cost.ts"
        issue: "Missing."
      - path: "tests/ai/provider-openai.test.ts"
        issue: "Missing; Vitest reports 'No test files found'."
      - path: "lib/ai/providers/registry.ts"
        issue: "Gemini-only createPlatformProvider(env) implementation."
    missing:
      - "Implement and sanitize the OpenAI Responses API adapter."
      - "Add OpenAI model catalog/pricing, registry wiring, chat-action wiring, and behavioral tests."
  - truth: "A writer can select an Anthropic model and receive generation/assist output through the existing draft and proposal UI."
    status: failed
    reason: "The Anthropic adapter, catalog entries, SDK dependency, registry branch, UI option, and tests do not exist; no code can invoke Anthropic."
    artifacts:
      - path: "lib/ai/providers/anthropic.ts"
        issue: "Missing."
      - path: "lib/ai/providers/anthropic/cost.ts"
        issue: "Missing."
      - path: "tests/ai/provider-anthropic.test.ts"
        issue: "Missing; Vitest reports 'No test files found'."
      - path: "lib/ai/providers/registry.ts"
        issue: "Gemini-only createPlatformProvider(env) implementation."
    missing:
      - "Implement and sanitize the Anthropic Messages API adapter, including deliberate temperature omission."
      - "Add Anthropic model catalog/pricing, registry wiring, chat-action wiring, and behavioral tests."
  - truth: "A writer can persist an account default provider/model, override it for one send, and then return to that saved default."
    status: failed
    reason: "There is no settings migration, settings data layer, settings route, provider/model picker, or saved-default wiring. The AI panel still stores a lite/pro ModelTier and the action schema accepts only modelTier."
    artifacts:
      - path: "supabase/migrations/0010_ai_provider_defaults.sql"
        issue: "Missing."
      - path: "lib/ai/providers/settings.ts"
        issue: "Missing."
      - path: "app/studio/settings/ai-providers/page.tsx"
        issue: "Missing."
      - path: "app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx"
        issue: "Still renders only the lite/pro selector and sends modelTier."
      - path: "app/studio/[workId]/chapters/[chapterId]/actions.ts"
        issue: "Schema and ChatActionInput still accept only modelTier."
    missing:
      - "Add nullable account default provider/model storage with validated fallback."
      - "Add /studio/settings/ai-providers and thread the saved default into AiPanel initial/reset state."
      - "Replace the lite/pro selector with a provider/model per-call picker that resets only after success."
  - truth: "The pre-generation estimate and post-call debit use the selected provider/model's own pricing rather than reusing Gemini pricing."
    status: failed
    reason: "lib/ai/cost.ts is explicitly Gemini-only and keyed by ModelTier; chat.ts always resolves MODEL_TIER_TO_ID and calls Gemini-specific cost functions. No provider-scoped pricing modules exist."
    artifacts:
      - path: "lib/ai/cost.ts"
        issue: "Exports GEMINI_PRICING_USD_PER_MILLION and walletTokensPerGeminiToken; accepts modelTier, not resolved pricing."
      - path: "lib/ai/providers/gemini/cost.ts"
        issue: "Missing; Gemini pricing was not split out."
      - path: "lib/ai/chat.ts"
        issue: "Still resolves only MODEL_TIER_TO_ID[input.modelTier] and Gemini pricing."
      - path: "tests/ai/cost-estimate.test.ts"
        issue: "Covers Gemini lite/pro only; no cross-provider pricing-isolation assertion."
    missing:
      - "Create isolated Gemini/OpenAI/Anthropic pricing modules."
      - "Generalize cost math to a resolved pricing pair and resolve it by validated providerId/model."
      - "Add cross-provider estimate/debit isolation tests."
---

# Phase 9: OpenAI · Anthropic Adapter + Provider Pricing Verification Report

**Phase Goal:** 작가가 플랫폼(서비스) 키로 Gemini 외 두 제공자를 실제로 골라 집필할 수 있고, 무엇을 고르든 그 모델의 진짜 단가로 계산된 비용을 생성 전에 본다.

**Verified:** 2026-09-22T05:13:45Z  
**Status:** gaps_found  
**Re-verification:** No — initial verification

## Goal Achievement

Phase 9 has planning artifacts only. There are no Phase 9 summaries, ROADMAP still marks all six plans unchecked, STATE identifies Phase 9 as `next`, and direct source inspection confirms the application remains the Phase 8 Gemini-only implementation. These planning markers are corroborating context, not the basis of the verdict; the missing and contradictory runtime code below is the decisive evidence.

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | OpenAI can be selected and its result reaches the existing draft/proposal flow. | FAILED (BLOCKER) | `openai.ts`, its tests, catalog entries, dependency, registry branch, and picker option are absent. |
| 2 | OpenAI refusal blocks and incomplete/content-filter responses normalize to `ProviderRefusal`. | FAILED (BLOCKER) | No OpenAI response mapper exists. |
| 3 | Anthropic can be selected and its result reaches the existing draft/proposal flow. | FAILED (BLOCKER) | `anthropic.ts`, its tests, catalog entries, dependency, registry branch, and picker option are absent. |
| 4 | Anthropic refusal normalizes to `ProviderRefusal`, and `temperature` is not forwarded. | FAILED (BLOCKER) | No Anthropic adapter or request-shape test exists. |
| 5 | One provider catalog exposes real model names without a fixed lite/pro tier contract. | FAILED (BLOCKER) | `catalog.ts` is missing; `ProviderId = 'gemini'`, `ModelTier = 'lite' | 'pro'`, and `MODEL_TIER_TO_ID` remain active. |
| 6 | Registry constructs Gemini/OpenAI/Anthropic clients using their respective service-key environment variables. | FAILED (BLOCKER) | `createPlatformProvider(env)` reads only `GEMINI_API_KEY` and always returns the Gemini adapter. |
| 7 | Account settings persist a default provider/model; the AI panel initializes and resets to it after a one-call override. | FAILED (BLOCKER) | Migration, settings module, route, props, picker, and reset logic are all absent. |
| 8 | Accounts without a stored default safely fall back to Gemini's first catalog model. | FAILED (BLOCKER) | No catalog or settings data layer exists from which to implement/verify fallback. |
| 9 | Estimate and debit math use the selected provider/model's isolated price table. | FAILED (BLOCKER) | Cost and chat orchestration remain Gemini/ModelTier-specific; OpenAI/Anthropic pricing files do not exist. |

**Score:** 0/9 truths verified

## Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/ai/providers/types.ts` | Three-provider `ProviderId`; no final runtime dependence on fixed ModelTier | FAILED | Exists but still declares only `ProviderId = 'gemini'` and `ModelTier = 'lite' | 'pro'`. |
| `lib/ai/providers/catalog.ts` | Provider/model catalog and validation helpers | MISSING | File absent. |
| `lib/ai/providers/openai.ts` | OpenAI mapper and `ProviderClient` | MISSING | File absent. |
| `lib/ai/providers/openai/cost.ts` | OpenAI model pricing | MISSING | File absent. |
| `lib/ai/providers/anthropic.ts` | Anthropic mapper and `ProviderClient` | MISSING | File absent. |
| `lib/ai/providers/anthropic/cost.ts` | Anthropic model pricing | MISSING | File absent. |
| `lib/ai/providers/gemini/cost.ts` | Isolated Gemini model pricing | MISSING | Pricing remains embedded in `lib/ai/cost.ts`. |
| `lib/ai/cost.ts` | Provider-neutral cost math taking a pricing pair | FAILED | Substantive but still Gemini-only and `ModelTier`-keyed. |
| `lib/ai/providers/registry.ts` | Three-way service-key adapter registry | FAILED | Substantive but explicitly Gemini-only. |
| `lib/ai/chat.ts` | `providerId + model` orchestration and provider-specific pricing resolution | FAILED | Substantive but wired only to `modelTier`, `MODEL_TIER_TO_ID`, and Gemini cost math. |
| `app/studio/[workId]/chapters/[chapterId]/actions.ts` | Provider/model schema validation and selected-provider construction | FAILED | Substantive but accepts `modelTier` and calls zero-argument `createPlatformProvider()`. |
| `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` | Provider-grouped model picker and one-send override reset | FAILED | Substantive but renders only `라이트`/`프로`. |
| `supabase/migrations/0010_ai_provider_defaults.sql` | Account-default columns | MISSING | File absent. |
| `lib/ai/providers/settings.ts` | Validated default read/write and fallback | MISSING | File absent. |
| `app/studio/settings/ai-providers/page.tsx` | Account provider/model settings surface | MISSING | File absent. |
| `tests/ai/provider-openai.test.ts` | OpenAI mapping/call/error contract tests | MISSING | File absent. |
| `tests/ai/provider-anthropic.test.ts` | Anthropic mapping/temperature/error contract tests | MISSING | File absent. |
| `tests/ai/provider-settings.test.ts` | Settings persistence/fallback tests | MISSING | File absent. |

## Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| AI panel | `chatAction` | `providerId + model` payload | NOT WIRED | Panel and action exchange only `modelTier`. |
| `chatAction` | provider registry | `createPlatformProvider(providerId)` | NOT WIRED | Action calls `createPlatformProvider()`; registry has no provider parameter. |
| registry | OpenAI SDK adapter | `OPENAI_API_KEY` + `createOpenAiProvider` | NOT WIRED | Adapter/dependency/branch absent. |
| registry | Anthropic SDK adapter | `ANTHROPIC_API_KEY` + `createAnthropicProvider` | NOT WIRED | Adapter/dependency/branch absent. |
| `chat()` | provider pricing modules | validated provider/model pricing lookup | NOT WIRED | `chat()` uses `input.modelTier` and Gemini-only functions. |
| settings page | settings data layer | validated save action | NOT WIRED | Both endpoints are absent. |
| chapter page / AI panel | saved account default | initial state and post-success reset target | NOT WIRED | No settings read or default props exist. |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| AI panel model selector | `modelTier` | Local `useState('lite')` | Only Gemini tier values | DISCONNECTED from Phase 9 provider/model data |
| `chatAction` | parsed `modelTier` | Zod enum `lite/pro` | Selects no provider/model pair | DISCONNECTED |
| provider registry | API key | `env.GEMINI_API_KEY` | Real Gemini client only | DISCONNECTED from OpenAI/Anthropic |
| cost estimate/debit | `modelTier` | Gemini pricing constant | Real Gemini math only | STATIC/GEMINI-ONLY |
| account default | N/A | No migration/query/UI | No | DISCONNECTED |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Phase 9 adapter/settings tests execute | `npx vitest run tests/ai/provider-openai.test.ts tests/ai/provider-anthropic.test.ts tests/ai/provider-settings.test.ts` | `No test files found, exiting with code 0` | FAIL — missing tests; exit 0 is a misleading false-green |
| Existing Gemini/cost/action regression tests | `npx vitest run tests/ai/provider-gemini.test.ts tests/ai/cost-estimate.test.ts tests/ai/chat-action.test.ts` | 3 files, 61 tests passed | PASS — confirms Phase 8 baseline only, not Phase 9 |
| TypeScript compile | `npx tsc --noEmit` | Exit 0, no diagnostics | PASS — current Gemini-only code compiles |
| Full repository suite | `npm test` | 435 passed, 62 skipped, 16 failed; 32 files reported failed because required Supabase environment variables were absent in this shell | WARNING — environment prevents a clean repository-wide result; does not explain the missing Phase 9 implementation |

## Probe Execution

No Phase 9 probe is declared in the plans/validation files, and no conventional `scripts/**/tests/probe-*.sh` applies to this phase. **SKIPPED (no phase probe).**

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| PROV-02 | 09-00, 09-01, 09-04 | OpenAI non-streaming generation/assist through the existing UI | BLOCKED | No OpenAI adapter, SDK dependency, catalog item, registry/action/UI wiring, or tests. |
| PROV-03 | 09-00, 09-02, 09-04 | Anthropic non-streaming generation/assist through the existing UI | BLOCKED | No Anthropic adapter, SDK dependency, catalog item, registry/action/UI wiring, or tests. |
| PROV-04 | 09-03, 09-04, 09-05 | Persisted account default plus one-call provider/model override | BLOCKED | No migration/settings page/data layer; UI/action remain lite/pro only. |
| PROV-07 | 09-01, 09-02, 09-03, 09-04 | Estimate with the selected provider/model's actual service-key price | BLOCKED | Only Gemini tier pricing exists and is wired. |

No Phase 9 requirement is orphaned: REQUIREMENTS maps exactly PROV-02, PROV-03, PROV-04, and PROV-07 to Phase 9, and the plans declare all four. Coverage is planned but wholly unimplemented.

## Anti-Patterns Found

| File | Line / Pattern | Severity | Impact |
|---|---|---|---|
| `lib/ai/providers/types.ts` | Comment says OpenAI/Anthropic arrive in Phase 9 while `ProviderId` remains Gemini-only | Blocker evidence | Confirms the extension point was never implemented. |
| `lib/ai/providers/registry.ts` | Comment says Phase 9 adds OpenAI/Anthropic; implementation reads only `GEMINI_API_KEY` | Blocker evidence | Pieces are not merely unwired; they do not exist. |
| `tests/ai/cost-estimate.test.ts` | Test name calls the KRW rate “placeholder” | Info | Existing Phase 8 provisional FX convention; not itself a Phase 9 completion blocker. |

No unreferenced `TBD`, `FIXME`, or `XXX` debt marker was found in the inspected implementation/test files. Matches for input `placeholder`, ordinary `return null`/`return []` guards, and test no-op mocks are not stubs because they do not implement a Phase 9 deliverable.

## Human Verification Required After Gap Closure

Automated verification cannot reach the human checks because the selectable providers and settings surface do not exist. Once the blockers are implemented, perform:

### 1. Live OpenAI and Anthropic generation/refusal behavior

**Test:** With billing-enabled platform keys, select each provider, run a normal generation and a deliberate refusal-triggering prompt.  
**Expected:** Normal output enters the existing reply/draft/proposal UI; structured refusals show the shared Korean refusal copy and never raw vendor text.  
**Why human:** Requires real vendor keys, live moderation behavior, and rendered UI observation.

### 2. Vendor account/model reachability

**Test:** Confirm OpenAI organization verification/rate-limit access and Anthropic billing tier for every catalog model.  
**Expected:** Each displayed service-key model is actually callable by the deployed account.  
**Why human:** Vendor dashboard/account state is external to the repository.

### 3. Saved default and one-call override UX

**Test:** Save an OpenAI default, reload a chapter, override to another provider for one successful send, and retry a failed send.  
**Expected:** The saved default is initially selected; a successful override resets to it; a failed send keeps the attempted selection; the saved default itself is unchanged.  
**Why human:** Requires database migration, authenticated browser flow, and visual/state-transition checks.

## Deferred-Item Filter

No blocker is deferred. Phase 10 explicitly depends on Phase 9 and adds BYOK key registration/model availability badges; Phase 11 adds BYOK invocation/usage/failure UX. Neither later phase's goal or success criteria promises to implement the missing platform-key adapters, Phase 9 account default/override, or provider-specific service-key pricing.

## Disconfirmation Pass

- **Partially met requirement sought:** none of the four Phase 9 requirements is partially wired; every one stops at the Phase 8 Gemini-only boundary.
- **Misleading passing test found:** Vitest exits 0 when explicitly filtered to the three missing Phase 9 test paths, printing `No test files found`; CI must not treat that command as evidence of implementation.
- **Uncovered error path found:** there is no OpenAI/Anthropic error path at all, so raw-error scrubbing, refusal normalization, missing-key classification, and Anthropic temperature omission have no executable coverage.

## Gaps Summary

The phase goal is not achieved. This is not a small wiring omission: Wave 0 through Wave 4 outputs are absent, the production path remains Gemini-only, and the product has no way to select, invoke, price, or persist defaults for OpenAI or Anthropic. The four grouped gaps in frontmatter are blocking and suitable input for `$gsd-plan-phase --gaps`; later phases do not absorb them.

---

_Verified: 2026-09-22T05:13:45Z_  
_Verifier: gsd-verifier_

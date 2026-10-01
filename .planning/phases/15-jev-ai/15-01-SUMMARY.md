---
phase: 15-jev-ai
plan: 01
subsystem: api
tags: [jev, typesafe-ai, zod, decision-layer]

requires: []
provides:
  - "DecisionClient/DecisionRequest/DecisionResult contract, independent of ProviderClient"
  - "createJevClient — validated TypeSafe AI adapter against the real /v1/systemone choice-question wire shape"
  - "toSanitizedDecisionError/DecisionCallError/logDecisionFailure error scrubbing boundary"
  - "JEV_CONFIDENCE_THRESHOLDS / JEV_ACTIVATION_THRESHOLDS / JEV_DEFAULT_TIMEOUT_MS config"
affects: [15-02, 15-08, 15-11]

tech-stack:
  added: []
  patterns:
    - "Vendor adapters translate wire shape to a project-owned contract at a single sanitized try/catch boundary (mirrors lib/ai/providers/errors.ts)"

key-files:
  created:
    - lib/ai/decision/types.ts
    - lib/ai/decision/errors.ts
    - lib/ai/decision/jev.ts
    - lib/ai/decision/config.ts
    - tests/ai/jev-client.test.ts
    - tests/ai/decision-contract.test.ts
  modified:
    - .env.example
    - .planning/STATE.md

key-decisions:
  - "Real Jev API (docs.typesafe.ai/api.md) uses a `questions` map of typed questions (choice/score/noul) with `criteria`, not a flat `candidates` array — DecisionRequest gained an `instructions` field and DecisionCandidate gained a required `label` (criteria description); jev.ts sends a single 'choice' question named `decision`."
  - "Fixed version tags are semver (`jev-1.13.0`), not the dated `jev-2026-XX-XX` format RESEARCH.md assumed. Aliases `jev-latest`/`jev-preview` move on release and are never used."
  - "modelVersion in DecisionResult prefers the response's own `model` field over the requested one, so drift between requested/served version is observable."
  - "HTTP 422 (request validation failed) maps to kind 'config', not 'unavailable' — it signals a shape bug on our side, not a transient vendor issue."

patterns-established:
  - "Adapter response schemas are validated with Zod at the single sanitized boundary; membership-checked against request candidates before being trusted."

requirements-completed: [AIDOC-01, AIDOC-04]

duration: ~45min (across interrupted/resumed sessions)
completed: 2026-09-27
---

# Phase 15 Plan 01: Jev DecisionClient contract + validated adapter Summary

**DecisionClient contract, sanitized error boundary, and a `createJevClient` HTTP adapter validated live against TypeSafe AI's real `/v1/systemone` choice-question API.**

## Performance

- **Duration:** ~45 min across sessions (initial Codex runs hit ChatGPT usage limits and were resumed)
- **Completed:** 2026-09-27
- **Tasks:** 3 (Task 1 auto, Task 2 human-action checkpoint, Task 3 auto/tdd)
- **Files modified:** 8

## Accomplishments
- `DecisionClient`/`DecisionRequest`/`DecisionResult` contract fully decoupled from `ProviderClient`
- `createJevClient` validates vendor responses with Zod, enforces candidate membership, times out via `AbortSignal.timeout`, and normalizes every failure mode (config/rate_limited/unavailable/invalid_response) through one sanitized boundary
- Adapter rewritten mid-plan to match the **real** TypeSafe AI wire shape (see Live Verification below) instead of the plan's original assumed shape
- Pre-registered activation thresholds and confidence thresholds in `lib/ai/decision/config.ts` — no file-based activation judgment code (15-REVIEWS 15-01 HIGH resolved)
- 18 unit tests (`jev-client.test.ts` + `decision-contract.test.ts`) passing, `npx tsc --noEmit` clean for this module

## Task Commits

Uncommitted at summary time — Task 1/3 code and tests exist in the working tree; a single commit will follow this summary once Wave 1 sibling plans (15-03, 15-10) are also reconciled, per the phase's parallel-wave execution.

## Files Created/Modified
- `lib/ai/decision/types.ts` - DecisionClient contract; added `instructions` (question text) and `DecisionCandidate.label` (criteria description) after live schema discovery
- `lib/ai/decision/errors.ts` - sanitized error boundary; added HTTP 422 → `config`
- `lib/ai/decision/jev.ts` - HTTP adapter sending `{state, model, questions:{decision:{type:'choice',instructions,criteria}}}`, parsing `{model, answers:{decision:{choice,probabilities,confidence}}}`
- `lib/ai/decision/config.ts` - confidence/activation thresholds, default timeout
- `tests/ai/jev-client.test.ts` - 11 cases covering config errors, success, model-field precedence, 429/422/529/network/timeout, bad JSON, unknown choice, schema mismatch, missing answer
- `tests/ai/decision-contract.test.ts` - 3 cases covering the contract shape and error normalization
- `.env.example` - `TYPESAFE_API_KEY`, `JEV_MODEL_VERSION`, `TYPESAFE_API_BASE_URL`, `JEV_TIMEOUT_MS`
- `.planning/STATE.md` - Blockers entry recording the Jev policy-review prerequisite and live verification result

## Decisions Made
See `key-decisions` above — the most consequential is the request/response shape rewrite after reading the real TypeSafe AI docs (`introduction`, `models.md`, `api.md`), since RESEARCH.md's assumed `candidates`/`key` shape did not match the vendor's `questions`/`answers` shape.

## Deviations from Plan

### Auto-fixed Issues

**1. [Schema correction] Request/response shape rewritten to match the real API**
- **Found during:** Task 2 follow-up, after the user pasted TypeSafe AI's actual documentation
- **Issue:** The plan's assumed wire shape (`{model, state, candidates:[{key}]}` → `{key, confidence, probabilities}`) does not exist on the real API. The real API is `{state, model, questions:{<id>:{type, instructions, criteria}}}` → `{model, answers:{<id>:{choice, probabilities, confidence}}}`, with three question types (choice/score/noul).
- **Fix:** Kept the project-owned `DecisionClient` contract (unchanged from the app's point of view aside from two added fields) and rewrote only `jev.ts`'s wire translation plus the Zod schema, error status mapping (422 added), and all tests.
- **Files modified:** `lib/ai/decision/types.ts`, `lib/ai/decision/jev.ts`, `lib/ai/decision/errors.ts`, `tests/ai/jev-client.test.ts`, `tests/ai/decision-contract.test.ts`
- **Verification:** 18/18 tests pass; a synthetic-data spike call to the real API (`https://api.typesafe.ai/v1/systemone`) returned HTTP 200 with a body matching the implemented schema exactly.

---

**Total deviations:** 1 (schema correction, essential for correctness — the plan's assumed schema would never have worked against the real vendor).
**Impact on plan:** No scope creep; the DecisionClient contract's shape as consumed by Plan 15-02/15-08/15-11 is preserved (candidates still need `key`, just gained a required `label`).

## Issues Encountered
- Codex CLI (`gpt-5.6-terra`, then `gpt-6-luna`) hit ChatGPT usage limits mid-run twice during Wave 1 execution; resumed after reset with no data loss (test files were preserved).
- `gpt-6-luna` initially failed with "not supported when using Codex with a ChatGPT account" on Codex CLI 0.154.0; resolved by updating to 0.157.1.

## Live Verification (Spike)

**Status: live verified** (not blocked — user completed TypeSafe AI account signup and provided `.env.local` values before this summary was written).

- Auth header: `Authorization: Bearer <API_KEY>` (confirmed)
- Endpoint: `POST https://api.typesafe.ai/v1/systemone` (confirmed, matches assumed default)
- Request schema: `{ state, model, questions: { "<id>": { type: "choice"|"score"|"noul", instructions, criteria } } }` — **differs from RESEARCH.md/plan assumption** (assumed flat `candidates` array)
- Response schema: `{ model, answers: { "<id>": { type, choice|score|noul, probabilities, confidence } }, usage: { input_tokens, output_tokens } }` — **differs from plan assumption** (assumed flat `{key, confidence, probabilities}`)
- Rate limit / error codes: 401 (invalid/missing key), 422 (request validation failed), 429 (rate limited, use exponential backoff), 529 (overloaded) — plan had assumed a generic 503 for overload; adapter's default `status >= 500 → unavailable` still covers 529 correctly
- Fixed version tag: **semver**, e.g. `jev-1.13.0` — not the dated `jev-2026-XX-XX` format assumed. Aliases are `jev-latest` / `jev-preview`.
- Synthetic spike call result: `HTTP_200`, body `{"model":"jev-1.13.0","answers":{"decision":{"type":"choice","choice":"candidate-a","confidence":0.7,"probabilities":{"candidate-a":0.85,"candidate-b":0.15}}},"usage":{...}}` — matches implemented Zod schema exactly, no adjustment needed after the rewrite.

No API key value is recorded anywhere in this document or in git.

## User Setup Required

None remaining — user completed TypeSafe AI signup and set `TYPESAFE_API_KEY`/`JEV_MODEL_VERSION=jev-1.13.0` in `.env.local`.

## Next Phase Readiness
- Plan 15-02 (two-stage Jev decision calls) can build directly on `DecisionClient`/`createJevClient` with real, verified wire behavior — no further schema guesswork needed.
- Plan 15-11's `getAiDocPlanningMode` activation gate is unaffected by this plan (no file-based activation code exists here, as required).
- Wave 1 siblings 15-03 and 15-10 are still in progress (interrupted by the same Codex usage-limit incidents) and must be reconciled/completed before Wave 1 as a whole is done.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*

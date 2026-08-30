---
phase: 04-ai-gateway-mention-based-generation
plan: 01
subsystem: api
tags: [gemini, ai-gateway, google-genai, cost-modeling, vitest, shadcn]

# Dependency graph
requires:
  - phase: 01-foundation-wallet-infrastructure
    provides: "wallet balance/ledger schema and PRICE_TIERS=[10,30,50,100] scale that lib/ai/cost.ts's conversion formula must produce sane behavior against"
provides:
  - "lib/ai/gemini.ts: GeminiClient interface, createGeminiClient() real factory, createMockGeminiClient() test factory, MODEL_TIER_TO_ID map"
  - "lib/ai/cost.ts: named wallet-token <-> Gemini-token exchange rate, PER_REQUEST_MAX_OUTPUT_TOKENS cap, computeMaxOutputTokens (D-13 pre-call cap), computeDebitAmount (post-call debit)"
  - "@google/genai@2.19.0 and textarea-caret installed; shadcn popover/command components generated"
  - "vitest.config.ts server-only alias enabling any lib/ file with the import 'server-only' marker convention to be unit-tested directly"
affects: [04-02, 04-03, 04-04, 04-05, 04-06]

# Tech tracking
tech-stack:
  added: ["@google/genai@^2 (pinned, not v3+)", "textarea-caret", "@types/textarea-caret", "shadcn popover/command (base-ui + cmdk)"]
  patterns:
    - "Dependency-injectable AI client (GeminiClient interface) — every caller takes a client param instead of importing GoogleGenAI directly, so tests never make a real billable call"
    - "Named, single-source-of-truth exchange-rate constants (KRW_PER_WALLET_TOKEN, USD_TO_KRW, GEMINI_PRICING_USD_PER_MILLION) instead of inlined magic numbers anywhere wallet tokens are converted to/from Gemini tokens"

key-files:
  created:
    - lib/ai/gemini.ts
    - lib/ai/cost.ts
    - tests/ai/gemini-client.test.ts
    - tests/ai/cost-estimate.test.ts
    - tests/helpers/server-only-stub.ts
  modified:
    - package.json
    - package-lock.json
    - vitest.config.ts
  generated:
    - components/ui/popover.tsx
    - components/ui/command.tsx
    - components/ui/input-group.tsx

key-decisions:
  - "systemInstruction passed inside GenerateContentParams.config (not as a top-level generateContent param) — verified against @google/genai@2.19.0's actual GenerateContentParameters type (model/contents/config only)"
  - "server-only aliased to a no-op stub in vitest.config.ts, project-wide — the real package throws unconditionally outside the react-server export condition, which plain-Node Vitest never sets, so any test importing a file with the repo's import 'server-only' convention would otherwise crash at import time"

patterns-established:
  - "lib/ai/*.ts business logic is fully vitest-testable even when it imports 'server-only', via the new vitest.config.ts alias — future Phase 4 plans (04-02..04-06) can rely on this"

requirements-completed: [EDIT-05]

# Metrics
duration: 15min
completed: 2026-08-30
---

# Phase 04 Plan 01: AI Gateway Foundation (Gemini Client + Cost Model) Summary

**Named wallet-token↔Gemini-token exchange rate and a fully mockable Gemini client (`@google/genai`) resolving 04-RESEARCH.md's two open design questions before any generation code exists.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-30T~14:57:00+09:00 (after resolving a stale-worktree sync issue)
- **Completed:** 2026-08-30T15:12:35+09:00
- **Tasks:** 3
- **Files modified:** 11 (3 created lib files, 2 created test files, 1 created test helper, 3 generated shadcn components, package.json/package-lock.json, vitest.config.ts)

## Accomplishments
- Resolved 04-RESEARCH.md Open Question 1 (wallet-토큰 ↔ Gemini-token exchange rate) with a named, tunable formula in `lib/ai/cost.ts` — two constants (`KRW_PER_WALLET_TOKEN`, `USD_TO_KRW`) are the entire exchange rate, everything else is derived math
- Resolved Open Question 2 (input vs. output token debiting) — `computeDebitAmount` bills actual post-call `promptTokenCount + candidatesTokenCount`, never the pre-call estimate
- Built `lib/ai/gemini.ts`'s `GeminiClient` interface (Pitfall 4) — every later plan's generation code takes this as a dependency instead of importing `@google/genai` directly, so no test suite run can make a real, billable API call
- Implemented D-13's cap-then-debit lifecycle: `computeMaxOutputTokens` reserves input cost first, caps remaining balance's output budget at `PER_REQUEST_MAX_OUTPUT_TOKENS` (2048)
- Installed `@google/genai@2.19.0` (pinned `^2`, not v3+ per 04-RESEARCH.md's Node 22 minimum warning), `textarea-caret`, and generated shadcn `popover`/`command` components for later plans (04-06's `@` mention picker)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Gemini SDK, caret library, and shadcn popover/command** - `9250a8f` (chore)
2. **Task 2: Mockable Gemini client interface (Pitfall 4)** - `7689f03` (feat, includes a deviation fix)
3. **Task 3: Wallet-token ↔ Gemini-token conversion + D-13 cap/debit math** - `bec8dd9` (feat)

**Plan metadata:** committed separately as the final docs commit for this plan (see below)

## Files Created/Modified
- `lib/ai/gemini.ts` - `GeminiClient` interface, `createGeminiClient()`/`createMockGeminiClient()` factories, `MODEL_TIER_TO_ID`
- `lib/ai/cost.ts` - exchange-rate constants, `walletTokensPerGeminiToken`/`geminiTokensPerWalletToken`, `computeMaxOutputTokens`, `computeDebitAmount`
- `tests/ai/gemini-client.test.ts` - 4 tests covering `MODEL_TIER_TO_ID`, missing-API-key error, mock defaults, mock overrides
- `tests/ai/cost-estimate.test.ts` - 7 tests covering conversion rates, D-13 cap cases (0 / 2048 / 89), and the debit calculation
- `tests/helpers/server-only-stub.ts` - no-op stub module for the `server-only` marker package under test
- `vitest.config.ts` - added `resolve.alias` entry routing `server-only` to the stub
- `package.json` / `package-lock.json` - added `@google/genai`, `textarea-caret`, `@types/textarea-caret`
- `components/ui/popover.tsx`, `components/ui/command.tsx`, `components/ui/input-group.tsx` - shadcn-generated, unmodified from generator output (input-group.tsx is command.tsx's own generated dependency)

## Decisions Made
- `systemInstruction` goes inside `generateContent`'s `config` object, not as a top-level parameter — the plan's reference code passed it top-level, but `@google/genai@2.19.0`'s actual `GenerateContentParameters` type only accepts `model`/`contents`/`config`. Verified directly against `node_modules/@google/genai/dist/genai.d.ts` before writing the file, so the implementation type-checks and matches the SDK's real shape rather than the plan's illustrative pseudocode.
- Every numeric formula in `lib/ai/cost.ts` (conversion rates, all three `computeMaxOutputTokens` cases, the debit case) was hand-verified against the plan's exact expected test values via a Node one-off script before writing the implementation, confirming the plan's formulas were internally consistent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Aliased `server-only` to a no-op stub for Vitest**
- **Found during:** Task 2 (Mockable Gemini client interface)
- **Issue:** `lib/ai/gemini.ts` follows the project's `import 'server-only'` convention (mirroring `lib/supabase/admin.ts`). The real `server-only` package (`node_modules/server-only/index.js`) throws unconditionally unless imported under the `react-server` export condition, which Next.js sets but plain-Node Vitest does not. Running `npx vitest run tests/ai/gemini-client.test.ts` failed immediately with "This module cannot be imported from a Client Component module" before any test executed — this is the exact acceptance criterion the plan required to pass.
- **Fix:** Added a `resolve.alias` entry in `vitest.config.ts` mapping `server-only` to a new `tests/helpers/server-only-stub.ts` (an empty module). This is scoped to the test runner only — the real Next.js build/runtime still uses the genuine `server-only` package and its real guarantee is unaffected.
- **Files modified:** `vitest.config.ts`, `tests/helpers/server-only-stub.ts`
- **Verification:** `npx vitest run tests/ai/gemini-client.test.ts tests/ai/cost-estimate.test.ts` → 2 files, 11 tests, all passing
- **Committed in:** `7689f03` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the plan's own stated acceptance criteria (test suite must pass with 0 failures). No scope creep — the fix is isolated to test tooling and also benefits any future test of `lib/supabase/admin.ts` or other `server-only` files, none of which existed before.

## Issues Encountered
- The worktree assigned to this execution was initially stale (its branch's HEAD predated all of Phase 4's planning commits, including the `04-01-PLAN.md` this summary documents). Resolved by merging the shared repo's `master` branch (which had the current Phase 4 planning history) into the worktree's branch — the worktree had no uncommitted changes, so this was a safe fast-forward-style merge with no conflicts. Not a plan deviation; a pre-execution environment issue.
- `npx tsc --noEmit` reports one pre-existing, unrelated error: `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`. This is a Next.js 16 generated global type normally emitted by `next dev`/`next build` into `.next/types`, not something introduced by this plan's changes (confirmed present in `app/layout.tsx` before Task 1 ran). Logged to `.planning/phases/04-ai-gateway-mention-based-generation/deferred-items.md` per the scope-boundary rule rather than fixed, since it's unrelated to any file this plan touches.
- The broader `npx vitest run` (full suite) shows pre-existing failures in `tests/wallet/ledger.concurrency.test.ts` and other integration tests requiring a live Supabase URL/service-role key not configured in this sandboxed worktree environment. These are unrelated to `lib/ai/*` and were not touched by this plan; the plan's own `<verification>` block only requires the two new AI test files, which pass cleanly (11/11).

## User Setup Required

**External service requires manual configuration before Plan 04-04 (generate Server Action) can make a real Gemini call.** Per this plan's `user_setup` frontmatter:
- Create a `GEMINI_API_KEY` at https://aistudio.google.com/apikey (Google AI Studio)
- Add it to `.env.local` as `GEMINI_API_KEY=...`
- Add the empty key to `.env.example` for documentation, matching the existing `NEXT_PUBLIC_SUPABASE_URL=` pattern

This plan's own test suite does not require the key — `createMockGeminiClient()` is used in all tests, and `createGeminiClient()`'s missing-key path is itself tested (it throws, not silently degrades).

## Next Phase Readiness
- `lib/ai/gemini.ts` and `lib/ai/cost.ts` are ready for Plan 04-04 (`generate.ts` Server Action) to call `computeMaxOutputTokens` before `GeminiClient.generateContent`, per D-13's "cap applied up front" requirement.
- shadcn `popover`/`command` are installed and verified to compile, ready for Plan 04-06 to extend with a virtual `anchor` prop for the `@` mention picker.
- No blockers for subsequent Phase 4 plans.

## Known Stubs

None — this plan's deliverables (`lib/ai/gemini.ts`, `lib/ai/cost.ts`) are pure business-logic modules with no UI data-binding; there is no rendering surface that could silently receive empty/mock data in this plan's scope.

---
*Phase: 04-ai-gateway-mention-based-generation*
*Completed: 2026-08-30*

## Self-Check: PASSED

All 10 claimed files confirmed present on disk (lib/ai/gemini.ts, lib/ai/cost.ts, tests/ai/gemini-client.test.ts, tests/ai/cost-estimate.test.ts, tests/helpers/server-only-stub.ts, components/ui/popover.tsx, components/ui/command.tsx, components/ui/input-group.tsx, deferred-items.md, this SUMMARY.md). All 3 task commits confirmed in `git log` (`9250a8f`, `7689f03`, `bec8dd9`).

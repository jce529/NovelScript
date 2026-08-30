---
phase: 04-ai-gateway-mention-based-generation
plan: 04
subsystem: ai
tags: [gemini, wallet, tdd, vitest, server-actions]

# Dependency graph
requires:
  - phase: 04-ai-gateway-mention-based-generation (04-01 cost/gemini math, 04-02 mentions, 04-03 prompt composition)
    provides: computeMaxOutputTokens/computeDebitAmount, getMentionedNodesContent, composeSystemInstruction/assembleUserContent
provides:
  - "lib/ai/generate.ts: estimateCost() (EDIT-05) and generate() (EDIT-04, D-13) — full generate -> cap -> debit -> return lifecycle"
  - "app/studio/[workId]/chapters/[chapterId]/actions.ts: estimateCostAction/generateAction authenticated Server Actions"
affects: [04-05-ai-panel-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["createAdminClient() for wallet reads/writes to bypass RLS (mirrors app/account/actions.ts precedent)", "cap-before-call, debit-after-call using actual post-call usageMetadata"]

key-files:
  created: [lib/ai/generate.ts, tests/ai/generate-action.test.ts]
  modified: ["app/studio/[workId]/chapters/[chapterId]/actions.ts"]

key-decisions:
  - "generate()/estimateCost() take the session supabase client for ownership-scoped KB content reads but always create their own createAdminClient() internally for wallet reads/writes — the session client cannot write wallets/ledger_entries under RLS (no update policy on wallets, no insert policy on ledger_entries, apply_wallet_delta is not security definer)"
  - "maxOutputTokens <= 0 short-circuits BEFORE calling client.generateContent — the hard-stop case never touches the paid API"

requirements-completed: [EDIT-04, EDIT-05]

# Metrics
duration: 12min
completed: 2026-08-30
---

# Phase 4 Plan 4: Generate/EstimateCost Lifecycle Summary

**`lib/ai/generate.ts` implements the full generate -> cap -> debit -> return lifecycle: pre-call token estimate, D-13 cap-before-call from remaining wallet balance, actual post-call usage debit via `apply_wallet_delta` through a service-role admin client (fixing an RLS gap this plan's own planning pass discovered), wired as two authenticated Server Actions.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-30T15:23:00Z
- **Completed:** 2026-08-30T15:35:00Z
- **Tasks:** 3 (TDD RED + GREEN + Server Action wiring)
- **Files modified:** 3

## Accomplishments
- `estimateCost()`: pure input-side token count via `client.countTokens()`, no wallet read or write — matches EDIT-05/D-12
- `generate()`: reads wallet balance via `createAdminClient()`, computes `maxOutputTokens` from the remaining balance BEFORE calling Gemini, hard-stops with `{ ok: false, wasCapped: true, remainingBalance: 0 }` when the balance is already exhausted (never calls `generateContent`), and debits the wallet with the ACTUAL post-call `promptTokenCount`/`candidatesTokenCount` via `apply_wallet_delta` — never the pre-call estimate (Pitfall 2)
- Wallet RLS Gap fixed: `supabase/migrations/0001_init.sql` grants only SELECT policies on `wallets`/`ledger_entries` and `apply_wallet_delta` is not `security definer`, so the session client cannot call it. `generate()` uses `createAdminClient()` for all wallet I/O, mirroring `app/account/actions.ts`'s existing precedent for the identical problem — no RLS policy or migration change was made
- `estimateCostAction`/`generateAction` added to the chapter editor route's `actions.ts`, both resolving `ownerId` from `supabase.auth.getUser()` (never client input) and degrading gracefully to a Korean error message if `GEMINI_API_KEY` is unset

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write failing generate/estimateCost test suite** - `cd8c52e` (test)
2. **Task 2 (GREEN): Implement lib/ai/generate.ts** - `3ffa8e9` (feat)
3. **Task 3: Wire estimateCost/generate as Server Actions** - `18b7fdc` (feat)

_TDD: RED confirmed (module not found) before GREEN implementation; both tasks committed separately._

## Files Created/Modified
- `tests/ai/generate-action.test.ts` - 4 test cases covering actual-usage debit, D-13 hard-stop, D-13 partial-generation cap, and estimateCost's wallet-free token count, using a mocked `GeminiClient` against the real wallet/ledger schema
- `lib/ai/generate.ts` - `EstimateCostInput`, `EstimateCostResult`, `GenerateInput`, `GenerateResult`, `estimateCost()`, `generate()`, `AI_GENERATION_REFERENCE_TYPE`
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` - added `estimateCostAction`, `generateAction`, `AiGenerationInput`, `getGeminiClientOrError()`

## Decisions Made
- Followed the plan's exact reference implementation for the test suite, `lib/ai/generate.ts`, and the Server Action wiring — no deviation from the specified exports, wallet-RLS-gap fix approach, or cap/debit math was needed since the plan's `<action>` blocks were already a complete, directly-runnable contract that matched the landed Plan 04-01/02/03 interfaces exactly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- This worktree's branch was several commits behind `master` (missing all Phase 04 planning docs and Plans 04-01/02/03's landed code) at execution start; fast-forward-merged `master` into the branch before reading the plan. No conflicts.
- This worktree was also missing `.env.local` (gitignored, not copied when the worktree was created) — copied it from the main repo checkout so the Supabase-backed test suite could run. This is a worktree-provisioning gap, not a code issue; no code changes were made because of it.
- `tests/discovery/feed.test.ts` (Phase 3, `lib/discovery/actions.ts` — unrelated to this plan) has 6-8 flaky failures in its "popular" sort cases. Confirmed via `git stash` that this reproduces identically without any of this plan's changes applied. Logged to `.planning/phases/04-ai-gateway-mention-based-generation/deferred-items.md`, not fixed (out of scope — Rule: only fix issues directly caused by the current task's changes).
- `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'` — pre-existing `npx tsc --noEmit` error already logged in this phase's `deferred-items.md` by Plans 04-01/04-02; confirmed still present and still unrelated to this plan's changes (`git stash` reproduces it identically).

## User Setup Required

None beyond what Plan 04-01 already documented (`GEMINI_API_KEY` in `.env.local`/deployment env) — no new external service configuration required by this plan.

## Next Phase Readiness
- `estimateCostAction`/`generateAction` are ready for Plan 04-05's AiPanel UI to call directly — both take `AiGenerationInput` (workId, modelTier, mentionedNodeIds, presetLevel, customInstruction, styleId, genre, precedingText) plus `generateAction`'s additional `chapterId`/`regenerationFeedback`.
- No blockers for Plan 04-05.

---
*Phase: 04-ai-gateway-mention-based-generation*
*Completed: 2026-08-30*

## Self-Check: PASSED

- FOUND: lib/ai/generate.ts
- FOUND: tests/ai/generate-action.test.ts
- FOUND: app/studio/[workId]/chapters/[chapterId]/actions.ts
- FOUND: cd8c52e
- FOUND: 3ffa8e9
- FOUND: 18b7fdc

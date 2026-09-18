---
phase: 08-provider-adapter-idempotent-debit
plan: 09
subsystem: verification
tags: [checkpoint, human-verify, live-gemini, fixture, validation]
requires:
  - phase: 08-06
    provides: real-DB ledger concurrency evidence
  - phase: 08-07
    provides: AiPanel wired to send lifecycle and notices
  - phase: 08-08
    provides: dev-only provider fixture
provides:
  - Recorded automated + browser + live-provider evidence in 08-VALIDATION.md
  - bugs/ folder documenting findings (BUG-01..06)
affects: [09]
key-files:
  created:
    - .planning/phases/08-provider-adapter-idempotent-debit/deferred-items.md
    - .planning/phases/08-provider-adapter-idempotent-debit/bugs/README.md
  modified:
    - .planning/phases/08-provider-adapter-idempotent-debit/08-VALIDATION.md
    - lib/ai/chat.ts
    - lib/ai/cost.ts
completed: 2026-09-18
---

# Phase 08 Plan 09: Verification checkpoint Summary

**Browser + live Gemini verification passed for every phase-8 behavior; local input-token estimate removed by user decision after live calibration.**

## What was verified

- **Automated gate:** `tsc` clean, offline suite green, real-DB ledger concurrency 24/24, no runtime `countTokens`.
- **Fixture states (Chrome, dev fixture):**
  - B `slow` double-click / Enter → one bubble, one debit.
  - C refusal-input / refusal-output → Korean notice, collapsed keyboard-toggleable reason, input restored.
  - D rate_limited / unavailable / config → correct copy, retry focus, no charge.
  - E drop-response → one debit, and the retry returns `이미 처리된 요청이에요`.
  - F network failure → unavailable notice.
- **Live Gemini (A):**
  - @mention context reaches the model.
  - Draft insert works.
  - Presets and styles produce the expected tone.
  - Proposal is parsed.
  - Regenerate uses a new key; reject removes the turn.
  - Each call debits once.
- **Balance:** the account panel refreshes after each call and matches `wallets.balance`.

## Deviations

- **[User decision] Removed the local input-token estimate** (commit 4744506).
  - Live calibration showed the estimate running ~3× over the reported input tokens.
  - The output cap now derives from the whole balance.
  - The debit is actual usage, clamped to the pre-call balance, so a near-empty wallet still receives the capped body.
  - `lib/ai/token-estimate.ts` and `ProviderClient.estimateInputTokens` were deleted.
- **Build red:** `npm run build` fails on the `/admin` prerender. This is pre-existing (phase 7) and is tracked as BUG-03 / deferred.

## Issues found (see bugs/)

- **BUG-01:** proposal save fails when a category folder has a same-category subfolder (phase 4).
- **BUG-02:** the mention list does not select on Enter.
- **BUG-03:** `/admin` build failure.
- **BUG-04:** thinking tokens are not debited. This is a billing-policy decision that is still pending.
- **BUG-05:** fixture env persists after the fixture file is removed until the dev server restarts.
- **BUG-06:** horizontal overflow at a ~958px viewport (needs repro).

## Self-Check: PASSED

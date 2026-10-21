---
phase: 11-byok-ux
plan: "10"
subsystem: ai-billing
tags: [cost-02, idempotency, ai_usage, settlement, byok, chat]
requires:
  - "11-09: migration 0030 settle_service_ai_generation + ai_usage.service_settled_at"
  - "04-07: composeSystemInstruction customInstruction/workSystemInstruction"
provides:
  - "Service completion marker (ai_usage.service_settled_at) as the replay guard; atomic RPC settlement"
  - "ChatInput.customInstruction / workSystemInstruction forwarded on the general chat path"
affects:
  - "04-09 (consumes the chat instruction contract; depends_on must add 11-05 and 11-10)"
  - "11-12 (runs the live-DB chat.test.ts assertions)"
tech-stack:
  added: []
  patterns:
    - "completion lookup on ai_usage with legacy ledger fallback; re-check under wallet lease"
    - "settlement RPC failure -> marker re-read (lost response -> already_processed)"
key-files:
  created:
    - tests/ai/chat-contract.test.ts
  modified:
    - lib/ai/paid-generation.ts
    - lib/ai/chat.ts
    - tests/helpers/fake-ledger-admin.ts
    - tests/ai/paid-generation.test.ts
    - tests/ai/chat-idempotency.test.ts
    - tests/ai/chat-refusal.test.ts
    - tests/ai/chat.test.ts
decisions:
  - "Service completion = ai_usage row with service_settled_at set (or any BYOK row); unsettled service telemetry is not a completion"
  - "Unreported refusal writes no usage/ledger and returns refused with debit 0 so the same key can be retried (D-12); reported refusal with 0 tokens writes usage1/ledger0"
  - "The service marker is part of settlement (not best-effort): RPC failure without a marker on re-read is a settlement failure, never a 0-cost body without a marker"
  - "No automatic RPC retry; legacy ai_generation ledger rows (incl. delta-0) still block replay"
metrics:
  duration: "~40m (continuation)"
  completed: 2026-10-19
requirements: [COST-02, BYOK-06, EDIT-03]
---

# Phase 11 Plan 10: ai_usage service completion marker and atomic settlement Summary

The service generation path now treats an `ai_usage` row with `service_settled_at` set as the replay guard. Settlement goes through the 0030 RPC `settle_service_ai_generation` only, so a zero-cost completion leaves usage 1 / ledger 0 / balance unchanged. A same-key resend never calls the provider again. The general `chat()` path also forwards `customInstruction`/`workSystemInstruction` to `composeSystemInstruction`.

## Tasks

| Task | Name | Commit | Notes |
| ---- | ---- | ------ | ----- |
| 1 | Extend fake and write RED tests (previous executor) | 89a463b | fake ai_usage, 0030 RPC, rollback, lost response, lookup error injection |
| 2 | Service path on usage completion lookup + atomic RPC | 7626a03 | GREEN: paid-generation/ai-usage/byok-generation 68/68 |
| 3 | Chat instruction forwarding + chat unit/live-DB replay contract | aaa9173 | GREEN: 10 files 196/196 |

## TDD evidence

- **Task 1 RED:** 89a463b (previous executor). Covers the zero-cost marker, unsettled telemetry, lease re-check, and settlement failure before and after commit.
- **Task 2 GREEN:** The leftover `lib/ai/paid-generation.ts` edit was reviewed against the plan and the 0030 SQL (the p_usage whitelist matches, and refused requires reported tokens). It was kept as is. `paid-generation.test.ts`, `ai-usage.test.ts` and `byok-generation.test.ts` pass 68/68.
- **Task 3:**
  - (a) `chat-contract.test.ts` against the HEAD `chat.ts` gave 3 behavior failures and 6 passes. The failures were freeform custom, intermediate work, and freeform both, so the RED was in behavior, not import. With the new `chat.ts` it passes 9/9.
  - (b) After the RPC change, `chat-idempotency` and `chat-refusal` had 17 old `apply_wallet_delta` and delta-0 assertions failing. They were rewritten for the new contract and pass 36 + 15. The rewrite kept the old meaning:
    - The positive-cost debit is checked as `p_debit_amount` and ledger `delta`, both equal to `computeDebitAmount`.
    - The zero-cost test was renamed rather than deleted.
  - New cases cover:
    - settlement failure before commit, as both an rpc error and a throw (no body, nothing recorded, same-key manual retry)
    - commit followed by a lost response, as rpc error and as throw (re-read gives already_processed, one debit)
    - a re-read error
    - a usage lookup error
    - a settled usage row from another owner
    - unsettled telemetry
    - a drained balance of 0 followed by a replay
    - legacy delta-0 compatibility
    - a racing settlement
    - provider failure then retry
    - refusals, with unreported, reported-0 and positive reported kept as separate cases
  - (c) Live-DB `tests/ai/chat.test.ts`: the "delta-0 row" test became "completed usage marker (no ledger row)". It now asserts usage 1 with `service_settled_at` not NULL, ledger 0, balance 1000, and replay provider calls 0. A drained-balance replay test was also added. These were type-checked only and not run.
- Final unit verify (10 files): 196/196 passed.
- `npx tsc --noEmit`: only 2 errors, both in `components/admin/report-queue.tsx`, which is not this plan's file and is being edited concurrently. Logged as out of scope.

## Existing data compatibility

- `findCompletedGeneration` checks ai_usage first. If there is no row, or only an unsettled service row, it falls back to the legacy `ledger_entries` (`wallet_id`/`ai_generation`/`reference_id`) lookup. Historical delta-0 rows still block replay.
- New zero-cost completions never create ledger rows.

## Deviations from Plan

- **[Scope note] Task 2:** The previous executor's uncommitted `paid-generation.ts` edit already matched the plan, so it was reviewed and committed without changes.
- **[Rule 3] `chat-idempotency` "settlement failure" lease case:** `debitError` was switched to `settleError`. The service path no longer calls `apply_wallet_delta`, so the old injection point no longer exercised the failure.
- No CLAUDE.md-driven adjustments. STATE.md and ROADMAP.md were not edited and graphify was not run, per orchestrator instruction.

## Gaps / pending (gate 11-12)

- The live-DB `tests/ai/chat.test.ts` (`--project db`) has not been run. Migration 0030 is not applied to the shared project. 11-12 Task 1 must show failed 0 / skipped 0.
- 04-09 must add 11-05 and 11-10 to its depends_on and pass validated `customInstruction` and the server-read `workSystemInstruction` from the Server Action. The document-plan internal composition is also 04-09's work.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: lib/ai/paid-generation.ts, lib/ai/chat.ts, tests/ai/chat-contract.test.ts, tests/helpers/fake-ledger-admin.ts
- FOUND commits: 89a463b, 7626a03, aaa9173

---
phase: 08-provider-adapter-idempotent-debit
plan: 03
subsystem: ai
tags: [idempotency, wallet-debit, refusal, provider-errors, COST-01]
requires:
  - 08-01 (ProviderClient, MODEL_TIER_TO_ID, errors.ts, chat-result.ts)
provides:
  - lib/ai/chat.ts chat(supabase, client: ProviderClient, input: ChatInput & { idempotencyKey })
  - tests/helpers/mock-provider.ts (createMockProvider, okResult)
  - tests/helpers/fake-ledger-admin.ts (createFakeLedgerAdmin)
affects: [08-05 (actions.ts must pass ProviderClient + idempotencyKey), 08-07]
tech-stack:
  added: []
  patterns: [ledger-keyed idempotency, fail-closed precheck, settlement recovery re-read, allowlist provider logging]
key-files:
  created:
    - tests/helpers/mock-provider.ts
    - tests/helpers/fake-ledger-admin.ts
    - tests/ai/chat-idempotency.test.ts
    - tests/ai/chat-refusal.test.ts
  modified:
    - lib/ai/chat.ts
    - lib/ai/cost.ts (comments only)
    - tests/admin/sanctions.test.ts
    - tests/ai/chat.test.ts
decisions:
  - "Debit reference_id = caller idempotencyKey; recorded key → already_processed before cap/provider; lookup error fails closed (unavailable)"
  - "Pre-debit ledger recheck + post-error scoped re-read; debit throw treated like RPC error; no clamp, no retry with new key"
  - "Structured refusal charged by reported usage via same steps as completion, returned without body; checked before parseChatResponse"
metrics:
  duration: ~20min
  completed: 2026-09-17
  tasks: 3
  files: 8
---

# Phase 8 Plan 03: Idempotent Chat Orchestration Summary

`chat()` now runs on ProviderClient: write-access check → ledger precheck (fail closed) → local token-estimate cap → provider → D-07 recheck → pre-debit ledger recheck → `apply_wallet_delta` with `p_reference_id: input.idempotencyKey` → settlement recovery → refusal branch → normal parse. COST-01's random-UUID double-debit bug is gone.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Test harness + idempotent debit, precheck, local cap, settlement recovery | e25ee91 |
| 2 | Refusal branch, provider error kinds, sanitized logging | 5d906d2 |
| 3 | Migrate sanctions + chat integration tests to ProviderClient | 0a361e4 |

## Verification

- `tests/ai/chat-idempotency.test.ts` (16), `chat-refusal.test.ts` (14), `admin/sanctions.test.ts`, `prompt-composition`, `cost-estimate`: 110/110 pass.
- `tests/ai/chat.test.ts` (real DB): 11/11 pass.
- `npx tsc --noEmit`: only `app/studio/[workId]/chapters/[chapterId]/actions.ts` (GeminiClient → ProviderClient) errors — expected, migrated in 08-05.
- Acceptance greps: no `randomUUID`/`countTokens`/`lib/ai/gemini` in chat.ts; `if (result.refusal)` (line 216) precedes `parseChatResponse(result.text)` (223); cost.ts diff is comment-only.

## Deviations from Plan

**1. [Rule 2 - Test harness] Extra fake-ledger options**
- Added `ledgerLookupError: number[]` (per-lookup index), `debitError: 'throw'`, and `beforeDebit` hook to `createFakeLedgerAdmin` so the "row inserted by a racing request then debit errors" and "settlement re-read also errors" cases exercise the post-debit re-read path specifically (not just the pre-debit recheck).

## Known Stubs

None.

## Notes

- Residual risk documented in JSDoc: two same-key requests passing the precheck concurrently may both call the provider; the ledger unique constraint still guarantees one debit. When balance covers both, the conflicting RPC returns the current balance without error, so the loser may also report `completed` (allowed by plan behavior).
- `graphify update .` run; `graphify-out/` left uncommitted (shared generated artifacts).

## Self-Check: PASSED

- All 4 created files and 4 modified files exist.
- Commits e25ee91, 5d906d2, 0a361e4 present in git log.

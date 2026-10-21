---
phase: 04-ai-gateway-mention-based-generation
plan: "11"
subsystem: ai-panel
tags: [wallet, gauge, byok, refresh, rls]
requires: ["04-10"]
provides:
  - "Read-only wallet status (balance + latest real ai_generation debit) via session action"
  - "WalletBalanceGauge (service numbers/bar, BYOK exact no-charge copy)"
  - "Sequenced wallet refresh controller wired into AiPanel and SaveDocumentPlanModal"
affects: [AiPanel, SaveDocumentPlanModal]
requirements: []
key-files:
  created:
    - lib/ai/wallet-status.ts
    - lib/ai/wallet-refresh.ts
    - app/studio/ai-wallet-actions.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/WalletBalanceGauge.tsx
    - tests/ai/wallet-status.test.ts
    - tests/ai/wallet-balance-gauge.test.ts
    - tests/ai/wallet-refresh.test.ts
  modified:
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
metrics:
  completed: 2026-10-19
---

# Phase 4 Plan 11: Wallet balance gauge Summary

Read-only wallet gauge in the AI panel: service models show held tokens and the most recent real AI debit with a comparison bar, BYOK shows exactly "내 키로 호출해요 · 지갑 토큰은 차감되지 않아요", and the value is re-read (not just router.refresh) after every settled attempt.

## Commits
- b6b8aee Task 1: wallet-status DAL + loadAiWalletStatusAction (RLS client, session user only, failures never become 0; filters reference_type=ai_generation, delta<0, created_at desc/id desc, limit 1)
- 524979f Task 2: WalletBalanceGauge (+ wallet-refresh.ts types/controller, committed here because the gauge imports its state type)
- f2fb3ed Task 3: AiPanel/SaveDocumentPlanModal wiring + wallet-refresh tests

## Behavior
- Refresh triggers: mount/workId change, window focus, explicit retry, chat success, notice with refreshBalance (refusal/already processed), response lost/settlement error, template regeneration resolve or throw.
- Controller applies only the latest request; dispose (unmount/workId change) applies nothing. No provider send, new key, or ledger write in the refresh path (asserted statically).
- 04-10 cappedReason/toast/bubble, same-key retry and replacement-consent flows untouched.
- Old top BYOK sentence moved into the gauge (no duplicate); exampleCost line for service kept.

## Deviations from Plan
- [Rule 2] SaveDocumentPlanModal: added a synchronous regeneration lock (ref) and clear replacement consent on close and folder/template change, per the plan's "minimal transition" paragraph. No Phase 11 test files edited.
- wallet-refresh.ts landed in the Task 2 commit instead of Task 3 (type dependency).
- AiPanel wiring is verified by static source assertions in wallet-refresh.test.ts, not a mounted hook-harness test (ai-panel-model.test.ts is outside this plan's files).

## Verification
- `vitest --project unit`: wallet-status (14), wallet-balance-gauge (5), wallet-refresh, ai-panel-model, save-document-plan-modal, capped-reason, ai-panel-notice: 7 files / 87 tests passed.
- Repo `npx tsc --noEmit`: clean.

## Gaps / pending
- `tests/ai/capped-ux.test.ts` (Phase 11-13) does not exist yet; the plan's verify command lists it. Not run; external verification pending, so 04-11 shouldn't be treated as fully closed on that axis.
- No live-DB, browser, or real-provider checks (RLS reads of wallets/ledger_entries, actual gauge in browser): deferred to gate 04-12.
- graphify update not run (per instruction).

## Known Stubs
None.

## Self-Check: PASSED

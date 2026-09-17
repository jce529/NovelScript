---
phase: 08-provider-adapter-idempotent-debit
plan: 04
subsystem: ai
tags: [idempotency, send-lock, refusal-ux, notice, client]
requires:
  - 08-01 (ChatResult, CHAT_COPY, REFUSAL_REASON_CODES)
provides:
  - lib/ai/chat-request.ts (createSendAttempt, createSendLock, resolveChatOutcome, thrownChatNotice, formatRefusalMeta, formatTokens, REFUSAL_REASON_DESCRIPTIONS, ChatNotice, ChatOutcome)
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice.tsx (AiPanelNotice)
affects: [08-07]
tech-stack:
  added: []
  patterns: [frozen send attempt reused on retry, synchronous closure lock, pure result->notice decision table, static-markup component tests]
key-files:
  created:
    - lib/ai/chat-request.ts
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice.tsx
    - tests/ai/chat-request-lifecycle.test.ts
    - tests/ai/ai-panel-notice.test.ts
  modified: []
decisions:
  - "Send attempt payload is structuredClone + deep-frozen so later history mutation cannot alter a retried request"
  - "Error notices: removeUserTurn/restoreInput = !retryable; titles from CHAT_COPY for rate_limited/unavailable/config/settlement/insufficient_balance, server error text (fallback CHAT_COPY.unknown) otherwise"
  - "status 'refused' without a refusal object falls through to the unknown error notice"
  - "Retry button rendered only for retryable error notices; refusal/processed never retry"
metrics:
  duration: ~6min
  completed: 2026-09-17
  tasks: 2
  files: 4
---

# Phase 8 Plan 04: Client Send Lifecycle and AiPanelNotice Summary

Pure client-side COST-01 pieces (frozen idempotency-keyed send attempts, synchronous send lock, UI-SPEC ChatResult -> notice decision table with Korean copy) plus the presentational `AiPanelNotice` component, all under offline tests; AiPanel wiring is left for 08-07.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | Send attempt, send lock, result -> notice mapping | 06d9641 |
| 2 | AiPanelNotice presentational component | a316daa |

TDD per task (test file failed on missing module, then green). `npx vitest run tests/ai/chat-request-lifecycle.test.ts tests/ai/ai-panel-notice.test.ts`: 29/29 pass. `npx tsc --noEmit` reports no errors in this plan's files. Acceptance greps (no server-only, 'use client' = 1, no primary color classes, no .test.tsx) pass. `graphify update .` run; graphify-out/ left uncommitted.

## Deviations from Plan

None - plan executed as written. (Tests and implementation were committed together per task rather than as separate RED/GREEN commits.)

## Deferred Issues

- `npx tsc --noEmit` shows errors in `tests/ai/chat-idempotency.test.ts` (ChatInput.idempotencyKey, ProviderClient vs GeminiClient) — that file belongs to a parallel wave-2/later plan whose implementation is in progress; not touched here.

## Known Stubs

None.

## Self-Check: PASSED

- All 4 created files exist.
- Commits 06d9641, a316daa present in git log.

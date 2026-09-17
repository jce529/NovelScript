---
phase: 08-provider-adapter-idempotent-debit
plan: 07
subsystem: ai-panel-client
tags: [client, idempotency, notice, router-refresh, cleanup]
requires:
  - phase: 08-04
    provides: chat-request lifecycle helpers + AiPanelNotice
  - phase: 08-05
    provides: chatAction with idempotencyKey
provides:
  - AiPanel per-send key lifecycle, send lock, notice slot, retry/regenerate semantics, balance refresh
  - Single Gemini path (legacy lib/ai/gemini.ts removed)
affects: [08-09 browser checkpoint]
tech-stack:
  added: []
  patterns: [frozen SendAttempt snapshot reused on retry, synchronous ref lock before first await, always-mounted aria-live slot with empty:hidden]
key-files:
  created: []
  modified:
    - app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
    - vitest.config.ts
  deleted:
    - lib/ai/gemini.ts
    - tests/ai/gemini-client.test.ts
key-decisions:
  - "runAttempt is the single chatAction entry; lock acquired as first statement, released in finally"
  - "Notice DOM id is a local sequence (ai-notice-N), never the idempotency key"
requirements-completed: [PROV-01, COST-01]
duration: 6min
completed: 2026-09-17
---

# Phase 8 Plan 07: AiPanel Send Lifecycle + Legacy Gemini Removal Summary

AiPanel now sends each message as a frozen SendAttempt with its own idempotencyKey behind a synchronous send lock, renders refusal/processed/failure outcomes in an inline AiPanelNotice slot instead of toast.error, refreshes the header balance via router.refresh(), and the legacy lib/ai/gemini.ts client is gone.

## Task Commits
1. Task 1: `1d00ee9` feat(08-07): wire AiPanel send lifecycle, notice slot and balance refresh
2. Task 2: `a335f77` refactor(08-07): remove legacy lib/ai/gemini.ts client

## Accomplishments
- `buildPayload` snapshots panel state; `runAttempt` handles thrown (unavailable notice + retry), success (unchanged bubble/draft/proposal/wasCapped toast + refresh), and notice outcomes (user-turn removal, input restore, retryable attempt kept).
- 다시 시도 replays the same attempt (same key + snapshot); 보내기/Enter and 다시 생성하기 create a new attempt; a new message after failure filters out the failed user turn.
- Focus: retry button for retryable errors, otherwise input.
- Deleted lib/ai/gemini.ts and its test; vitest.config.ts comment updated.

## Verification
- `npx tsc --noEmit` exits 0.
- Task 1 acceptance greps all match (key 1, tryAcquire 1, chat toast.error 0, proposal toast.error 1, wasCapped toast 1, router.refresh() 2, <AiPanelNotice 1, empty:hidden 1, finally 1, lib/ai/gemini 0).
- `lib/ai/gemini'` imports: none; `countTokens` in lib/app: none; `@google/genai` only in lib/ai/providers/gemini.ts.
- Offline gate: 11 test files, 226 tests passed.
- `git grep "crypto.randomUUID()" lib/ai/chat.ts`: empty.
- `graphify update .` run.

## Deviations from Plan
None in the code. Gate note: `npx eslint lib/ai app/studio/[workId]/chapters/[chapterId] tests/ai tests/helpers` reports 2 pre-existing `react-hooks/set-state-in-effect` errors in MentionAutocomplete.tsx and QuickAddDialog.tsx, which this plan didn't touch. They're out of scope and weren't fixed. AiPanel.tsx itself lints clean.

## Known Stubs
None.

## Self-Check: PASSED
- FOUND: app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx
- ABSENT (as intended): lib/ai/gemini.ts, tests/ai/gemini-client.test.ts
- FOUND: 1d00ee9, a335f77

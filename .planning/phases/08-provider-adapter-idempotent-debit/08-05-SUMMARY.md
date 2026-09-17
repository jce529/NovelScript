---
phase: 08-provider-adapter-idempotent-debit
plan: 05
subsystem: ai-server-action
tags: [server-action, zod, idempotency, provider-adapter, security]
requires:
  - phase: 08-02
    provides: createPlatformProvider registry
  - phase: 08-03
    provides: chat(supabase, ProviderClient, ChatInput with idempotencyKey)
provides:
  - chatAction(input with idempotencyKey) -> ChatResult at the Server Action boundary
affects: [08-07 AiPanel migration]
tech-stack:
  added: []
  patterns: [zod safeParse at Server Action boundary, explicit field list instead of spreading client input]
key-files:
  created: [tests/ai/chat-action.test.ts]
  modified: [app/studio/[workId]/chapters/[chapterId]/actions.ts]
key-decisions:
  - "chatAction validates only idempotencyKey (UUID) and modelTier (lite|pro) with zod; other fields pass through by explicit list, ownerId always session user"
  - "Any non-ProviderCallError thrown by createPlatformProvider is mapped to a fixed config shape so raw messages never reach logs or the result"
requirements-completed: [COST-01, PROV-01]
duration: 8min
completed: 2026-09-17
---

# Phase 8 Plan 05: chatAction Server Action Boundary Summary

chatAction now rejects non-UUID idempotency keys before touching provider or wallet, always binds ownerId to the session, builds the provider via createPlatformProvider(), and returns a typed ChatResult with sanitized config-failure logging.

## Performance
- Tasks: 1 (TDD: RED + GREEN commits)
- Files: 2

## Accomplishments
- Removed lib/ai/gemini dependency and getGeminiClientOrError from actions.ts.
- Added non-exported `chatActionSchema` (zod) and `idempotencyKey` on `ChatActionInput`.
- Unauthenticated / invalid_input / config failures return `{ ok:false, status:'failed', failureKind, error: CHAT_COPY.* }`.
- 9 boundary tests: no session, 5 invalid-input variants, forged `ownerId: 'attacker-id'`, ProviderCallError config log shape, plain Error secret non-leak.

## Task Commits
1. Task 1 RED: `a699df5` test(08-05): add failing chatAction boundary tests
2. Task 1 GREEN: `675161c` feat(08-05): chatAction validates idempotencyKey and uses provider registry

## Verification
- `npx vitest run tests/ai/chat-action.test.ts tests/ai/chat-idempotency.test.ts tests/ai/chat-refusal.test.ts tests/ai/provider-gemini.test.ts tests/admin/sanctions.test.ts` -> 5 files, 142 tests passed.
- Acceptance greps all matched (uuid schema 1, createPlatformProvider() 1, lib/ai/gemini 0, getGeminiClientOrError 0, ...input 0, attacker 2).
- `npx tsc --noEmit`: the actions.ts GeminiClient/ProviderClient error is gone. Remaining errors are AiPanel.tsx (expected, 08-07) and tests/ai/chat.test.ts, which is uncommitted in-progress work from parallel plan 08-06 and outside this plan's scope.
- `graphify update .` run.

## Deviations from Plan
None in the implementation. Test-only adjustment: hoisted `vi.fn()` mocks were created inside `vi.hoisted` rather than inside the `vi.mock` factories, so the RED run didn't crash when the old actions.ts never imported the registry module.

## Known Stubs
None.

## Self-Check: PASSED
- FOUND: tests/ai/chat-action.test.ts
- FOUND: app/studio/[workId]/chapters/[chapterId]/actions.ts
- FOUND: a699df5, 675161c

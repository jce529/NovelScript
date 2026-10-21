---
phase: 04-ai-gateway-mention-based-generation
plan: "09"
subsystem: ai
tags: [freeform, work-instruction, server-actions, regenerate, gap-closure, tdd]
requires:
  - "04-07: composeSystemInstruction customInstruction/workSystemInstruction"
  - "04-08: getWorkSystemInstruction DAL (work_ai_instructions, migration 0026)"
  - "11-05 / 11-10: ChatInput customInstruction/workSystemInstruction forwarded by chat()"
provides:
  - "chatAction validates customInstruction (<= 4000) and forwards the server-read work instruction"
  - "Jev document planning composeSystemInstruction receives both instructions"
  - "regenerateSchema/RegeneratePayload customInstruction + regenerate action/server wiring"
affects: [04-10, 04-12]
tech-stack:
  added: []
  patterns:
    - "server-only values placed after the request spread / explicit field list (forgery-proof)"
    - "instruction lookup fails closed before route resolution, provider call and debit"
key-files:
  created:
    - tests/ai/freeform-chat-action.test.ts
    - tests/ai/freeform-generation.test.ts
  modified:
    - app/studio/[workId]/chapters/[chapterId]/actions.ts
    - lib/ai/document-plan.ts
    - lib/ai/regenerate-contract.ts
    - lib/ai/document-regenerate.ts
    - tests/ai/document-plan-generation.test.ts
    - tests/ai/regenerate-contract.test.ts
    - tests/ai/document-regenerate.test.ts
    - tests/ai/jev-shadow-wiring.test.ts
key-decisions:
  - "The work instruction is looked up only for intermediate/freeform, the presets where composeSystemInstruction applies it. Beginner (and any other value) skips the DB read and forwards ''/null."
  - "customInstruction is forwarded only for freeform and is null otherwise. The 4000-char limit lives in regenerate-contract.ts (CUSTOM_INSTRUCTION_MAX_LENGTH, client-safe) and is shared by chatAction and regeneration."
  - "A failed instruction lookup returns failureKind 'unknown' (CHAT_COPY.unknown) before route resolution, so there is no provider call and no debit."
requirements-completed: [EDIT-03, EDIT-04]
duration: ~20min
completed: 2026-10-19
---

# Phase 04 Plan 09: Wiring the freeform and work instructions into the real call paths Summary

The validated freeform `customInstruction` and the work instruction that `getWorkSystemInstruction` reads after the ownership check now reach the real provider `systemInstruction`. This covers chapter and setting-document chat, Jev document planning, and template regeneration. A forged `workSystemInstruction` or `ownerId` in a request is overwritten by the server values.

## Prerequisite gate

- 11-05 and 11-10 are done. `aaa9173` makes `chat()` pass both fields to `composeSystemInstruction`. The new `freeform-generation.test.ts` confirmed this: it passed against the current `chat.ts` from its first run. `chat.ts`, `chat.test.ts` and `paid-generation.ts` were not modified.

## Tasks

| # | Task | RED | GREEN |
|---|------|-----|-------|
| 1 | chatAction: validate the freeform instruction, look up the work instruction | b99e3b1 | 12d4fa0 |
| 2 | Wire both instructions into general chat and the planning systemInstruction | db2395f | a9c7ae0 |
| 3 | Template regeneration: validation boundary and composition | a4fc896 | e17b85c |

## What was built

- **chatAction**
  - The schema accepts `customInstruction: z.string().max(4000).nullable().optional()`. A 4001-char value, a number, an object or an array returns invalid_input. In that case there is no route resolution, no lookup and no provider call.
  - The works ownership check now also requires `.is('deleted_at', null)`.
  - For intermediate and freeform, the action calls `getWorkSystemInstruction` with `{ ownerId: session, workId }`. A missing row gives `''`. A lookup error fails before route resolution.
  - The explicit `chat()` field list gains `customInstruction` (freeform only) and `workSystemInstruction` (the server value).
- **document-plan.ts**: `composeSystemInstruction` gets both fields. cappedReason, settlement order, the document contract check and parsing are unchanged.
- **Regeneration**
  - `regenerateSchema` and `RegeneratePayload` accept an optional `customInstruction` under the same 4000-char contract. Zod strips a client-sent `workSystemInstruction` or `ownerId`.
  - The action applies the deleted_at ownership filter and runs the lookup before route resolution. It then passes `ownerId`, `route` and both instructions after `...parsed.data`.
  - `document-regenerate.ts` checks length before preflight as a second guard and composes both instructions. Template and folder revalidation, link and title checks, BYOK replacement and idempotency are unchanged.

## Verification

- `npx vitest run --project unit tests/ai/prompt-composition.test.ts tests/ai/freeform-chat-action.test.ts tests/ai/freeform-generation.test.ts tests/ai/document-plan-generation.test.ts tests/ai/regenerate-contract.test.ts tests/ai/document-regenerate.test.ts` passed 77/77.
- Regression run of 17 files passed 252/252:
  - chat-action, chat-planning-mode, chat-contract, chat-idempotency, chat-refusal
  - regenerate-document, jev-off-path, jev-shadow-wiring, provider-fixture
  - quick-add-folders, save-document-plan-modal, save-validation, ai-panel-model
  - admin/user-flows, reader chapter-open, reader-topup, viewer-wiring
- `npx tsc --noEmit`: the only errors are 2 in `components/admin/report-queue.tsx`. That file belongs to another plan running concurrently, so it is out of scope.

## Deviations from Plan

- **[Rule 3 - Blocking] tests/ai/jev-shadow-wiring.test.ts**: the plan-mandated `deleted_at` ownership filter broke this file's Supabase mock, which had no `.is()`. Adding `is: () => q` made all 5 cases pass again. This one-line mock change is outside files_modified. (e17b85c)
- The regeneration Server Action boundary cases (forged value, lookup failure, oversize, beginner) are in `freeform-chat-action.test.ts` rather than `document-regenerate.test.ts`, because that file already mocks the action module. `document-regenerate.test.ts` covers the provider-request capture.
- The RED commit b99e3b1 included the regeneration action cases ahead of time, so they stayed RED through Task 1 and turned GREEN in Task 3.
- Per orchestrator instruction, graphify update and graph-link-requirements were not run, and STATE/ROADMAP were not edited.

## Gaps / Deferred (gate 04-12)

- No live DB was used. Migration 0026 (work_ai_instructions) is not yet applied to the shared project, so the real-RLS lookup has not been verified. The `*.database.test.ts` and `--project db` suites were not run.
- The live-DB assertions in `tests/ai/chat.test.ts` belong to Phase 11 and were not run (11-12).
- There are no browser or paid-provider calls. The AiPanel/ModelPicker UI that sends `customInstruction` is 04-10.

## Known Stubs

None. The client does not yet send `customInstruction`; that UI is 04-10. On the server, the field is optional and nothing is applied when it is absent.

## Self-Check: PASSED

- FOUND: tests/ai/freeform-chat-action.test.ts, tests/ai/freeform-generation.test.ts, lib/ai/regenerate-contract.ts, lib/ai/document-regenerate.ts, lib/ai/document-plan.ts
- FOUND commits: b99e3b1, 12d4fa0, db2395f, a9c7ae0, a4fc896, e17b85c

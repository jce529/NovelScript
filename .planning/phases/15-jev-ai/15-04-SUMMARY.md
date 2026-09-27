---
phase: 15-jev-ai
plan: 04
subsystem: ai
tags: [jev, chat, document-generation, paid-generation]

requires:
  - phase: 15-jev-ai
    provides: "planTaskAndCategory/planFolderAndTemplate (15-02), settlePaidGeneration/composeSystemInstruction documentPlan/validateDocumentAgainstPlan (15-10), getAiDocPlanningMode (15-11)"
provides:
  - "runDocumentPlanningStrategy — Jev plan → shared paid-generation lifecycle → document contract validation → recommendation fields"
  - "chat()'s active-mode branch, replacing the default reply path only when Jev decides 'document'"
  - "chatAction's per-request resolveChatPlanning(), the single place activation turns Jev on/off"
affects: [15-06, 15-08, 15-09]

tech-stack:
  added: []
  patterns:
    - "Document generation reuses the exact settlement/refusal/contract machinery the base chat path uses — no parallel billing path"

key-files:
  created:
    - lib/ai/document-plan.ts
    - lib/ai/chat-parse.ts
    - tests/ai/document-plan-generation.test.ts
    - tests/ai/chat-planning-mode.test.ts
  modified:
    - lib/ai/chat.ts
    - app/studio/[workId]/chapters/[chapterId]/actions.ts

key-decisions:
  - "parseChatResponse moved to lib/ai/chat-parse.ts (re-exported from chat.ts) to avoid a circular import between chat.ts and document-plan.ts, per the plan's fallback instruction."
  - "resolveChatPlanning() checks the dev DECISION_FIXTURE env var before calling getAiDocPlanningMode() at all, so the fixture UAT path never depends on DB state."
  - "Only DecisionCallError from createJevClient() is swallowed into a structured 'no planning' fallback; any other exception would still propagate (matches Plan 15-01's error contract)."

patterns-established:
  - "Server Action → activation resolver → decision client construction is one small helper (resolveChatPlanning), never inlined, so it can't silently diverge between call sites."

requirements-completed: [AIDOC-01, AIDOC-02]

duration: ~35min (Codex Task 1, Claude Task 2 after Codex halted on a sandbox network limitation)
completed: 2026-09-27
---

# Phase 15 Plan 04: Jev plan → Gemini document generation wiring Summary

**chat() now routes 'document' decisions through a shared Jev-plan → paid-generation → contract-check pipeline, gated end-to-end by a per-request activation resolver with no code-level on/off switch.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-27
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- `runDocumentPlanningStrategy` replaces the default chat path only for Jev-decided 'document' requests, using the exact same `settlePaidGeneration` lifecycle (permission/idempotency/cap/debit/refusal) as every other Gemini call
- `clarify` and folder `data_integrity` outcomes never reach Gemini — zero-cost by construction, verified by `generateContent`/`apply_wallet_delta` call-count assertions
- Generated documents that violate the plan's category or template headings are debited (usage happened) but never turned into a save-able proposal
- `chatAction` resolves Jev activation fresh on every request via `getAiDocPlanningMode()` — turning documents "on" requires a DB approval + evidence row, not a deploy
- 10 new tests in `document-plan-generation.test.ts`, 5 new tests in `chat-planning-mode.test.ts`; existing `chat*.test.ts`/`chat-action.test.ts` pass unmodified

## Task Commits

Committed as a single plan-scoped commit after Task 2 was finished directly in the main session (Codex halted on Task 1's Supabase-dependent verification step, which its sandbox couldn't reach; independently reverified with a real Supabase connection — 60/60 passed).

## Files Created/Modified
- `lib/ai/document-plan.ts` - `buildDocumentPlanState`, `runDocumentPlanningStrategy`, `CLARIFY_MESSAGE`
- `lib/ai/chat-parse.ts` - `parseChatResponse` (moved out of chat.ts to break a circular import; re-exported from chat.ts unchanged)
- `lib/ai/chat.ts` - `ChatInput.planning?` optional field; `mentionedDocs` calculation now branches into `runDocumentPlanningStrategy` when `planning?.mode === 'active'`, falling through to the existing reply path otherwise
- `app/studio/[workId]/chapters/[chapterId]/actions.ts` - `resolveChatPlanning()` (dev fixture override → `getAiDocPlanningMode` → `createJevClient`, DecisionCallError swallowed), wired into `chatAction` before `chat()`
- `tests/ai/document-plan-generation.test.ts` - 10 cases (no-planning passthrough, clarify, full document generation with recommendation fields, refusal, contract-violation, data_integrity, unavailable/reply fallthrough, already_processed, non-DecisionCallError failure)
- `tests/ai/chat-planning-mode.test.ts` - 5 cases (off/shadow/active/client-failure/dev-fixture-override)

## Decisions Made
See `key-decisions` above.

## Deviations from Plan

### Issues and verification limits

- Codex's sandbox lacked network access to the configured Supabase host, so it could not green the plan's specified `chat.test.ts` verification and stopped rather than mark Task 1 done on an unverifiable state. It also hit a `tsc --noEmit` failure caused by a concurrently in-progress Plan 15-05 stub file (`tests/ai/jev-golden-set.test.ts` referencing a not-yet-written module) — left untouched per its own scope boundary.
- Task 2 (chatAction wiring + its test file) was completed directly in the main session after independently reverifying Task 1 with real Supabase connectivity (`chat.test.ts`, `chat-idempotency.test.ts`, `chat-refusal.test.ts`, `document-plan-generation.test.ts` — 60/60 passed).
- Full `tests/ai` run has one unrelated failure (`jev-golden-set.test.ts`) that belongs to Plan 15-05, still in progress at commit time — not this plan's scope.

**Total deviations:** 0 auto-fixed; the plan was executed as specified, split across two sessions due to the sandbox limitation above.

## Issues Encountered
None beyond the sandbox network/cross-plan-timing issue described above.

## User Setup Required
None — activation is entirely DB/env-driven per Plan 15-11; no manual wiring needed to turn this on later.

## Next Phase Readiness
- Plan 15-06 (save-confirmation modal, template-change regeneration) can call the same `runDocumentPlanningStrategy`/`settlePaidGeneration` machinery.
- Plan 15-08 (shadow logging) can wrap `planTaskAndCategory`/`planFolderAndTemplate` calls made from this plan's `document-plan.ts` without touching the billing path.
- Plan 15-09's full-phase gate can now exercise the entire off/shadow/active path end-to-end through `chatAction`.

---
*Phase: 15-jev-ai*
*Completed: 2026-09-27*

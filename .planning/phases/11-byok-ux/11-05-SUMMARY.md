---
phase: 11-byok-ux
plan: 05
subsystem: ai-generation
tags: [byok, provider-routing, server-actions, usage, vitest]

requires:
  - phase: 11-byok-ux
    provides: trusted BYOK route resolver and shared paid-generation preflight/settle lifecycle from plans 11-03 and 11-04
provides:
  - Authenticated chat route resolution with safe replacement-required responses and explicit service replacement consent
  - Common trusted route, preflight, settle, and usage references for ordinary chat, active document planning, and document regeneration
  - Work/chapter/folder ownership revalidation and regression coverage for request identity and BYOK routing
affects: [11-byok-ux, ai-panel, document-generation, byok-generation]

tech-stack:
  added: []
  patterns: [session-derived owner and resource validation, server-proposed service selection must be revalidated after explicit consent, common generation route and settlement lifecycle]

key-files:
  created: [tests/ai/document-regenerate.test.ts]
  modified: [app/studio/[workId]/chapters/[chapterId]/actions.ts, lib/ai/chat.ts, lib/ai/document-plan.ts, lib/ai/document-regenerate.ts, tests/ai/chat-action.test.ts]

key-decisions:
  - "The replacement request retains the original idempotency key and request snapshot; the server accepts only the exact service selection it previously proposed."
  - "Regeneration usage records retain work_id and use chapter_id null because the current UI has no chapter reference."
  - "Legacy direct regeneration callers retain a model-tier compatibility path; the Server Action uses provider/model/keySource selection only."

patterns-established:
  - "Resolve provider ownership and availability on the server for every generation request; never accept client keySource as billing authority."
  - "Usage settlement receives work/chapter references in every generation entry point."

requirements-completed: [PROV-06, BYOK-05, BYOK-06, BYOK-09, COST-02]

duration: 13min
completed: 2026-10-08
---

# Phase 11 Plan 05: Trusted Generation Route Integration

**Chat, active document planning, and document regeneration now share the trusted provider route and settlement lifecycle, with explicit consent required before a BYOK replacement uses service billing.**

## Performance

- **Duration:** about 13 minutes
- **Started:** 2026-10-08T00:37:00Z (approximate)
- **Completed:** 2026-10-08T00:50:35Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Chat actions authenticate and recheck work plus chapter/document ownership, resolve the route from the session owner, and return a safe `replacement_required` response when BYOK is missing or unavailable.
- A service replacement runs only after the request explicitly consents and resubmits the exact server-proposed service selection. The original idempotency key and content snapshot remain on that request.
- Ordinary chat and active document planning share the resolved provider client and paid-generation lifecycle. Both pass work/chapter usage references.
- Regeneration now uses provider/model/keySource and a trusted route, revalidates work/folder/template, and records work_id with chapter_id null.
- Added action boundary and regeneration route tests.

## Task Commits

No commits were created, as instructed. The orchestrator will commit task changes separately.

## Files Created/Modified

- `app/studio/[workId]/chapters/[chapterId]/actions.ts` - Server-owned chat/regeneration routing, replacement consent validation, and ownership checks.
- `lib/ai/chat.ts` - Shared routed preflight/settle path and work/chapter usage refs for ordinary and planned chat.
- `lib/ai/document-plan.ts` - Uses the shared route context, model, settlement, and usage refs.
- `lib/ai/document-regenerate.ts` - Provider/model route integration and BYOK/service settlement with work-only usage refs.
- `tests/ai/chat-action.test.ts` - Covers server route use, unavailable BYOK, explicit replacement, and identity preservation.
- `tests/ai/document-regenerate.test.ts` - Covers replacement gating and ownership-scoped usage identity.

## Decisions Made

- Service replacement requires an explicit consent flag and a server-proposed selection match; the selection is resolved again on the server before generation.
- Regeneration records no chapter reference because the current action input provides none.
- Kept a model-tier compatibility overload for existing direct regeneration callers. The Server Action contract no longer accepts or submits model tiers.

## Deviations from Plan

### Compatibility adjustment

The existing `tests/ai/regenerate-document.test.ts` suite calls the lower-level regeneration helper with legacy model tiers. A compatibility overload remains in that helper so those callers continue to work; the user-facing Server Action and its schema use validated provider/model/keySource selections only. `graphify update .` also regenerated its graph artifacts, as required by `AGENTS.md` after code changes.

No other implementation deviations.

## Verification

- `npx.cmd vitest run tests/ai/chat-action.test.ts tests/ai/byok-generation.test.ts tests/ai/document-regenerate.test.ts tests/ai/regenerate-document.test.ts tests/ai/paid-generation.test.ts --no-file-parallelism` - **PASSED**, 5 files / 92 tests.
- `npx.cmd tsc --noEmit` - **FAILED overall** only on the pre-existing `app/layout.tsx:22` `LayoutProps` error. No diagnostics remain in this plan's files.
- `graphify update .` - completed; graph refreshed. Existing SQL parser dependency warning: 22 SQL files were omitted because `tree_sitter_sql` is not installed.
- No database integration tests or remote services were accessed.

## Issues Encountered

- Git status/diff inspection was unavailable because the repository ownership safety check rejected this checkout, including per-command `safe.directory` overrides. No commits were attempted.
- Full typecheck remains blocked by the unrelated `app/layout.tsx` error.

## User Setup Required

None.

## Next Phase Readiness

The generation action contracts now return runtime `kind: 'replacement_required'` data for the subsequent AI panel UX work. The remaining whole-project TypeScript error is outside this plan's modified files.

## Self-Check: PASSED

- Summary and all six plan implementation/test artifacts exist.
- Focused unit tests passed (92/92).
- The full TypeScript check reports no diagnostics in plan files; its only diagnostic is the existing `app/layout.tsx:22` `LayoutProps` error.
- No commits were made; no DB integration test was run.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*

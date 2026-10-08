---
phase: 11-byok-ux
plan: 07
subsystem: ai-settings
tags: [byok, usage, nextjs, accessibility, vitest]

# Dependency graph
requires:
  - phase: 11-byok-ux
    provides: owner-scoped monthly BYOK usage aggregation from Plan 11-01
provides:
  - Server-side owner-scoped monthly usage loading and minimal provider DTOs
  - Monthly provider totals and accessible, collapsible model details on registered key cards
  - Card-local empty and error states that preserve key management actions
affects: [byok-settings, phase-11-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [minimal server-to-client usage DTO, provider-local usage status]

key-files:
  created: []
  modified:
    - app/studio/settings/ai-providers/page.tsx
    - app/studio/settings/ai-providers/ByokKeyCards.tsx
    - tests/ai/byok-settings-ui.test.ts

key-decisions:
  - "Usage query failures map to a card-local error DTO and do not interrupt key management."
  - "Only provider/model/call/token aggregates cross to the client; no pricing data is calculated or rendered."

patterns-established:
  - "BYOK settings page loads connected models, keys, and usage in parallel after authorization."
  - "Usage detail rows consume the aggregate's deterministic calls-descending/model-label ordering."

requirements-completed: [BYOK-07, COST-02]

# Metrics
duration: 4min
completed: 2026-10-08
---

# Phase 11 Plan 07: BYOK Monthly Usage Summary

**Registered BYOK provider cards now show KST monthly call and token totals with accessible model details, while isolating usage errors from key management.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-08T00:29:45Z (approximate)
- **Completed:** 2026-10-08T00:33:45Z
- **Tasks:** 2
- **Files modified:** 4 including this summary

## Accomplishments

- Added an authenticated, parallel monthly usage load to the settings Server Component and passed minimal DTOs only to registered provider cards.
- Added formatted totals, KST period guidance, empty/error copy, and an accessible collapsed-by-default model detail toggle.
- Added UI tests for summaries, error isolation, actions, and no-pricing output.

## Task Commits

No commits were created as instructed; the orchestrator will commit tasks individually.

## Files Created/Modified

- `app/studio/settings/ai-providers/page.tsx` - Loads monthly usage after the writer access gate and maps safe DTOs per registered provider.
- `app/studio/settings/ai-providers/ByokKeyCards.tsx` - Renders usage totals, model details, and card-local empty/error states.
- `tests/ai/byok-settings-ui.test.ts` - Covers usage content and behavior.
- `.planning/phases/11-byok-ux/11-07-SUMMARY.md` - Execution record.

## Decisions Made

- Followed the existing KST aggregate loader and treated usage failure as isolated card state.
- Left `tests/ai/ai-usage.test.ts` unchanged because its existing KST aggregation and loader failure coverage already applies.

## Deviations from Plan

None. Commits were omitted per the explicit execution instruction.

## Issues Encountered

- `npx` was blocked by the PowerShell execution policy; `npx.cmd` ran the requested unit tests successfully.
- `npx.cmd tsc --noEmit` reports existing errors in `app/layout.tsx` (`LayoutProps`) and `lib/ai/paid-generation.ts` (`ProviderErrorKind` typing). It reported no errors in this plan's source or test files.
- Git status inspection was blocked by Git's unsafe repository ownership check. No repository configuration was changed.

## User Setup Required

None.

## Next Phase Readiness

The BYOK settings usage UI is implemented and its 28 focused tests pass. The repository-wide TypeScript gate remains blocked by the unrelated errors listed above.

## Self-Check: PASSED

- **Files:** All three plan-modified files and this summary exist.
- **Tests:** `npx.cmd vitest run tests/ai/ai-usage.test.ts tests/ai/byok-settings-ui.test.ts --no-file-parallelism` passed (2 files, 28 tests).
- **Pricing regression scan:** No `KRW`, `USD`, `원화`, `달러`, or `예상 비용` matches in `ByokKeyCards.tsx`.
- **TypeScript:** Full check was attempted; it reports only the unrelated errors documented above.

---
*Phase: 11-byok-ux*
*Completed: 2026-10-08*

---
phase: 07-admin-moderation-surface
plan: "11"
subsystem: admin-ui
tags: [admin, sanctions, presets, ssr-tests]
requires: ["07-09", "07-10"]
provides:
  - "/admin 3 tabs (작품·회차 신고 / 작가 재검토 / 제재 이력), all-status queue display"
  - "sanction history tab with current-row lift / duration change dialog"
  - "1/7/30-day suspension presets in report moderation form"
affects: ["07-14", "07-15"]
tech-stack:
  added: []
  patterns: ["renderToStaticMarkup tests with mocked next/navigation and server actions"]
key-files:
  created:
    - components/admin/sanction-history.tsx
    - components/admin/sanction-change-form.tsx
    - tests/admin/blueprint-ui.test.ts
  modified:
    - app/admin/page.tsx
    - components/admin/report-queue.tsx
    - components/admin/moderation-form.tsx
key-decisions:
  - "DurationPresetPicker lives in moderation-form.tsx (exported) so both forms share it without a circular import."
  - "Adjust buttons render only in the selected user's current-sanction row when effective kind is not none."
requirements-completed: [ADMIN-01, ADMIN-03]
completed: 2026-10-19
---

# Phase 7 Plan 11: Admin blueprint UI Summary

Three-tab admin (no comment tab), all-status queue with per-status badges, sanction history tab with grouped duration-change timeline, and a current-row lift/duration-change dialog; the initial suspension form now uses the same 1/7/30-day presets.

## Commits
- 510fc6a feat(07-11): sanction history tab and all-status queue display (task 11-01)
- d352bac feat(07-11): current-row sanction adjustment and suspension presets (task 11-02)

## What changed
- `report-queue.tsx`: tab labels, third tab, `QUEUE_FILTER_LABELS` (fixes the TS7053 from `status: 'all'`), `ReportStatusBadges` rendering every `statuses` entry, empty/heading text for the all filter.
- `sanction-history.tsx` (new): user list (role, name or safe `사용자 xxxxxxxx`, current state), separate URLs for user selection / history page / list page (list paging clears selection), notice for a userId not on the page, timeline that merges lift+suspension sharing `changeId` into one 기간 변경 (previous -> new, audit IDs kept via `data-audit-id`; half-pairs at page edges still labeled).
- `sanction-change-form.tsx` (new): dialog, internal 2000 / public 500 reasons, 1/7/30 preset with captured baseTime and zone/UTC preview, past-expiry re-select message, pending lock, inputs/key kept on failure, new key on edit, toast + `router.refresh()` only on success, stale -> StatusMessage refresh. Exposes pure `validateSanctionChange` / `buildSanctionAdjustInput`.
- `moderation-form.tsx`: `datetime-local` and `localInputToIso` removed; `DurationPresetPicker` with the same presets; still no `userId` (action-boundary guard intact).
- `app/admin/page.tsx`: sanctions branch loads 25 users plus selected user's history; `failLoad` reused.

## Deviations
- **[Rule 1 - Bug]** `LocalTime withZone` threw (`dateStyle`/`timeStyle` cannot combine with `timeZoneName`); zone variant now uses explicit fields. Needed for the new previews.
- Task order inside the plan kept; `renderAdjust` slot was dropped in favor of importing the form directly in task 2.

## Verification
- `vitest run --project unit` blueprint-ui, sanction-presets, action-boundary, moderation-form-message, queue-params: 5 files, 125 tests pass.
- `eslint --max-warnings=0` on app/admin, components/admin, the new test: clean.
- Repo `tsc --noEmit`: nothing from admin files. Remaining errors are in other plans' `tests/ai/*` (missing `cappedCompletionFields`, `AiInstructionControls`), not in scope.

## Gaps (for 07-15)
- No click/focus/Esc/dialog-transition or real submit behavior tested (SSR only); live-DB suites and browser checks not run.
- graphify update not run per instructions.
- Dialog content is not in SSR markup (closed), so only helpers and button presence are unit-tested.

## Known Stubs
None.

## Self-Check: PASSED

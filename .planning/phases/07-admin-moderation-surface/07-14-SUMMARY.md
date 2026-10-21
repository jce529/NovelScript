---
phase: 07-admin-moderation-surface
plan: "14"
subsystem: docs
tags: [ui-spec, validation, gap-closure, docs-only]
requires: ["07-11", "07-12", "07-13"]
provides: ["Reopen-aligned UI contract", "supplemental verification map for 07-08..07-15"]
affects: ["07-15"]
key-files:
  modified:
    - .planning/phases/07-admin-moderation-surface/07-UI-SPEC.md
    - .planning/phases/07-admin-moderation-surface/07-VALIDATION.md
requirements-completed: [ADMIN-01, ADMIN-02, ADMIN-03]
completed: 2026-10-19
---

# Phase 7 Plan 14: UI-SPEC / VALIDATION Reopen alignment Summary

Documentation-only update: UI-SPEC and VALIDATION now describe the delivered Reopen behavior (three tabs without comments, all filter, 1/7/30 presets, current-row lift/change, profile-menu admin entry, bookmark-reader publication notices) and keep all new DB/browser acceptance pending for 07-15.

## Commits
- 8aec60e: 07-UI-SPEC.md (task 14-01)
- 004efdd: 07-VALIDATION.md (task 14-02)

## What changed
- UI-SPEC: Reopen header citing 07-CONTEXT (2026-10-12) and UI-DESIGN-BACKLOG rows; tabs changed to `작품·회차 신고`/`작가 재검토`/`제재 이력`; `전체` filter with per-status badges; sanction-history tab contract; free expiry input replaced by 1/7/30 presets with UTC/zone preview; current-row `해제`/`기간 변경` dialog (two required reasons, stale, input/key retention); profile-menu admin link; bookmark-only publication notices in AccountNotices (no internal reason). Original 2026-09-16 sign-off kept; new unchecked Reopen UI acceptance item added. Reader blind/entitlement/review/warning contracts untouched.
- VALIDATION: past "tests do not exist / Missing" wording reframed as 2026-09-16 planning record; new supplemental map for 07-08..07-15 with files, commands and only the numbers recorded in each SUMMARY; limitations noted; historical 2026-09-17 sign-off preserved; separate Reopen sign-off with DB, browser, and regression items unchecked.

## Verification
- `rg` checks from the plan match in both files. No code changed, so tsc/eslint/vitest were not run.

## Left pending (gate 07-15)
- Live-DB runs of 0029 and the three new database suites (skipped 0), grants, 2-session races.
- Browser checks: clicks/focus/Esc of the adjust dialog, profile menu, acknowledgement persistence, viewports, light/dark, 200% zoom.
- Regression re-run of existing report/blind/purchase flows.

## Deviations from Plan
None.

## Known Stubs
None.

## Self-Check: PASSED
- Both files exist; commits 8aec60e and 004efdd exist.

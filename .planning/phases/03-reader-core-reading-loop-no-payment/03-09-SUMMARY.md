---
phase: 03-reader-core-reading-loop-no-payment
plan: "09"
subsystem: reader-header
tags: [header, navigation, READ-01]
requires: ["03-08"]
provides: ["ReaderHeaderFrame with balanceSlot (03-17 injection point)", "lib/reader/navigation.ts"]
key-files:
  created: [lib/reader/navigation.ts, components/reader/reader-header-frame.tsx, tests/reader/navigation.test.ts, tests/reader/reader-header.test.ts]
  modified: [components/layout/site-header.tsx]
requirements-completed: [READ-01]
completed: 2026-10-17
---

# Phase 3 Plan 09: Reader header Summary

Two-tier reader header (logo / disabled search / balance + disabled charge / account; main tabs + sub row, each `overflow-x-auto`, 44px targets, single sticky) driven by a pure route classifier; studio/admin/account keep the one-line header.

## Commits
- 1ad8657 feat(03-09): navigation constants and route classifier
- 6277bdf: feat(03-09): ReaderHeaderFrame + SiteHeader wiring

## Decisions
- Home/detail = reader, chapter viewer = renders no header (own chrome), all others = compact one-line.
- Only `/#weekly-ranking` exists as a home anchor, so only "주간 랭킹" is linked; the rookie/hall/continue anchors and all list/library items are disabled "준비 중" (no guessed hrefs). Later plans that add anchors should set the href in `READER_SUB_ROWS`.
- Main tab selection is local state changing only the sub row.
- `balanceSlot?: ReactNode` replaces the default formatted balance + disabled charge (03-17 HeaderTokenBalance). AccountPanel untouched.

## Tests
`npx vitest run tests/reader/navigation.test.ts tests/reader/reader-header.test.ts tests/reader/work-detail-shell.test.ts`: 14/14 pass. tsc: no errors in touched files.

## Deviations
None. graphify not run per instruction.

## Gaps for 03-19
Browser verification not done: sticky behavior, overflow scroll, keyboard tab order, 44px targets, mobile layout, and whether viewer pages really hide the header (viewer pages did not use SiteHeader anyway).

## Self-Check: PASSED

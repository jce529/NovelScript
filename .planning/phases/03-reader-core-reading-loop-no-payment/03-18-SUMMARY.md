---
phase: 03-reader-core-reading-loop-no-payment
plan: "18"
subsystem: reader
tags: [topup, purchase, viewer, work-detail]
requires: ["03-08", "03-16", "03-17", "05-05"]
provides: ["toReaderTopupRequest", "ChapterPurchaseEntry", "runChapterPurchase"]
key-files:
  created: [lib/reader/topup-request.ts, components/reader/chapter-purchase-entry.tsx, tests/reader/topup-request.test.ts, tests/reader/reader-topup.test.ts]
  modified: [components/reader/viewer-shell.tsx, components/reader/work-chapter-list.tsx, tests/reader/viewer-wiring.test.ts]
requirements-completed: [READ-02, PAY-01]
metrics:
  completed: 2026-10-19
---

# Phase 3 Plan 18: Reader insufficient-balance to shared top-up Summary

Viewer and work-detail purchase attempts that fail with the exact insufficient-balance result open the single Phase 5 top-up dialog via `useTokenTopup().openTopup`, preserving source, pathname+search and chapterId; top-up never auto-purchases.

## Commits
- Task 1: adapter + TDD test (topup-request) - see `feat(03-18): add insufficient-balance topup request adapter`
- Task 2: 3f12dfc consumer wiring

## What was built
- `toReaderTopupRequest`: matches only "토큰 잔액이 부족해요." (no machine code exists), local `/works/` paths only, no shortage sent.
- `ChapterPurchaseEntry` (+ exported `runChapterPurchase`, `stablePurchaseKey`): reuses `purchaseChapterAction`, per-chapter stable idempotency key, in-flight guard, success -> router.refresh, other failures show their error.
- ViewerShell purchase branch and WorkChapterList `purchase_required` rows (with `#chapter-<id>` anchor) use it; blinded/unavailable/readable rows render no CTA.

## Tests
topup-request (3), reader-topup (10), viewer-wiring all pass (26 total); tsc clean for touched files. No DB/live suites run.

## Deviations
- [Rule 3] `tests/reader/viewer-wiring.test.ts` (not in files_modified) needed a provider mock because the viewer now calls `useTokenTopup`.

## Gaps
- WorkChapterList has no loggedIn prop (page.tsx not owned); logged-out users see the CTA and get the action's "로그인이 필요해요." error.
- Real browser flow (dialog open, return to chapter/page after payment) is unverified: gate 03-19.
- graphify update not run (instructed).

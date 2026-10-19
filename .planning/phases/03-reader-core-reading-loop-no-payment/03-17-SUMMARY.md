---
phase: 03-reader-core-reading-loop-no-payment
plan: "17"
subsystem: reader-header-payment-wiring
tags: [topup, provider, header, ssr-test]
requires: ["03-09", "03-16", "05-05"]
provides: ["root TokenTopupProvider mount", "header + button via HeaderTokenBalance"]
affects: []
tech-stack:
  added: []
  patterns: ["provider wraps route children only; dialog is provider sibling (Phase 5)"]
key-files:
  created: [tests/reader/topup-provider-wiring.test.ts, tests/reader/header-topup.test.ts]
  modified: [app/layout.tsx, components/layout/site-header.tsx, tests/reader/reader-header.test.ts]
decisions:
  - "Single TokenTopupProvider in root layout around children; AccountNotices/Toaster stay outside"
metrics:
  completed: 2026-10-19
requirements: [READ-01, PAY-01]
---

# Phase 3 Plan 17: Top-up provider and header + wiring Summary

Root layout now mounts Phase 5's TokenTopupProvider once around route children, and SiteHeader injects the real HeaderTokenBalance into ReaderHeaderFrame's balanceSlot, so header, viewer and mobile detail share one top-up modal.

## Commits
- c2efa9d: feat(03-17) root provider + wiring test
- b914550: feat(03-17) header balanceSlot + header-topup test

## Verification
`npx vitest run tests/reader/topup-provider-wiring.test.ts tests/reader/header-topup.test.ts tests/reader/reader-header.test.ts` : 11/11 pass. 05-05 exports (TokenTopupProvider, useTokenTopup, HeaderTokenBalance) were verified present before wiring. Opening the dialog grants no credit; balance changes are left to 05-05's webhook/refresh flow.

## Deviations
- [Rule 3] tests/reader/reader-header.test.ts (not in files_modified) asserted the old disabled "충전 (준비 중)" placeholder and rendered without a provider; updated it to mock HeaderTokenBalance and assert the real charge control.

## Gaps
- No browser/live check of the modal opening from header, viewer or mobile detail, and no real payment flow; deferred to gate 03-19 / 05-07.
- graphify update not run (per instruction).

## Known Stubs
None.

## Self-Check: PASSED

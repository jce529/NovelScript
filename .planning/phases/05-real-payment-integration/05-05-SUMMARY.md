---
phase: 05-real-payment-integration
plan: 05
subsystem: payments-ui
tags: [toss, dialog, polling, provider]
requires: [05-02, 05-03, 05-08]
provides: [TokenTopupProvider, useTokenTopup, HeaderTokenBalance, TokenTopupDialog, useTopupFlow]
affects: [03-17, 03-18, 05-07]
key-files:
  created:
    - components/payment/use-topup-flow.ts
    - components/payment/token-topup-dialog.tsx
    - components/payment/token-topup-provider.tsx
    - components/payment/header-token-balance.tsx
    - tests/payments/topup-flow.test.ts
requirements: [PAY-01, PAY-03]
completed: 2026-10-19
---

# Phase 5 Plan 05: Top-up dialog and flow Summary

Four-state, DB-catalog-driven top-up dialog with persistent 2s order polling, Toss CARD launch and one shared provider; credit is shown only after polled order status reports credited.

## Commits
- bc14581: hook (state machine, return markers, Toss launch, polling) + tests
- 491ccd2: dialog, provider, header balance entry

## Notes
- Pure helpers (nextTopupState, readReturnMarker, stripReturnMarker, resolveReturnPath, reconcileSelection, canCheckout, discountPercent) exported for tests; discount uses integer math to avoid float floor error.
- Marker read in mount effect via window.location (no useSearchParams); only the consumed key is stripped.
- Polling lives in provider hook, no timeout/cap; errors/pending keep waiting; dismissing awaiting dialog does not stop it.
- openTopup(input?) stores source/chapterId/shortage; returnPath defaults to pathname+search; never auto-buys a chapter.
- Dialog uses a custom Korean close, redirecting dismissal guard (kebab-case reasons), no hardcoded tiers.

## Verification
- `npx vitest run tests/payments/topup-flow.test.ts --project unit`: 11/11 pass.
- `npx tsc --noEmit`: no errors in plan files (whole-repo output filtered to these paths).
- Not run: `npm run build`, browser checks (05-07, after Phase 3 mounts provider), graphify (instructed not to), live-DB suites.

## Deviations
None of substance. Plan's graphify and ROADMAP/STATE steps skipped per orchestrator instruction.

## Gaps
- Provider not yet mounted in app/layout.tsx and HeaderTokenBalance not yet placed (03-17); insufficient-balance callers pending (03-18). 05-07 must verify end to end.
- Requires NEXT_PUBLIC_TOSS_CLIENT_KEY at runtime (missing key shows the open-failure toast).
- Anonymous users: provider is inert until openTopup or a return marker; a topup marker for an anonymous session would poll and keep failing silently.

## Known Stubs
None.

## Self-Check: PASSED

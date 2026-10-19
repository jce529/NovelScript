---
phase: 05-real-payment-integration
plan: 06
subsystem: payments-verification
tags: [toss, local-boundary-test, ui-mockup]
requires: [05-04, 05-05]
provides: [payment-flow.integration.test, payment-flow.database.test, topup-mockup-artifact]
affects: [05-07]
key-files:
  created:
    - tests/payments/payment-flow.integration.test.ts
    - tests/payments/payment-flow.database.test.ts
requirements: [PAY-01, PAY-02, PAY-03]
completed: 2026-10-19
---

# Phase 5 Plan 06: Local payment boundary proof and top-up mockup Summary

Task 1 proves the order-to-credit boundary locally with mocks; Task 2 publishes the four-state top-up mockup. SQL exactly-once and concurrency proof is NOT done here: it stays pending for gate 05-07.

## Mockup (Task 2)
- Artifact: https://claude.ai/artifact/5fYgUZEg9a6G8j6mEpTcvU (private: shared only from the Share menu by its owner)
- Boards: `tier-select` (nothing selected), `tier-select` (tier selected, CTA "9,000원 결제하기"), `redirecting` (grid dimmed, X hidden, spinner CTA), `awaiting-credit` (status block, 닫기), plus the header `+` entry and the insufficient-balance opener.
- Copy, tier table and states follow 05-UI-SPEC.md; no tier is pre-selected or recommended; badges use the secondary style, accent only on the CTA and the selected card.

## Commits
- b8e47c0: test(05-06) local order-to-credit payment boundary (integration test + opt-in database test)

## Verification
- `npx vitest run --project unit tests/payments`: 12 files, 113 tests pass (6 new in the integration file).
- Integration test runs the real action, catalog, order code, success route, webhook route and Toss client; only Supabase (table fake and ledger fake) and Toss HTTP are faked.
- Covered: approval alone leaves balance 0 and makes no credit call; forged webhook body and mismatching Toss total credit nothing; a verified DONE credits exactly the stored snapshot once; repeated webhook adds nothing; DB-configured event tier credits correctly; catalog price change before approval blocks confirm; catalog changes after confirm do not change the credited snapshot.
- `payment-flow.database.test.ts` is written but unrun and not type-checked against a live DB; skipped unless `SUPABASE_SERVICE_ROLE_KEY` is set; needs migrations 0016 and 0027 on a disposable project.
- Not run: `npm run build`, live-DB suites, browser checks.

## Gaps (gate 05-07)
- SQL exactly-once / concurrent webhook delivery against real `apply_wallet_delta`.
- Real Toss sandbox flow; webhook URL registration in the Toss console.
- `tsc` is not clean repo-wide because of concurrent work in other plans (admin report queue, 07-10); none of the errors are in this plan's files.

---
phase: 05-real-payment-integration
plan: 04
subsystem: payments
tags: [toss, webhook, wallet, idempotency, proxy]
requires: [05-02, 05-08]
provides: [webhook-only verified top-up credit, proxy bypass for Toss webhook ingress]
affects: [05-05, 05-06, 05-07]
tech-stack:
  added: []
  patterns: [untrusted-body lookup hint + secret-key server re-query, ledger-unique idempotency with post-RPC marker]
key-files:
  created:
    - app/api/payments/toss/webhook/route.ts
    - tests/helpers/toss.ts
    - tests/payments/webhook-credit.test.ts
    - tests/payments/webhook-idempotency.test.ts
    - tests/payments/webhook-forged-body.test.ts
    - tests/payments/webhook-guards.test.ts
  modified:
    - proxy.ts
key-decisions:
  - "Webhook reads only data.orderId (6-64 chars [A-Za-z0-9_-]); status/amount come solely from authenticated GET /v1/payments/orders/{orderId}"
  - "Credit uses persisted order snapshot (user_id, token_amount, tier_id); catalog is never consulted"
  - "Already-credited orders (credited_at set) are acknowledged without Toss lookup or RPC"
  - "Toss NOT_FOUND_PAYMENT, mismatched orderId/amount, non-DONE, unknown order, bad JSON -> 200; DB/network/Toss 5xx, RPC or credited_at update failure -> 500"
  - "Proxy matcher excludes exact path api/payments/toss/webhook$"
requirements-completed: [PAY-03, PAY-01]
metrics:
  completed: 2026-10-19
  tasks: 2
  files: 7
---

# Phase 5 Plan 04: Verified Idempotent Toss Webhook Credit Summary

PAYMENT_STATUS_CHANGED webhook that treats the body as an orderId hint only, re-queries Toss with the secret key, and credits the stored order snapshot through `apply_wallet_delta` (reference `toss_topup`/order_id) exactly once; the auth proxy no longer runs on the webhook path.

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 (RED) | Failing webhook credit/idempotency/forgery/guard tests + in-memory DB/fetch helper | b4fd91f (previous executor) |
| 1 (GREEN) | Webhook route: verify DONE + exact amount, credit once, credited_at after RPC | 013427e |
| 2 | Exclude webhook ingress from proxy matcher | a26d57b |

## Verification

- `npx vitest run tests/payments/webhook-{credit,idempotency,forged-body,guards}.test.ts` -> 4 files, 32 tests passed.
- `grep apply_wallet_delta app lib` -> the only code call site is `app/api/payments/toss/webhook/route.ts`.
- Matcher compiled with Next's `getMiddlewareMatchers`: `/api/payments/toss/webhook` not matched; `/api/payments/toss/success`, `/api/payments/toss/webhookx`, `/studio`, `/` still matched. No `middleware.ts` created.
- `npx tsc --noEmit`: no errors in 05-04 files. The two remaining errors are in concurrent 05-03 work (`tests/payments/amount-tamper.test.ts` type error; `tests/payments/fail-redirect.test.ts` imports the not-yet-created `app/api/payments/toss/fail/route`), out of scope.

## Deviations from Plan

None in behavior. Resumed after an interrupted executor: RED commit b4fd91f was reused, not redone. No migration was needed (0028 left unused).

## Gaps (deferred to 05-07)

- Mocked-only evidence: idempotency/concurrency were proven against an in-memory RPC that mirrors unique(wallet_id, reference_type, reference_id). Real `apply_wallet_delta` locking/uniqueness under independent sessions was not run (no live-DB suites against the shared Supabase project) and stays with 05-07 Task 1.
- No live Toss sandbox delivery was exercised; webhook URL registration in the Toss console and an end-to-end test payment stay with 05-07.
- graphify update / graph-link-requirements and STATE/ROADMAP updates were intentionally skipped per orchestrator instructions.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: app/api/payments/toss/webhook/route.ts, proxy.ts, tests/helpers/toss.ts and the four webhook tests
- FOUND commits: b4fd91f, 013427e, a26d57b

---
phase: 05-real-payment-integration
plan: 08
subsystem: payments
tags: [payments, toss, supabase, migration, catalog, gap-closure]
requires: [05-01, 05-02]
provides:
  - public.payment_topup_tiers (operator-managed bundles, service_role only)
  - lib/payments/catalog.ts listTopupTiers / getTopupTier (server-only)
  - listTopupTiersAction (tiers + own wallet balance)
affects: [05-03, 05-04, 05-07]
tech-stack:
  added: []
  patterns: [DB-authoritative price catalog, client-safe DTO split from server-only reader, isolated-schema migration test]
key-files:
  created:
    - supabase/migrations/0027_payment_topup_tiers.sql
    - lib/payments/catalog.ts
    - tests/payments/catalog.test.ts
    - tests/payments/catalog.database.test.ts
  modified:
    - lib/payments/tiers.ts
    - lib/payments/orders.ts
    - lib/payments/actions.ts
    - tests/payments/tiers.test.ts
    - tests/payments/order-create.test.ts
decisions:
  - "0027 removes the 0016 tier_id CHECK by scanning pg_constraint for check constraints mentioning tier_id (not an assumed auto name), then adds FK ON DELETE/UPDATE RESTRICT"
  - "Sale window = starts_at <= now < ends_at (null = open); label window is evaluated separately; blank labels map to null"
  - "Catalog reads the DB every call with no cache/fallback; DB errors throw, unsafe numbers (non-safe-integer, <= 0) throw"
  - "listTopupTiersAction reads wallet balance via the session client (RLS wallets_select_own); missing wallet row = 0, wallet error throws"
  - "Seed sort_order 10/20/30/40 leaves room for operator inserts between existing bundles"
requirements: [PAY-01, PAY-03]
metrics:
  duration: ~15min
  completed: 2026-10-17
---

# Phase 5 Plan 08: DB top-up catalog (0027) Summary

The top-up bundle list moved from the hardcoded `TOPUP_TIERS` to `public.payment_topup_tiers`, seeded with the same four bundles as before. Orders now get their price and token count from a server-side DB lookup. The browser only proposes a bundle ID.

## What was built

- **0027_payment_topup_tiers.sql**: new table with ID format/positive safe-integer tokens/positive price/label <= 80 chars/start < end CHECKs for both windows. The seed is exactly t100=100/1000, t300=300/2850, t550=550/5000, t1000=1000/9000 in that order. The fixed `payment_orders.tier_id` CHECK is swapped for an FK RESTRICT. No UPDATE runs on payment_orders, so existing snapshots and timestamps stay as they were. RLS is on with no policies. Access is revoked from public/anon/authenticated, and service_role gets select/insert/update/delete. A schema reload notify is sent. profiles is untouched.
- **tiers.ts**: now holds only client-safe items: the `TopupTier` DTO (`{id, tokens, priceKrw, label}`), `TOPUP_TIER_ID_PATTERN`, `isTopupTierId` (format check only), `generateOrderId` and `TOPUP_REFERENCE_TYPE`. It has no imports.
- **catalog.ts** (server-only): `listTopupTiers()` returns active rows inside their sale window, sorted by sort_order then id. Labels are nulled outside their own window. `getTopupTier(id)` returns the bundle only if it exists and is on sale. Neither function hides errors.
- **orders.ts**: `createTopupOrder` awaits the catalog lookup and stores the server price/tokens. The return shape is unchanged.
- **actions.ts**: the enum became a bounded `z.string().regex(...)` check. Added `listTopupTiersAction()`. `authenticatedUserId`, `safeReturnPath` and `getTopupOrderStatusAction` are reused unchanged in behavior.
- Grep after the switch found no remaining `TOPUP_TIERS` or sync `getTopupTier` consumers. `order-status.test.ts` does not depend on tiers, so I left it as is.

## Verification

Local (passed):
- `npx vitest run tests/payments/catalog.test.ts tests/payments/tiers.test.ts tests/payments/toss-client.test.ts` passed 31/31. The catalog unit tests use a mocked Supabase and fake timers. They cover new DB IDs, inactive/future/expired/unknown/malformed IDs, DB error propagation, the label window, stable sort, empty list, unsafe numbers, tampered client amounts, anonymous rejection, unsafe returnPath, and wallet balance.
- `tests/payments/catalog.database.test.ts` passed 5/5 against the configured Postgres (SUPABASE_DB_URL was present). It ran in an isolated throwaway schema inside an outer transaction that is rolled back, so public was never written. It applies 0016, inserts a legacy order, then applies 0027. It asserts: the exact seed; the legacy snapshot and timestamp survive both the migration and a later price change; a new bundle can be ordered; an unregistered ID hits the FK; delete/rename of a referenced bundle is restricted; invalid price/tokens/ID/label/window are rejected; anon/authenticated are denied select/insert/update/delete; service_role can operate.
- `npx tsc --noEmit`: none of this plan's files have type errors. The remaining errors are pre-existing and belong to other plans: untracked `tests/payments/{amount-tamper,fail-redirect,no-credit-on-redirect}.test.ts` reference routes that don't exist yet (05-03/04 scope, not adopted here), plus `tests/studio/mobile-workspace.test.ts` and `tests/world-tree/fixtures.ts`.

Waiting on live DB (05-07 Task 1):
- 0027 has not been applied to the shared Supabase project. Because the table doesn't exist there yet, `tests/payments/order-create.test.ts` (4 original cases plus the new event fixture: create bundle, order, delete order, delete bundle) and `order-status.test.ts` were not run. FK/RLS evidence on the real public schema is also pending.

## Deviations from Plan

- **Task 1 and Task 2 share one commit** (6ee895a), as the plan requires (removing the old export and switching to await are atomic).
- **The DB suite actually executed** instead of being skipped. It only ever touched the isolated schema with rollback, which is the plan's prescribed pattern. It does not replace 05-07's live public-schema verification.
- I did not run graphify/graph-link-requirements because the orchestrator told me not to. That remains for the orchestrator/traceability sync.

## Known Stubs

None. No UI consumes `listTopupTiersAction` yet. That belongs to the later top-up UI plans.

## Self-Check: PASSED

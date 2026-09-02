---
phase: 5
slug: real-payment-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `05-RESEARCH.md` § Validation Architecture (line 601).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 (`environment: 'node'`, `include: ['tests/**/*.test.ts']`) — already configured, no install needed |
| **Config file** | `vitest.config.ts` (root). Aliases `server-only` → `tests/helpers/server-only-stub.ts`, auto-loads `.env.local` |
| **Quick run command** | `npx vitest run tests/payments` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~30 seconds (quick) / ~2 minutes (full — many tests hit a real Supabase instance) |

> **Constraint:** many tests in this repo are integration tests against a **real Supabase instance** (`SUPABASE_DB_URL` required). All Toss HTTP calls MUST be replaced with `fetch` mocks so the payment suite runs **without network access**.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/payments`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite green **and** one manual end-to-end Toss test payment confirmed
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Task IDs assigned by the planner. Every row below MUST be claimed by at least one task.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PAY-01 | unit | `npx vitest run tests/payments/tiers.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PAY-01 | integration (DB) | `npx vitest run tests/payments/order-create.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PAY-01 | unit (fetch mock) | `npx vitest run tests/payments/toss-client.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PAY-01 | unit (fetch mock) | `npx vitest run tests/payments/amount-tamper.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PAY-01 | integration (DB) | `npx vitest run tests/payments/order-status.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | **PAY-03** | integration (DB) | `npx vitest run tests/payments/no-credit-on-redirect.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | **PAY-03** | integration (DB + fetch mock) | `npx vitest run tests/payments/webhook-credit.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | **PAY-03** | integration (DB) | `npx vitest run tests/payments/webhook-idempotency.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | **PAY-03** | integration (DB + fetch mock) | `npx vitest run tests/payments/webhook-forged-body.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | **PAY-03** | unit | `npx vitest run tests/payments/webhook-guards.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-07 | unit | `npx vitest run tests/payments/fail-redirect.test.ts` | ❌ W0 | ⬜ pending |

**Behavior each file must prove:**

| File | Behavior |
|------|----------|
| `tiers.test.ts` | 4 tiers match D-01 prices/tokens exactly; `generateOrderId()` satisfies Toss constraints (6–64 chars, `[A-Za-z0-9_-]`) |
| `order-create.test.ts` | `createTopupOrder(tierId)` derives amount/tokens from the **server-side** tier table and writes a `payment_orders` row; accepts no client-supplied amount |
| `toss-client.test.ts` | `confirmPayment()` sends `Basic base64(sk:)` (colon included), `Idempotency-Key`, and the **stored** amount |
| `amount-tamper.test.ts` | successUrl query `amount` differing from the stored amount ⇒ confirm is **not called**, request fails |
| `order-status.test.ts` | after credit, `getTopupOrderStatus` returns `credited` (the D-05 polling contract) |
| `no-credit-on-redirect.test.ts` | **PAY-03 core:** the successUrl approval path does **not** change the balance — balance unchanged even after a successful confirm |
| `webhook-credit.test.ts` | credit happens only when the Toss **re-query** returns `DONE` **and** amount matches; balance increases by exactly `token_amount` |
| `webhook-idempotency.test.ts` | same webhook delivered 3× ⇒ 1 ledger row, balance increased once |
| `webhook-forged-body.test.ts` | forged body (`status:"DONE"`, inflated `totalAmount`) does not credit — the re-query result wins |
| `webhook-guards.test.ts` | unknown `orderId` / non-DONE status ⇒ no credit, still responds 200 |
| `fail-redirect.test.ts` | failUrl `PAY_PROCESS_CANCELED` handled without crashing **even when `orderId` is absent** |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/payments/` directory created (does not exist)
- [ ] `tests/helpers/toss.ts` — Toss `Payment` object fixture builder (parameterized `status`, `totalAmount`, `orderId`, `paymentKey`) + `global.fetch` mocking helper
- [ ] `supabase/migrations/0005_payments.sql` applied — prerequisite for every integration test
- [ ] `.env.example` gains `NEXT_PUBLIC_TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`
- [ ] `npm install @tosspayments/tosspayments-sdk` (2.8.1)

*Framework install: **not needed** — Vitest 4.1.11 already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Modal state transitions: tier select → paying → auto-close; cancel → tier select + toast | D-03 / D-05 / D-06 / D-07 | UI interaction; this repo has no component-test infrastructure | Open `AccountPanel` → `+` → select a tier → complete a Toss **test** payment → confirm modal auto-closes and balance updated. Repeat, cancelling in the Toss window → confirm modal returns to tier select with the `결제가 취소되었어요` toast |
| Real Toss test payment → real webhook delivery → balance increase | PAY-01 / PAY-03 | Requires a public tunnel (ngrok) — Toss cannot deliver to `localhost` | Register the `PAYMENT_STATUS_CHANGED` webhook in the Toss developer console pointing at the tunnel URL, run one test payment end-to-end |
| Forbidden UI absent (no timeout copy, no retry button, no elapsed timer, no verbatim Toss error code) | D-08 | Absence of UI; per `05-UI-SPEC.md` Forbidden UI list | Inspect the rendered modal in the `awaiting-credit` state and grep the built component for the forbidden strings |

> **Note:** the re-query verification design (webhook body = trigger, Toss re-query = truth) means the entire credit path is automatable **without a tunnel** — POSTing a synthetic body to the local endpoint yields the same result. The tunnel is required only for the final end-to-end confidence check.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

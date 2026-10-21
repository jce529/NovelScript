import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeWebhookDb } = await import('@/tests/helpers/toss');
  return { createAdminClient: () => fakeWebhookDb.client() };
});

import { POST } from '@/app/api/payments/toss/webhook/route';
import { fakeWebhookDb, installTossFetch, tossPayment, webhookBody, webhookRequest } from '@/tests/helpers/toss';

// In-memory RPC mirrors unique(wallet_id, reference_type, reference_id). This is NOT
// live-DB concurrency evidence; the independent-session proof is 05-07 Task 1.
describe('Toss webhook idempotency (mocked RPC boundary)', () => {
  beforeEach(() => {
    fakeWebhookDb.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('repeated delivery leaves one toss_topup ledger row and one balance increase', async () => {
    const order = fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment() });

    for (let i = 0; i < 4; i += 1) {
      const response = await POST(webhookRequest(webhookBody()));
      expect(response.status).toBe(200);
    }

    const rows = fakeWebhookDb.state.ledger.filter((r) => r.reference_type === 'toss_topup' && r.reference_id === order.order_id);
    expect(rows).toHaveLength(1);
    expect(fakeWebhookDb.state.balances.get(order.user_id)).toBe(300);
  });

  it('concurrent delivery for one order still credits once', async () => {
    const order = fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment() });

    const responses = await Promise.all(Array.from({ length: 6 }, () => POST(webhookRequest(webhookBody()))));

    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));
    expect(fakeWebhookDb.state.ledger).toHaveLength(1);
    expect(fakeWebhookDb.state.balances.get(order.user_id)).toBe(300);
    expect(fakeWebhookDb.state.orders.get(order.order_id)?.credited_at).toEqual(expect.any(String));
  });

  it('returns 500 when the RPC fails and leaves the order uncredited', async () => {
    const order = fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment() });
    fakeWebhookDb.state.failRpc = true;

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(500);
    expect(fakeWebhookDb.state.ledger).toHaveLength(0);
    expect(fakeWebhookDb.state.orders.get(order.order_id)?.credited_at).toBeNull();
  });

  it('returns 500 when credited_at update fails; the Toss retry repairs it without extra credit', async () => {
    const order = fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment() });
    fakeWebhookDb.state.failUpdate = 1;

    const first = await POST(webhookRequest(webhookBody()));
    expect(first.status).toBe(500);
    expect(fakeWebhookDb.state.ledger).toHaveLength(1);
    expect(fakeWebhookDb.state.orders.get(order.order_id)?.credited_at).toBeNull();

    const retry = await POST(webhookRequest(webhookBody()));
    expect(retry.status).toBe(200);
    expect(fakeWebhookDb.state.ledger).toHaveLength(1);
    expect(fakeWebhookDb.state.balances.get(order.user_id)).toBe(300);
    expect(fakeWebhookDb.state.orders.get(order.order_id)?.credited_at).toEqual(expect.any(String));
  });
});

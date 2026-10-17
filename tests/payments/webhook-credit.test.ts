import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const catalog = vi.hoisted(() => ({ getTopupTier: vi.fn(), listTopupTiers: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeWebhookDb } = await import('@/tests/helpers/toss');
  return { createAdminClient: () => fakeWebhookDb.client() };
});
vi.mock('@/lib/payments/catalog', () => catalog);

import { POST } from '@/app/api/payments/toss/webhook/route';
import { fakeWebhookDb, installTossFetch, tossPayment, webhookBody, webhookRequest } from '@/tests/helpers/toss';

describe('Toss webhook credits a verified DONE payment', () => {
  beforeEach(() => {
    fakeWebhookDb.reset();
    catalog.getTopupTier.mockReset();
    catalog.listTopupTiers.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('credits the stored order snapshot through apply_wallet_delta exactly once', async () => {
    const order = fakeWebhookDb.seedOrder();
    const fetchMock = installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tosspayments.com/v1/payments/orders/ns_order_123456');
    expect(init.method).toBe('GET');
    expect(fakeWebhookDb.state.rpcCalls).toEqual([
      {
        fn: 'apply_wallet_delta',
        args: {
          p_wallet_id: order.user_id,
          p_delta: 300,
          p_reference_type: 'toss_topup',
          p_reference_id: 'ns_order_123456',
          p_reason: 'topup:t300',
        },
      },
    ]);
    expect(fakeWebhookDb.state.ledger).toHaveLength(1);
    expect(fakeWebhookDb.state.balances.get(order.user_id)).toBe(300);
    expect(fakeWebhookDb.state.orders.get(order.order_id)?.credited_at).toEqual(expect.any(String));
  });

  it('credits order.token_amount even after the catalog bundle was disabled or re-priced', async () => {
    // The operator disabled the bundle and would now sell it at a different price/label.
    catalog.getTopupTier.mockResolvedValue(null);
    catalog.listTopupTiers.mockResolvedValue([{ id: 't300', tokens: 999, priceKrw: 100, label: '긴급 할인' }]);
    const order = fakeWebhookDb.seedOrder({ tier_id: 't300', amount_krw: 2850, token_amount: 300 });
    installTossFetch({ body: tossPayment({ totalAmount: 2850 }) });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(200);
    expect(catalog.getTopupTier).not.toHaveBeenCalled();
    expect(catalog.listTopupTiers).not.toHaveBeenCalled();
    expect(fakeWebhookDb.state.ledger).toEqual([
      expect.objectContaining({ wallet_id: order.user_id, delta: 300, reference_type: 'toss_topup', reference_id: order.order_id }),
    ]);
    expect(fakeWebhookDb.state.balances.get(order.user_id)).toBe(300);
  });

  it('preserves a prior credited_at and never adds a second credit', async () => {
    const creditedAt = '2026-10-01T00:00:00.000Z';
    const order = fakeWebhookDb.seedOrder({ credited_at: creditedAt });
    installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(200);
    expect(fakeWebhookDb.state.orders.get(order.order_id)?.credited_at).toBe(creditedAt);
    expect(fakeWebhookDb.state.ledger.length).toBeLessThanOrEqual(1);
    expect(fakeWebhookDb.state.balances.get(order.user_id)).toBeLessThanOrEqual(300);
  });
});

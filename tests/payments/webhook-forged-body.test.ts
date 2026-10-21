import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeWebhookDb } = await import('@/tests/helpers/toss');
  return { createAdminClient: () => fakeWebhookDb.client() };
});

import { POST } from '@/app/api/payments/toss/webhook/route';
import { fakeWebhookDb, installTossFetch, tossPayment, webhookBody, webhookRequest } from '@/tests/helpers/toss';

describe('Toss webhook ignores forged body fields', () => {
  beforeEach(() => {
    fakeWebhookDb.reset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not credit when the body claims DONE but the authenticated lookup is not DONE', async () => {
    fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment({ status: 'IN_PROGRESS' }) });

    const response = await POST(webhookRequest(webhookBody({ status: 'DONE', totalAmount: 2850 })));

    expect(response.status).toBe(200);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('credits only the stored token snapshot regardless of forged amount/token/user fields', async () => {
    const order = fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment() });

    const response = await POST(
      webhookRequest(
        webhookBody({ status: 'DONE', totalAmount: 9_000_000, tokenAmount: 1_000_000, userId: 'attacker', tierId: 't1000' })
      )
    );

    expect(response.status).toBe(200);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(1);
    expect(fakeWebhookDb.state.rpcCalls[0].args).toMatchObject({ p_wallet_id: order.user_id, p_delta: 300, p_reason: 'topup:t300' });
  });

  it('refuses credit when the Toss totalAmount differs from the stored amount', async () => {
    fakeWebhookDb.seedOrder({ amount_krw: 2850 });
    installTossFetch({ body: tossPayment({ totalAmount: 100 }) });

    const response = await POST(webhookRequest(webhookBody({ totalAmount: 2850 })));

    expect(response.status).toBe(200);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('requires an exact numeric amount match (no string coercion)', async () => {
    fakeWebhookDb.seedOrder({ amount_krw: 2850 });
    installTossFetch({ body: tossPayment({ totalAmount: '2850' }) });

    await POST(webhookRequest(webhookBody()));

    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('refuses credit when the authenticated Toss orderId differs from the stored order', async () => {
    fakeWebhookDb.seedOrder();
    installTossFetch({ body: tossPayment({ orderId: 'ns_someone_else_paid' }) });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(200);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', async () => {
  const { fakeWebhookDb } = await import('@/tests/helpers/toss');
  return { createAdminClient: () => fakeWebhookDb.client() };
});

import { POST } from '@/app/api/payments/toss/webhook/route';
import { fakeWebhookDb, installTossFetch, tossPayment, webhookBody, webhookRequest } from '@/tests/helpers/toss';

describe('Toss webhook guards', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fakeWebhookDb.reset();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('acknowledges invalid JSON without lookup or credit', async () => {
    fakeWebhookDb.seedOrder();
    const fetchMock = installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest('{not json'));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('ignores unrelated event types', async () => {
    fakeWebhookDb.seedOrder();
    const fetchMock = installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest(webhookBody({}, 'DEPOSIT_CALLBACK')));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it.each([
    ['missing', undefined],
    ['non-string', 12345678],
    ['too short', 'ns_1'],
    ['too long', `ns_${'a'.repeat(70)}`],
    ['path characters', 'ns_order/../../v1/payouts'],
  ])('rejects a %s orderId without lookup', async (_label, orderId) => {
    const fetchMock = installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest(JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId } })));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('acknowledges an unknown order without calling Toss', async () => {
    const fetchMock = installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest(webhookBody({ orderId: 'ns_unknown_order' })));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('returns 500 when the order lookup fails so Toss retries', async () => {
    fakeWebhookDb.seedOrder();
    fakeWebhookDb.state.failSelect = true;
    installTossFetch({ body: tossPayment() });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(500);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it.each(['READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED'])(
    'does not credit a %s payment',
    async (status) => {
      fakeWebhookDb.seedOrder();
      installTossFetch({ body: tossPayment({ status }) });

      const response = await POST(webhookRequest(webhookBody({ status: 'DONE' })));

      expect(response.status).toBe(200);
      expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
    }
  );

  it('returns 500 on a Toss network failure without credit', async () => {
    fakeWebhookDb.seedOrder();
    installTossFetch(new Error('network down'));

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(500);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('returns 500 on a Toss API error so the delivery is retried', async () => {
    fakeWebhookDb.seedOrder();
    installTossFetch({ status: 500, body: { code: 'FAILED_INTERNAL_SYSTEM_PROCESSING', message: 'try again' } });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(500);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('acknowledges a payment Toss does not know about', async () => {
    fakeWebhookDb.seedOrder();
    installTossFetch({ status: 404, body: { code: 'NOT_FOUND_PAYMENT', message: 'not found' } });

    const response = await POST(webhookRequest(webhookBody()));

    expect(response.status).toBe(200);
    expect(fakeWebhookDb.state.rpcCalls).toHaveLength(0);
  });

  it('never logs the secret key or paymentKey', async () => {
    fakeWebhookDb.seedOrder({ amount_krw: 2850 });
    installTossFetch({ body: tossPayment({ totalAmount: 1, paymentKey: 'tgen_secret_payment_key' }) });

    await POST(webhookRequest(webhookBody({ paymentKey: 'tgen_secret_payment_key' })));
    fakeWebhookDb.state.failRpc = true;
    installTossFetch({ body: tossPayment({ paymentKey: 'tgen_secret_payment_key' }) });
    await POST(webhookRequest(webhookBody({ paymentKey: 'tgen_secret_payment_key' })));

    const logged = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(logged.length).toBeGreaterThan(2);
    expect(logged).not.toContain('tgen_secret_payment_key');
    expect(logged).not.toContain('test_sk_unit_only');
  });
});

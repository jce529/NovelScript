import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { confirmPayment, getPaymentByOrderId } from '@/lib/payments/toss';

describe('Toss server client', () => {
  const originalSecret = process.env.TOSS_SECRET_KEY;
  const fetchMock = vi.fn();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalSecret === undefined) delete process.env.TOSS_SECRET_KEY;
    else process.env.TOSS_SECRET_KEY = originalSecret;
  });

  it('confirms with Basic auth, stored amount, idempotency key and a 15 second timeout', async () => {
    process.env.TOSS_SECRET_KEY = 'test_secret';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'DONE' }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(confirmPayment({ paymentKey: 'pay_123', orderId: 'ns_123', amount: 2850, idempotencyKey: 'idem_123' }))
      .resolves.toMatchObject({ ok: true, payment: { status: 'DONE' } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tosspayments.com/v1/payments/confirm');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${Buffer.from('test_secret:').toString('base64')}`);
    expect(new Headers(init.headers).get('Idempotency-Key')).toBe('idem_123');
    expect(JSON.parse(String(init.body))).toEqual({ paymentKey: 'pay_123', orderId: 'ns_123', amount: 2850 });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('looks up an encoded order ID without cache and with a 5 second timeout', async () => {
    process.env.TOSS_SECRET_KEY = 'test_secret';
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'DONE' }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPaymentByOrderId('ns_id/with space')).resolves.toMatchObject({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.tosspayments.com/v1/payments/orders/ns_id%2Fwith%20space');
    expect(init.cache).toBe('no-store');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Basic ${Buffer.from('test_secret:').toString('base64')}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('returns a typed failure for unsuccessful responses without exposing secrets', async () => {
    process.env.TOSS_SECRET_KEY = 'test_secret';
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ code: 'UNAUTHORIZED', message: 'bad key' }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getPaymentByOrderId('ns_123')).resolves.toEqual({ ok: false, code: 'UNAUTHORIZED', message: 'bad key' });
  });
});

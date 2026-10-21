import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = [op: string, column: string, value: unknown];
type UpdateCall = { table: string; values: Record<string, unknown>; filters: Filter[] };

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  selectError: null as unknown,
  updateError: null as unknown,
  tables: [] as string[],
  selectFilters: [] as Filter[],
  updates: [] as UpdateCall[],
  rpc: vi.fn(),
  confirm: vi.fn(),
  getTier: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => {
      state.rpc(...args);
      throw new Error('success return must never call an RPC');
    },
    from: (table: string) => {
      state.tables.push(table);
      if (table !== 'payment_orders') throw new Error(`success return must not touch ${table}`);
      return {
        select: () => {
          const builder = {
            eq: (column: string, value: unknown) => {
              state.selectFilters.push(['eq', column, value]);
              return builder;
            },
            maybeSingle: async () => ({ data: state.order, error: state.selectError }),
          };
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          const call: UpdateCall = { table, values, filters: [] };
          state.updates.push(call);
          const builder = {
            eq: (column: string, value: unknown) => {
              call.filters.push(['eq', column, value]);
              return builder;
            },
            is: (column: string, value: unknown) => {
              call.filters.push(['is', column, value]);
              return builder;
            },
            then: (resolve: (value: { error: unknown }) => unknown) => resolve({ error: state.updateError }),
          };
          return builder;
        },
        insert: () => {
          throw new Error('success return must not insert');
        },
        upsert: () => {
          throw new Error('success return must not upsert');
        },
        delete: () => {
          throw new Error('success return must not delete');
        },
      };
    },
  }),
}));
vi.mock('@/lib/payments/toss', () => ({ confirmPayment: state.confirm }));
vi.mock('@/lib/payments/catalog', () => ({ getTopupTier: state.getTier }));

import { GET } from '@/app/api/payments/toss/success/route';

const BASE = 'https://app.example/api/payments/toss/success';

function successRequest(params: Record<string, string>) {
  return new Request(`${BASE}?${new URLSearchParams(params).toString()}`);
}

function validRequest(overrides: Record<string, string> = {}) {
  return successRequest({ paymentKey: 'pk_test', orderId: 'ns_order_123', amount: '2850', paymentType: 'NORMAL', ...overrides });
}

function expectNoConfirm() {
  expect(state.confirm).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
}

describe('Toss success return amount validation', () => {
  beforeEach(() => {
    state.order = {
      order_id: 'ns_order_123',
      tier_id: 't300',
      amount_krw: 2850,
      token_amount: 300,
      return_path: '/studio?tab=drafts',
      confirm_idempotency_key: 'idem-1',
      authenticated_at: null,
      confirmed_at: null,
      credited_at: null,
    };
    state.selectError = null;
    state.updateError = null;
    state.tables.length = 0;
    state.selectFilters.length = 0;
    state.updates.length = 0;
    state.rpc.mockReset();
    state.confirm.mockReset();
    state.getTier.mockReset().mockResolvedValue({ id: 't300', tokens: 300, priceKrw: 2850, label: null });
  });

  it('rejects a client amount mismatch before calling Toss', async () => {
    const response = await GET(validRequest({ amount: '1' }));
    expectNoConfirm();
    expect(state.updates).toEqual([]);
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topupFail=1');
  });

  it('rejects an unknown order before calling Toss and falls back to home', async () => {
    state.order = null;
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(state.getTier).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://app.example/?topupFail=1');
  });

  it('rejects malformed return parameters without looking anything up at Toss', async () => {
    for (const params of <Array<Record<string, string>>>[
      { orderId: 'ns_order_123', amount: '2850' },
      { paymentKey: 'pk_test', orderId: 'ns_order_123', amount: 'abc' },
      { paymentKey: 'pk_test', orderId: 'ns_order_123', amount: '2850.0' },
      { paymentKey: 'pk_test', orderId: 'ns_order_123', amount: '-2850' },
      { paymentKey: 'pk test', orderId: 'ns_order_123', amount: '2850' },
    ]) {
      const response = await GET(successRequest(params));
      expect(response.headers.get('location')).toContain('topupFail=1');
    }
    const badOrder = await GET(successRequest({ paymentKey: 'pk_test', orderId: '../x', amount: '2850' }));
    expect(badOrder.headers.get('location')).toBe('https://app.example/?topupFail=1');
    expectNoConfirm();
    expect(state.updates).toEqual([]);
  });

  it('rejects when the catalog price for the tier changed after the order was issued', async () => {
    state.getTier.mockResolvedValue({ id: 't300', tokens: 300, priceKrw: 3000, label: null });
    const response = await GET(validRequest());
    expect(state.getTier).toHaveBeenCalledWith('t300');
    expectNoConfirm();
    expect(state.updates).toEqual([]);
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topupFail=1');
  });

  it('rejects when a matching URL amount disagrees with a re-priced catalog', async () => {
    state.getTier.mockResolvedValue({ id: 't300', tokens: 300, priceKrw: 3000, label: null });
    const response = await GET(validRequest({ amount: '3000' }));
    expectNoConfirm();
    expect(response.headers.get('location')).toContain('topupFail=1');
  });

  it('rejects when the catalog token amount changed', async () => {
    state.getTier.mockResolvedValue({ id: 't300', tokens: 330, priceKrw: 2850, label: null });
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(state.updates).toEqual([]);
    expect(response.headers.get('location')).toContain('topupFail=1');
  });

  it('rejects when the tier is no longer on sale (missing, disabled or expired)', async () => {
    state.getTier.mockResolvedValue(undefined);
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(state.updates).toEqual([]);
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topupFail=1');
  });

  it('returns a retryable server error when the catalog lookup fails, without calling Toss', async () => {
    state.getTier.mockRejectedValue(new Error('Unable to load top-up tier'));
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get('location')).toBeNull();
    expect(state.updates).toEqual([]);
  });

  it('returns a retryable server error when the order lookup fails, without calling Toss', async () => {
    state.selectError = { message: 'connection reset' };
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(state.getTier).not.toHaveBeenCalled();
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get('location')).toBeNull();
  });

  it('uses the stored amount and fixed idempotency key when confirming', async () => {
    state.confirm.mockResolvedValue({ ok: true, payment: { status: 'DONE' } });
    const response = await GET(validRequest());
    expect(state.selectFilters).toContainEqual(['eq', 'order_id', 'ns_order_123']);
    expect(state.confirm).toHaveBeenCalledTimes(1);
    expect(state.confirm).toHaveBeenCalledWith({ paymentKey: 'pk_test', orderId: 'ns_order_123', amount: 2850, idempotencyKey: 'idem-1' });
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topup=ns_order_123');
  });

  it('accepts a brand-new DB tier ID without code changes', async () => {
    state.order = { ...state.order, tier_id: 'spring_promo_2026', amount_krw: 4900, token_amount: 600 };
    state.getTier.mockResolvedValue({ id: 'spring_promo_2026', tokens: 600, priceKrw: 4900, label: '봄 한정' });
    state.confirm.mockResolvedValue({ ok: true, payment: { status: 'DONE' } });
    const response = await GET(validRequest({ amount: '4900' }));
    expect(state.getTier).toHaveBeenCalledWith('spring_promo_2026');
    expect(state.confirm).toHaveBeenCalledWith({ paymentKey: 'pk_test', orderId: 'ns_order_123', amount: 4900, idempotencyKey: 'idem-1' });
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topup=ns_order_123');
  });

  it('stores payment_key and authenticated_at before calling confirm', async () => {
    state.confirm.mockImplementation(async () => {
      expect(state.updates).toHaveLength(1);
      expect(state.updates[0].values).toEqual({ payment_key: 'pk_test', authenticated_at: expect.any(String) });
      return { ok: true, payment: { status: 'DONE' } };
    });
    await GET(validRequest());
    expect(state.confirm).toHaveBeenCalledTimes(1);
  });

  it('does not call Toss when storing the payment key fails', async () => {
    state.updateError = { message: 'write failed' };
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ['confirmed', { confirmed_at: '2026-10-01T00:00:00Z' }],
    ['credited', { confirmed_at: '2026-10-01T00:00:00Z', credited_at: '2026-10-01T00:00:01Z' }],
    ['credited by an early webhook', { credited_at: '2026-10-01T00:00:01Z' }],
  ])('keeps the original snapshot of an already %s order even when the catalog changed', async (_label, extra) => {
    state.order = { ...state.order, ...extra };
    state.getTier.mockResolvedValue({ id: 't300', tokens: 999, priceKrw: 9999, label: null });
    const response = await GET(validRequest());
    expectNoConfirm();
    expect(state.getTier).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topup=ns_order_123');
  });

  it('records a Toss confirm failure server-side without echoing the Toss error into the URL', async () => {
    state.confirm.mockResolvedValue({ ok: false, code: 'REJECT_CARD_COMPANY', message: '카드사 거절 secret-detail' });
    const response = await GET(validRequest());
    const location = response.headers.get('location') ?? '';
    expect(location).toBe('https://app.example/studio?tab=drafts&topupFail=1');
    expect(location).not.toContain('REJECT_CARD_COMPANY');
    expect(location).not.toContain('secret-detail');
    const failure = state.updates.find((call) => 'failed_at' in call.values);
    expect(failure?.values).toEqual({ failed_at: expect.any(String), fail_code: 'REJECT_CARD_COMPANY' });
    expect(failure?.filters).toContainEqual(['is', 'credited_at', null]);
    expect(state.updates.some((call) => 'credited_at' in call.values || 'confirmed_at' in call.values)).toBe(false);
  });

  it('returns a retryable server error when the confirm call itself fails (outcome unknown)', async () => {
    state.confirm.mockRejectedValue(new Error('The operation was aborted due to timeout'));
    const response = await GET(validRequest());
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get('location')).toBeNull();
    expect(state.updates.some((call) => 'failed_at' in call.values || 'confirmed_at' in call.values)).toBe(false);
    expect(await response.text()).not.toContain('aborted');
  });
});

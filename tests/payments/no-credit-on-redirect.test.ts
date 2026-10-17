import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = [op: string, column: string, value: unknown];
type UpdateCall = { table: string; values: Record<string, unknown>; filters: Filter[] };

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  tables: [] as string[],
  updates: [] as UpdateCall[],
  forbidden: [] as string[],
  rpc: vi.fn(),
  confirm: vi.fn(),
  getTier: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => {
      state.rpc(...args);
      throw new Error('success return must never call an RPC (apply_wallet_delta is webhook-only)');
    },
    from: (table: string) => {
      state.tables.push(table);
      if (table !== 'payment_orders') {
        state.forbidden.push(table);
        throw new Error(`success return must not touch ${table}`);
      }
      return {
        select: () => {
          const builder = { eq: () => builder, maybeSingle: async () => ({ data: state.order, error: null }) };
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
            then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
          };
          return builder;
        },
        insert: () => {
          state.forbidden.push(`${table}.insert`);
          throw new Error('success return must not insert');
        },
        upsert: () => {
          state.forbidden.push(`${table}.upsert`);
          throw new Error('success return must not upsert');
        },
      };
    },
  }),
}));
vi.mock('@/lib/payments/toss', () => ({ confirmPayment: state.confirm }));
vi.mock('@/lib/payments/catalog', () => ({ getTopupTier: state.getTier }));

import { GET } from '@/app/api/payments/toss/success/route';

const REQUEST_URL = 'https://app.example/api/payments/toss/success?paymentKey=pk_test&orderId=ns_order_123&amount=2850&paymentType=NORMAL';

function expectNoWalletSideEffects() {
  expect(state.rpc).not.toHaveBeenCalled();
  expect(state.forbidden).toEqual([]);
  expect(state.tables.every((table) => table === 'payment_orders')).toBe(true);
  expect(state.updates.some((call) => 'credited_at' in call.values)).toBe(false);
  expect(state.updates.some((call) => 'token_amount' in call.values || 'amount_krw' in call.values)).toBe(false);
}

describe('Toss success redirect does not credit the wallet', () => {
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
    state.tables.length = 0;
    state.updates.length = 0;
    state.forbidden.length = 0;
    state.rpc.mockReset();
    state.confirm.mockReset().mockResolvedValue({ ok: true, payment: { status: 'DONE' } });
    state.getTier.mockReset().mockResolvedValue({ id: 't300', tokens: 300, priceKrw: 2850, label: null });
  });

  it('records confirmation metadata but never changes wallet or ledger state', async () => {
    const response = await GET(new Request(REQUEST_URL));
    expect(state.confirm).toHaveBeenCalledTimes(1);
    expect(state.updates.map((call) => call.values)).toEqual([
      { payment_key: 'pk_test', authenticated_at: expect.any(String) },
      { confirmed_at: expect.any(String) },
    ]);
    expect(state.updates.every((call) => call.filters.some(([op, column, value]) => op === 'eq' && column === 'order_id' && value === 'ns_order_123'))).toBe(true);
    expectNoWalletSideEffects();
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topup=ns_order_123');
  });

  it('preserves the existing query and adds exactly one topup marker', async () => {
    state.order = { ...state.order, return_path: '/studio?tab=drafts&topup=ns_stale_order' };
    const response = await GET(new Request(REQUEST_URL));
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.origin).toBe('https://app.example');
    expect(location.pathname).toBe('/studio');
    expect(location.searchParams.get('tab')).toBe('drafts');
    expect(location.searchParams.getAll('topup')).toEqual(['ns_order_123']);
    expect(location.searchParams.has('paymentKey')).toBe(false);
    expect(location.searchParams.has('amount')).toBe(false);
    expect(location.toString()).not.toContain('pk_test');
    expectNoWalletSideEffects();
  });

  it('never leaves the app origin even if a stored return_path is hostile', async () => {
    state.order = { ...state.order, return_path: '/\\evil.example/steal' };
    const response = await GET(new Request(REQUEST_URL));
    expect(response.headers.get('location')).toBe('https://app.example/?topup=ns_order_123');
  });

  it('does not credit when the webhook already credited the order (race)', async () => {
    state.order = { ...state.order, credited_at: '2026-10-01T00:00:01Z' };
    const response = await GET(new Request(REQUEST_URL));
    expect(state.confirm).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
    expectNoWalletSideEffects();
    expect(response.headers.get('location')).toBe('https://app.example/studio?tab=drafts&topup=ns_order_123');
  });

  it('a repeated return (refresh/back) never confirms or credits twice', async () => {
    await GET(new Request(REQUEST_URL));
    state.order = { ...state.order, confirmed_at: '2026-10-01T00:00:00Z' };
    await GET(new Request(REQUEST_URL));
    expect(state.confirm).toHaveBeenCalledTimes(1);
    expectNoWalletSideEffects();
  });

  it('the success route source contains no wallet credit path', () => {
    const source = readFileSync(path.resolve(__dirname, '../../app/api/payments/toss/success/route.ts'), 'utf8');
    expect(source).not.toMatch(/apply_wallet_delta/);
    expect(source).not.toMatch(/\.rpc\(/);
    expect(source).not.toMatch(/['"]wallets['"]/);
    expect(source).not.toMatch(/['"]ledger_entries['"]/);
    expect(source).not.toMatch(/credited_at\s*:/);
  });
});

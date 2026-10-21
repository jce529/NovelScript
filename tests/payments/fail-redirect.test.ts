import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = [op: string, column: string, value: unknown];
type UpdateCall = { values: Record<string, unknown>; filters: Filter[] };

const state = vi.hoisted(() => ({
  order: null as Record<string, unknown> | null,
  selectError: null as unknown,
  lookups: 0,
  tables: [] as string[],
  updates: [] as UpdateCall[],
  rpc: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => {
      state.rpc(...args);
      throw new Error('fail return must never call an RPC');
    },
    from: (table: string) => {
      state.tables.push(table);
      if (table !== 'payment_orders') throw new Error(`fail return must not touch ${table}`);
      return {
        select: () => {
          const builder = {
            eq: () => builder,
            maybeSingle: async () => {
              state.lookups += 1;
              return { data: state.order, error: state.selectError };
            },
          };
          return builder;
        },
        update: (values: Record<string, unknown>) => {
          const call: UpdateCall = { values, filters: [] };
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
      };
    },
  }),
}));

import { GET } from '@/app/api/payments/toss/fail/route';

const BASE = 'https://app.example/api/payments/toss/fail';

describe('Toss fail redirect', () => {
  beforeEach(() => {
    state.order = { order_id: 'ns_order_123', return_path: '/studio?tab=drafts', credited_at: null };
    state.selectError = null;
    state.lookups = 0;
    state.tables.length = 0;
    state.updates.length = 0;
    state.rpc.mockReset();
  });

  it('returns to the stored path and preserves its query without forwarding Toss errors', async () => {
    const response = await GET(new Request(`${BASE}?orderId=ns_order_123&code=CANCELED&message=secret`));
    const location = response.headers.get('location') ?? '';
    expect(location).toBe('https://app.example/studio?tab=drafts&topupFail=1');
    expect(location).not.toContain('CANCELED');
    expect(location).not.toContain('secret');
  });

  it('falls back to home when orderId is missing, without a lookup', async () => {
    const response = await GET(new Request(`${BASE}?code=CANCELED&message=secret`));
    expect(response.headers.get('location')).toBe('https://app.example/?topupFail=1');
    expect(state.lookups).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it('falls back to home for an unknown or malformed orderId', async () => {
    state.order = null;
    const unknown = await GET(new Request(`${BASE}?orderId=ns_missing_1&code=CANCELED`));
    expect(unknown.headers.get('location')).toBe('https://app.example/?topupFail=1');
    const malformed = await GET(new Request(`${BASE}?orderId=../x&code=CANCELED`));
    expect(malformed.headers.get('location')).toBe('https://app.example/?topupFail=1');
    expect(state.updates).toEqual([]);
  });

  it('still redirects home when the order lookup fails', async () => {
    state.selectError = { message: 'connection reset' };
    const response = await GET(new Request(`${BASE}?orderId=ns_order_123&code=CANCELED`));
    expect(response.headers.get('location')).toBe('https://app.example/?topupFail=1');
  });

  it('adds exactly one topupFail marker and drops stale return markers', async () => {
    state.order = { ...state.order, return_path: '/studio?tab=drafts&topupFail=1&topup=ns_old' };
    const response = await GET(new Request(`${BASE}?orderId=ns_order_123&code=CANCELED`));
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/studio');
    expect(location.searchParams.get('tab')).toBe('drafts');
    expect(location.searchParams.getAll('topupFail')).toEqual(['1']);
    expect(location.searchParams.has('topup')).toBe(false);
  });

  it('ignores any client-supplied return path and never leaves the app origin', async () => {
    state.order = { ...state.order, return_path: '/\\evil.example/steal' };
    const response = await GET(
      new Request(`${BASE}?orderId=ns_order_123&returnPath=https://evil.example&next=//evil.example`),
    );
    expect(response.headers.get('location')).toBe('https://app.example/?topupFail=1');
  });

  it('records failure server-side without ever overwriting credited_at or touching wallets', async () => {
    await GET(new Request(`${BASE}?orderId=ns_order_123&code=PAY_PROCESS_CANCELED&message=secret`));
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].values).toEqual({ failed_at: expect.any(String), fail_code: 'PAY_PROCESS_CANCELED' });
    expect(state.updates[0].filters).toContainEqual(['eq', 'order_id', 'ns_order_123']);
    expect(state.updates[0].filters).toContainEqual(['is', 'credited_at', null]);
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.tables.every((table) => table === 'payment_orders')).toBe(true);
  });

  it('does not record a failure for an already credited or confirmed order', async () => {
    state.order = { ...state.order, credited_at: '2026-10-01T00:00:01Z' };
    await GET(new Request(`${BASE}?orderId=ns_order_123&code=CANCELED`));
    state.order = { ...state.order, credited_at: null, confirmed_at: '2026-10-01T00:00:00Z' };
    await GET(new Request(`${BASE}?orderId=ns_order_123&code=CANCELED`));
    expect(state.updates).toEqual([]);
  });

  it('the fail route source contains no wallet credit path', () => {
    const source = readFileSync(path.resolve(__dirname, '../../app/api/payments/toss/fail/route.ts'), 'utf8');
    expect(source).not.toMatch(/apply_wallet_delta/);
    expect(source).not.toMatch(/\.rpc\(/);
    expect(source).not.toMatch(/['"]wallets['"]/);
    expect(source).not.toMatch(/['"]ledger_entries['"]/);
    expect(source).not.toMatch(/credited_at\s*:/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unit tests with a fake Supabase query builder: no remote project, no Toss keys.
type TierRow = {
  id: string; tokens: number | string; price_krw: number; is_active: boolean; sort_order: number;
  starts_at: string | null; ends_at: string | null;
  label: string | null; label_starts_at: string | null; label_ends_at: string | null;
};
type Insert = { table: string; row: Record<string, unknown> };

const state = vi.hoisted(() => ({
  rows: [] as TierRow[],
  tierError: null as { message: string } | null,
  inserts: [] as Insert[],
  userId: 'user-1' as string | null,
  balance: 777 as number | null,
  walletError: null as { message: string } | null,
  walletFilters: [] as [string, unknown][],
}));

function tierBuilder() {
  const filters: [string, unknown][] = [];
  const result = () => state.tierError
    ? { data: null, error: state.tierError }
    : { data: state.rows.filter((row) => filters.every(([col, val]) => (row as Record<string, unknown>)[col] === val)), error: null };
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => { filters.push([col, val]); return builder; },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      const res = result();
      return res.error ? res : { data: res.data![0] ?? null, error: null };
    },
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => table === 'payment_topup_tiers'
      ? tierBuilder()
      : { insert: async (row: Record<string, unknown>) => { state.inserts.push({ table, row }); return { error: null }; } },
  }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.userId ? { id: state.userId } : null }, error: null }) },
    from: () => {
      const b = {
        select: () => b,
        eq: (col: string, val: unknown) => { state.walletFilters.push([col, val]); return b; },
        maybeSingle: async () => state.walletError
          ? { data: null, error: state.walletError }
          : { data: state.balance === null ? null : { balance: state.balance }, error: null },
      };
      return b;
    },
  }),
}));

import { getTopupTier, listTopupTiers } from '@/lib/payments/catalog';
import { createTopupOrderAction, listTopupTiersAction } from '@/lib/payments/actions';

const NOW = new Date('2026-10-17T12:00:00.000Z');
const row = (over: Partial<TierRow> & { id: string }): TierRow => ({
  tokens: 100, price_krw: 1000, is_active: true, sort_order: 0,
  starts_at: null, ends_at: null, label: null, label_starts_at: null, label_ends_at: null, ...over,
});
const seed = () => [
  row({ id: 't1000', tokens: 1000, price_krw: 9000, sort_order: 40 }),
  row({ id: 't100', tokens: 100, price_krw: 1000, sort_order: 10 }),
  row({ id: 't550', tokens: 550, price_krw: 5000, sort_order: 30 }),
  row({ id: 't300', tokens: 300, price_krw: 2850, sort_order: 20 }),
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.rows = seed();
  state.tierError = null;
  state.inserts = [];
  state.userId = 'user-1';
  state.balance = 777;
  state.walletError = null;
  state.walletFilters = [];
});
afterEach(() => { vi.useRealTimers(); });

describe('listTopupTiers', () => {
  it('returns the seeded four in sort order as client-safe DTOs', async () => {
    await expect(listTopupTiers()).resolves.toEqual([
      { id: 't100', tokens: 100, priceKrw: 1000, label: null },
      { id: 't300', tokens: 300, priceKrw: 2850, label: null },
      { id: 't550', tokens: 550, priceKrw: 5000, label: null },
      { id: 't1000', tokens: 1000, priceKrw: 9000, label: null },
    ]);
  });

  it('breaks sort_order ties by id for a stable order', async () => {
    state.rows = [row({ id: 'b', sort_order: 1 }), row({ id: 'a', sort_order: 1 }), row({ id: 'c', sort_order: 0 })];
    expect((await listTopupTiers()).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('includes new DB bundles and hides inactive, not-yet-started and expired ones', async () => {
    state.rows = [
      ...seed(),
      row({ id: 'evt_live', sort_order: 50, starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-31T00:00:00Z' }),
      row({ id: 'evt_off', sort_order: 51, is_active: false }),
      row({ id: 'evt_future', sort_order: 52, starts_at: '2026-10-18T00:00:00Z' }),
      row({ id: 'evt_past', sort_order: 53, ends_at: '2026-10-17T12:00:00.000Z' }),
    ];
    const ids = (await listTopupTiers()).map((t) => t.id);
    expect(ids).toContain('evt_live');
    expect(ids).not.toContain('evt_off');
    expect(ids).not.toContain('evt_future');
    expect(ids).not.toContain('evt_past');
  });

  it('shows a label only inside its own display window', async () => {
    state.rows = [
      row({ id: 'l_open', sort_order: 1, label: '상시 라벨' }),
      row({ id: 'l_live', sort_order: 2, label: '기간 한정', label_starts_at: '2026-10-10T00:00:00Z', label_ends_at: '2026-10-20T00:00:00Z' }),
      row({ id: 'l_early', sort_order: 3, label: '예정', label_starts_at: '2026-10-18T00:00:00Z' }),
      row({ id: 'l_over', sort_order: 4, label: '종료', label_ends_at: '2026-10-01T00:00:00Z' }),
      row({ id: 'l_blank', sort_order: 5, label: '   ' }),
    ];
    expect((await listTopupTiers()).map((t) => t.label)).toEqual(['상시 라벨', '기간 한정', null, null, null]);
  });

  it('returns an empty list when nothing is on sale', async () => {
    state.rows = [];
    await expect(listTopupTiers()).resolves.toEqual([]);
  });

  it('surfaces DB errors instead of falling back to fixed prices', async () => {
    state.tierError = { message: 'boom' };
    await expect(listTopupTiers()).rejects.toThrow();
  });

  it('rejects rows with unsafe numbers', async () => {
    state.rows = [row({ id: 'huge', tokens: '9007199254740993' })];
    await expect(listTopupTiers()).rejects.toThrow();
    state.rows = [row({ id: 'neg', price_krw: -5 })];
    await expect(listTopupTiers()).rejects.toThrow();
  });
});

describe('getTopupTier', () => {
  it('resolves an on-sale bundle and rejects unknown, inactive, future, expired and malformed IDs', async () => {
    state.rows = [
      ...seed(),
      row({ id: 'evt_off', is_active: false }),
      row({ id: 'evt_future', starts_at: '2026-11-01T00:00:00Z' }),
      row({ id: 'evt_past', ends_at: '2026-10-01T00:00:00Z' }),
    ];
    await expect(getTopupTier('t300')).resolves.toEqual({ id: 't300', tokens: 300, priceKrw: 2850, label: null });
    for (const id of ['t999', 'evt_off', 'evt_future', 'evt_past', 'bad id', '']) {
      await expect(getTopupTier(id)).resolves.toBeUndefined();
    }
  });

  it('propagates DB errors', async () => {
    state.tierError = { message: 'boom' };
    await expect(getTopupTier('t100')).rejects.toThrow();
  });
});

describe('createTopupOrderAction', () => {
  it('orders a new DB bundle without any code whitelist change and stores the server snapshot', async () => {
    state.rows = [...seed(), row({ id: 'evt_autumn', tokens: 1200, price_krw: 9900, sort_order: 50 })];
    const created = await createTopupOrderAction('evt_autumn', '/studio?tab=drafts');
    expect(created).toMatchObject({ amountKrw: 9900, orderName: '1,200 토큰 충전' });
    expect(created.orderId).toMatch(/^ns_/);
    expect(state.inserts).toEqual([{ table: 'payment_orders', row: expect.objectContaining({
      order_id: created.orderId, user_id: 'user-1', tier_id: 'evt_autumn', amount_krw: 9900, token_amount: 1200, return_path: '/studio?tab=drafts',
    }) }]);
  });

  it('ignores client-supplied amounts and tokens', async () => {
    const tampered = createTopupOrderAction as unknown as (...args: unknown[]) => Promise<{ amountKrw: number }>;
    const created = await tampered('t100', '/', { amountKrw: 1, tokens: 1_000_000 });
    expect(created.amountKrw).toBe(1000);
    expect(state.inserts[0].row).toMatchObject({ amount_krw: 1000, token_amount: 100 });
  });

  it('rejects unknown, inactive, expired, malformed and errored lookups before inserting', async () => {
    state.rows = [...seed(), row({ id: 'evt_off', is_active: false }), row({ id: 'evt_past', ends_at: '2026-10-01T00:00:00Z' })];
    for (const id of ['t999', 'evt_off', 'evt_past', 'bad id', 'x'.repeat(65)]) {
      await expect(createTopupOrderAction(id, '/')).rejects.toThrow();
    }
    state.tierError = { message: 'boom' };
    await expect(createTopupOrderAction('t100', '/')).rejects.toThrow();
    expect(state.inserts).toEqual([]);
  });

  it('rejects anonymous users before inserting', async () => {
    state.userId = null;
    await expect(createTopupOrderAction('t100', '/')).rejects.toThrow('Authentication required');
    expect(state.inserts).toEqual([]);
  });

  it.each(['//evil.example', '/\\evil.example', '/path://evil.example', 'https://evil.example'])(
    'falls back to root for unsafe return path %s', async (returnPath) => {
      await createTopupOrderAction('t100', returnPath);
      expect(state.inserts[0].row.return_path).toBe('/');
    });
});

describe('listTopupTiersAction', () => {
  it('returns on-sale bundles and the session owner balance', async () => {
    await expect(listTopupTiersAction()).resolves.toEqual({
      tiers: [
        { id: 't100', tokens: 100, priceKrw: 1000, label: null },
        { id: 't300', tokens: 300, priceKrw: 2850, label: null },
        { id: 't550', tokens: 550, priceKrw: 5000, label: null },
        { id: 't1000', tokens: 1000, priceKrw: 9000, label: null },
      ],
      balance: 777,
    });
    expect(state.walletFilters).toEqual([['id', 'user-1']]);
  });

  it('treats a missing wallet row as zero and surfaces wallet errors', async () => {
    state.balance = null;
    await expect(listTopupTiersAction()).resolves.toMatchObject({ balance: 0 });
    state.walletError = { message: 'boom' };
    await expect(listTopupTiersAction()).rejects.toThrow();
  });

  it('rejects anonymous users', async () => {
    state.userId = null;
    await expect(listTopupTiersAction()).rejects.toThrow('Authentication required');
  });
});

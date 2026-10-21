import { beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => ({ client: null as unknown, user: null as { id: string } | null }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ ...(server.client as object), auth: { getUser: async () => ({ data: { user: server.user } }) } }),
}));

import { getAiWalletStatus } from '@/lib/ai/wallet-status';
import { loadAiWalletStatusAction } from '@/app/studio/ai-wallet-actions';

type Calls = { table: string; ops: [string, ...unknown[]][] }[];
function fakeClient(opts: {
  wallet?: { data: unknown; error: unknown };
  ledger?: { data: unknown; error: unknown };
  calls?: Calls;
}) {
  const calls = opts.calls ?? [];
  return {
    from(table: string) {
      const entry = { table, ops: [] as [string, ...unknown[]][] };
      calls.push(entry);
      const result = table === 'wallets' ? opts.wallet : opts.ledger;
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'lt', 'order', 'limit']) {
        chain[op] = (...args: unknown[]) => { entry.ops.push([op, ...args]); return chain; };
      }
      chain.maybeSingle = () => Promise.resolve(result);
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
      return chain;
    },
  } as never;
}
const OWNER = '11111111-1111-1111-1111-111111111111';

describe('getAiWalletStatus', () => {
  it('reads own balance and the latest real negative ai_generation debit (ordered created_at, id desc)', async () => {
    const calls: Calls = [];
    const client = fakeClient({ calls, wallet: { data: { id: OWNER, balance: 1200 }, error: null }, ledger: { data: [{ id: 9, delta: -35 }], error: null } });
    await expect(getAiWalletStatus(client, OWNER)).resolves.toEqual({ ok: true, balance: 1200, recentDebit: 35 });
    const wallets = calls.find((c) => c.table === 'wallets')!;
    expect(wallets.ops).toContainEqual(['eq', 'id', OWNER]);
    const ledger = calls.find((c) => c.table === 'ledger_entries')!;
    expect(ledger.ops).toContainEqual(['eq', 'wallet_id', OWNER]);
    expect(ledger.ops).toContainEqual(['eq', 'reference_type', 'ai_generation']);
    expect(ledger.ops).toContainEqual(['lt', 'delta', 0]);
    expect(ledger.ops.filter((o) => o[0] === 'order')).toEqual([
      ['order', 'created_at', { ascending: false }], ['order', 'id', { ascending: false }],
    ]);
    expect(ledger.ops).toContainEqual(['limit', 1]);
  });

  it('no debit row means recentDebit 0; bigint strings are converted', async () => {
    const none = fakeClient({ wallet: { data: { id: OWNER, balance: '0' }, error: null }, ledger: { data: [], error: null } });
    await expect(getAiWalletStatus(none, OWNER)).resolves.toEqual({ ok: true, balance: 0, recentDebit: 0 });
    const str = fakeClient({ wallet: { data: { id: OWNER, balance: '500' }, error: null }, ledger: { data: [{ id: 1, delta: '-12' }], error: null } });
    await expect(getAiWalletStatus(str, OWNER)).resolves.toEqual({ ok: true, balance: 500, recentDebit: 12 });
  });

  it.each([
    ['missing wallet', { data: null, error: null }, { data: [], error: null }],
    ['wallet query error', { data: null, error: { message: 'x' } }, { data: [], error: null }],
    ['ledger query error', { data: { id: OWNER, balance: 5 }, error: null }, { data: null, error: { message: 'x' } }],
    ['negative balance', { data: { id: OWNER, balance: -1 }, error: null }, { data: [], error: null }],
    ['non-numeric balance', { data: { id: OWNER, balance: 'abc' }, error: null }, { data: [], error: null }],
    ['unsafe balance', { data: { id: OWNER, balance: 2 ** 60 }, error: null }, { data: [], error: null }],
    ['NaN debit', { data: { id: OWNER, balance: 5 }, error: null }, { data: [{ id: 1, delta: 'zz' }], error: null }],
    ['foreign wallet row', { data: { id: 'other', balance: 5 }, error: null }, { data: [], error: null }],
  ])('fails (never fakes 0) on %s', async (_name, wallet, ledger) => {
    const result = await getAiWalletStatus(fakeClient({ wallet, ledger }), OWNER);
    expect(result.ok).toBe(false);
  });

  it('rejects an empty owner id without querying', async () => {
    const calls: Calls = [];
    const result = await getAiWalletStatus(fakeClient({ calls }), '');
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('turns a thrown query into a read failure', async () => {
    const client = { from() { throw new Error('boom'); } } as never;
    expect((await getAiWalletStatus(client, OWNER)).ok).toBe(false);
  });
});

describe('loadAiWalletStatusAction', () => {
  beforeEach(() => { server.user = null; server.client = null; });

  it('rejects unauthenticated calls without touching the DB', async () => {
    const calls: Calls = [];
    server.client = fakeClient({ calls });
    const result = await loadAiWalletStatusAction();
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('uses only the session user id (takes no client-supplied owner)', async () => {
    const calls: Calls = [];
    server.user = { id: OWNER };
    server.client = fakeClient({ calls, wallet: { data: { id: OWNER, balance: 7 }, error: null }, ledger: { data: [], error: null } });
    expect(loadAiWalletStatusAction.length).toBe(0);
    await expect(loadAiWalletStatusAction()).resolves.toEqual({ ok: true, balance: 7, recentDebit: 0 });
    expect(calls.find((c) => c.table === 'wallets')!.ops).toContainEqual(['eq', 'id', OWNER]);
  });
});

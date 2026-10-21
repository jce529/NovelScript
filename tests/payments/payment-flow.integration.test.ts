import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeLedgerAdmin } from '../helpers/fake-ledger-admin';

// Autonomous (mock-only) wiring proof of the whole order -> approval -> webhook -> credit
// boundary. It drives the REAL server action, catalog, order, success route, webhook route and
// Toss client; only Supabase (table fake + createFakeLedgerAdmin RPC state) and Toss HTTP are
// faked. It proves parameters and call counts, NOT Postgres locking/uniqueness: SQL exactly-once
// proof stays with payment-flow.database.test.ts, which runs in 05-07 Task 1.

const USER_ID = '00000000-0000-4000-8000-0000000000aa';

type Row = Record<string, unknown>;
const world = vi.hoisted(() => ({
  session: { userId: null as string | null },
  orders: new Map<string, Record<string, unknown>>(),
  tiers: [] as Array<Record<string, unknown>>,
  ledgerClient: null as null | { rpc: (name: string, args: Record<string, unknown>) => Promise<unknown> },
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: world.session.userId ? { id: world.session.userId } : null }, error: null }) },
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => world.ledgerClient!.rpc(name, args),
    from: (table: string) => {
      if (table === 'payment_topup_tiers') return tierQuery();
      if (table === 'payment_orders') return orderQuery();
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

function tierQuery() {
  const filters: Array<[string, unknown]> = [];
  const rows = () => world.tiers.filter((t) => filters.every(([c, v]) => t[c] === v)).map((t) => ({ ...t }));
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
    order: () => builder,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
  };
  return builder;
}

function orderQuery() {
  const eqs: Array<[string, unknown]> = [];
  const isNull: string[] = [];
  const match = (row: Row) => eqs.every(([c, v]) => row[c] === v) && isNull.every((c) => row[c] === null || row[c] === undefined);
  return {
    insert: async (values: Row) => {
      world.orders.set(values.order_id as string, {
        authenticated_at: null, confirmed_at: null, credited_at: null, failed_at: null,
        confirm_idempotency_key: `idem-${values.order_id}`, ...values,
      });
      return { error: null };
    },
    select() {
      const builder = {
        eq: (c: string, v: unknown) => (eqs.push([c, v]), builder),
        maybeSingle: async () => {
          const row = [...world.orders.values()].find(match);
          return { data: row ? { ...row } : null, error: null };
        },
      };
      return builder;
    },
    update(values: Row) {
      const builder = {
        eq: (c: string, v: unknown) => (eqs.push([c, v]), builder),
        is: (c: string, _v: null) => (isNull.push(c), builder),
        then: (resolve: (v: { error: null }) => unknown) => {
          for (const row of world.orders.values()) if (match(row)) Object.assign(row, values);
          return resolve({ error: null });
        },
      };
      return builder;
    },
  };
}

import { createTopupOrderAction, getTopupOrderStatusAction } from '@/lib/payments/actions';
import { GET as successGet } from '@/app/api/payments/toss/success/route';
import { POST as webhookPost } from '@/app/api/payments/toss/webhook/route';

const tier = (over: Row) => ({
  is_active: true, sort_order: 1, starts_at: null, ends_at: null, label: null, label_starts_at: null, label_ends_at: null, ...over,
});

type TossWorld = { status: string; totalAmount: number; confirmCalls: number; onConfirm?: () => Promise<void> };
let toss: TossWorld;

function installToss() {
  process.env.TOSS_SECRET_KEY = 'test_sk_unit_only';
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'POST' && url.endsWith('/v1/payments/confirm')) {
      toss.confirmCalls += 1;
      const sent = JSON.parse(String(init?.body)) as { orderId: string };
      toss.status = 'DONE';
      await toss.onConfirm?.();
      return { ok: true, status: 200, json: async () => ({ orderId: sent.orderId, status: 'DONE', totalAmount: toss.totalAmount }) } as unknown as Response;
    }
    const orderId = decodeURIComponent(url.split('/').pop()!);
    return { ok: true, status: 200, json: async () => ({ orderId, status: toss.status, totalAmount: toss.totalAmount }) } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const successUrl = (orderId: string, amount: number) =>
  new Request(`https://app.example/api/payments/toss/success?paymentKey=pk_test&orderId=${orderId}&amount=${amount}`);
const webhook = (orderId: string, data: Row = {}) =>
  webhookPost(new Request('https://app.example/api/payments/toss/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId, ...data } }),
  }));

describe('payment flow: local order-to-credit boundary (mocked Supabase + Toss)', () => {
  let ledger: ReturnType<typeof createFakeLedgerAdmin>;
  const balance = () => ledger.state.balances[USER_ID];
  const topupRows = () => ledger.state.ledger.filter((r) => r.reference_type === 'toss_topup');
  const creditCalls = () => ledger.rpc.mock.calls.filter(([name]) => name === 'apply_wallet_delta');

  beforeEach(() => {
    world.session.userId = USER_ID;
    world.orders.clear();
    world.tiers = [
      tier({ id: 't300', tokens: 300, price_krw: 2850, sort_order: 1 }),
      tier({ id: 'evt_spring', tokens: 1234, price_krw: 9876, sort_order: 5, label: '봄 이벤트' }),
    ];
    ledger = createFakeLedgerAdmin({ balances: { [USER_ID]: 0 } });
    world.ledgerClient = ledger.client as unknown as typeof world.ledgerClient;
    toss = { status: 'READY', totalAmount: 2850, confirmCalls: 0 };
    installToss();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('approval alone never credits; forged and non-DONE webhooks never credit; verified DONE credits once per reference', async () => {
    const created = await createTopupOrderAction('t300', '/studio?tab=drafts');
    expect(created).toMatchObject({ amountKrw: 2850, orderName: '300 토큰 충전' });

    const approval = await successGet(successUrl(created.orderId, 2850));
    expect(toss.confirmCalls).toBe(1);
    expect(approval.headers.get('location')).toBe(`https://app.example/studio?tab=drafts&topup=${created.orderId}`);
    expect(world.orders.get(created.orderId)?.confirmed_at).toEqual(expect.any(String));
    expect(world.orders.get(created.orderId)?.credited_at).toBeNull();
    expect(balance()).toBe(0);
    expect(creditCalls()).toHaveLength(0);
    await expect(getTopupOrderStatusAction(created.orderId)).resolves.toEqual({ credited: false, tokenAmount: 300 });

    // Forged body claims DONE and a huge amount, but the authenticated Toss lookup says otherwise.
    toss.status = 'WAITING_FOR_DEPOSIT';
    const forged = await webhook(created.orderId, { status: 'DONE', totalAmount: 2850, tokenAmount: 999999, paymentKey: 'pk_forged' });
    expect(forged.status).toBe(200);
    expect(balance()).toBe(0);
    expect(creditCalls()).toHaveLength(0);

    // Verified DONE with the expected amount credits the stored snapshot exactly once.
    toss.status = 'DONE';
    expect((await webhook(created.orderId, { status: 'DONE', tokenAmount: 999999 })).status).toBe(200);
    expect(balance()).toBe(300);
    expect(topupRows()).toEqual([expect.objectContaining({ wallet_id: USER_ID, delta: 300, reference_id: created.orderId })]);
    expect(creditCalls()).toHaveLength(1);
    expect(creditCalls()[0][1]).toMatchObject({ p_wallet_id: USER_ID, p_delta: 300, p_reference_type: 'toss_topup', p_reference_id: created.orderId });
    expect(world.orders.get(created.orderId)?.credited_at).toEqual(expect.any(String));
    await expect(getTopupOrderStatusAction(created.orderId)).resolves.toEqual({ credited: true, tokenAmount: 300 });

    // Repeated delivery: no extra credit call, balance, or ledger row.
    expect((await webhook(created.orderId)).status).toBe(200);
    expect(balance()).toBe(300);
    expect(topupRows()).toHaveLength(1);
    expect(creditCalls()).toHaveLength(1);

    // Even if the marker were lost, the idempotent ledger reference blocks a second delta.
    world.orders.get(created.orderId)!.credited_at = null;
    expect((await webhook(created.orderId)).status).toBe(200);
    expect(balance()).toBe(300);
    expect(topupRows()).toHaveLength(1);
  });

  it('a mismatching Toss total never credits', async () => {
    const created = await createTopupOrderAction('t300', '/');
    await successGet(successUrl(created.orderId, 2850));
    toss.status = 'DONE';
    toss.totalAmount = 100;
    expect((await webhook(created.orderId)).status).toBe(200);
    expect(balance()).toBe(0);
    expect(creditCalls()).toHaveLength(0);
  });

  it('credits a fifth DB-configured event tier from its order snapshot', async () => {
    toss.totalAmount = 9876;
    const created = await createTopupOrderAction('evt_spring', '/');
    expect(created).toMatchObject({ amountKrw: 9876, orderName: '1,234 토큰 충전' });
    await successGet(successUrl(created.orderId, 9876));
    expect(balance()).toBe(0);
    toss.status = 'DONE';
    await webhook(created.orderId);
    expect(balance()).toBe(1234);
    expect(topupRows()).toHaveLength(1);
  });

  it('a catalog price change before approval makes zero confirm calls and credits nothing', async () => {
    const created = await createTopupOrderAction('t300', '/studio');
    world.tiers.find((t) => t.id === 't300')!.price_krw = 3300;

    const response = await successGet(successUrl(created.orderId, 2850));

    expect(toss.confirmCalls).toBe(0);
    expect(response.headers.get('location')).toBe('https://app.example/studio?topupFail=1');
    expect(world.orders.get(created.orderId)?.confirmed_at).toBeNull();
    expect(balance()).toBe(0);
    expect(creditCalls()).toHaveLength(0);
  });

  it('catalog changes after confirm do not alter the snapshot credited by the webhook', async () => {
    const created = await createTopupOrderAction('t300', '/');
    await successGet(successUrl(created.orderId, 2850));
    expect(toss.confirmCalls).toBe(1);

    const row = world.tiers.find((t) => t.id === 't300')!;
    row.tokens = 999;
    row.price_krw = 100;
    row.is_active = false;

    await webhook(created.orderId);
    expect(balance()).toBe(300);
    expect(topupRows()).toEqual([expect.objectContaining({ delta: 300 })]);
  });

  it('webhook credit that lands before confirmed_at is written is not cleared by the later success path', async () => {
    const created = await createTopupOrderAction('t300', '/');
    // While Toss is confirming, the webhook for the same order already arrives and credits.
    toss.onConfirm = async () => {
      expect((await webhook(created.orderId)).status).toBe(200);
    };

    const response = await successGet(successUrl(created.orderId, 2850));

    expect(response.headers.get('location')).toBe(`https://app.example/?topup=${created.orderId}`);
    const order = world.orders.get(created.orderId)!;
    expect(order.credited_at).toEqual(expect.any(String));
    expect(order.confirmed_at).toEqual(expect.any(String));
    expect(balance()).toBe(300);
    expect(topupRows()).toHaveLength(1);
    expect(creditCalls()).toHaveLength(1);
  });
});

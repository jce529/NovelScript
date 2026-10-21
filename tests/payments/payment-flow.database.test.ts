import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

// Real test Supabase + mocked Toss HTTP. PREPARED ONLY: it requires migrations 0016_payments.sql
// and 0027_payment_topup_tiers.sql and is executed for the first time in 05-07 Task 1. Until
// then the SQL exactly-once claim is UNVERIFIED. Toss traffic is intercepted by URL so Supabase
// requests still reach the network.

const session: { userId: string | null } = { userId: null };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.userId ? { id: session.userId } : null }, error: null }) },
  }),
}));
// Every call builds an independent service-role client (separate sessions/connections).
vi.mock('@/lib/supabase/admin', async () => {
  const { adminClient: independent } = await import('../helpers/db');
  return { createAdminClient: () => independent() };
});

import { createTopupOrderAction } from '@/lib/payments/actions';
import { GET as successGet } from '@/app/api/payments/toss/success/route';
import { POST as webhookPost } from '@/app/api/payments/toss/webhook/route';

describe.skipIf(!process.env.SUPABASE_SERVICE_ROLE_KEY)('payment flow boundary (real test Supabase, mocked Toss)', () => {
  const realFetch = globalThis.fetch;
  const toss = { status: 'READY', totalAmount: 0, confirmCalls: 0, onConfirm: undefined as undefined | (() => Promise<void>) };
  let userId: string;
  const orderIds: string[] = [];
  const tierIds: string[] = [];

  const balance = async () => {
    const { data } = await adminClient().from('wallets').select('balance').eq('id', userId).single();
    return Number(data!.balance);
  };
  const topupRows = async (orderId: string) => {
    const { data } = await adminClient().from('ledger_entries').select('delta').eq('wallet_id', userId)
      .eq('reference_type', 'toss_topup').eq('reference_id', orderId);
    return data ?? [];
  };
  const order = async (orderId: string) =>
    (await adminClient().from('payment_orders').select('confirmed_at,credited_at').eq('order_id', orderId).single()).data!;
  const webhook = (orderId: string) => webhookPost(new Request('https://app.example/api/payments/toss/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventType: 'PAYMENT_STATUS_CHANGED', data: { orderId, status: 'DONE', totalAmount: 1 } }),
  }));
  const approve = (orderId: string, amount: number) =>
    successGet(new Request(`https://app.example/api/payments/toss/success?paymentKey=pk_test&orderId=${orderId}&amount=${amount}`));

  async function newEventOrder(tokens: number, price: number) {
    const tierId = `flow_${crypto.randomUUID().slice(0, 8)}`;
    const { error } = await adminClient().from('payment_topup_tiers')
      .insert({ id: tierId, tokens, price_krw: price, sort_order: 998, label: null });
    expect(error).toBeNull();
    tierIds.push(tierId);
    const created = await createTopupOrderAction(tierId, '/studio');
    orderIds.push(created.orderId);
    toss.status = 'READY';
    toss.totalAmount = price;
    toss.confirmCalls = 0;
    toss.onConfirm = undefined;
    return { tierId, ...created };
  }

  beforeAll(async () => {
    process.env.TOSS_SECRET_KEY = 'test_sk_unit_only';
    userId = (await createTestUser()).id;
    session.userId = userId;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith('https://api.tosspayments.com/')) return realFetch(input, init);
      const respond = (body: Record<string, unknown>) => new Response(JSON.stringify(body), { status: 200 });
      if (init?.method === 'POST' && url.endsWith('/v1/payments/confirm')) {
        toss.confirmCalls += 1;
        const sent = JSON.parse(String(init.body)) as { orderId: string };
        toss.status = 'DONE';
        await toss.onConfirm?.();
        return respond({ orderId: sent.orderId, status: 'DONE', totalAmount: toss.totalAmount });
      }
      return respond({ orderId: decodeURIComponent(url.split('/').pop()!), status: toss.status, totalAmount: toss.totalAmount });
    });
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    const admin = adminClient();
    // Ledger rows first (they reference the wallet), then orders, then test-owned tiers, then the user.
    if (orderIds.length) {
      await admin.from('ledger_entries').delete().eq('reference_type', 'toss_topup').in('reference_id', orderIds);
      await admin.from('payment_orders').delete().in('order_id', orderIds);
    }
    if (tierIds.length) await admin.from('payment_topup_tiers').delete().in('id', tierIds);
    if (userId) await deleteTestUser(userId);
  });

  it('approval does not credit; forged/non-DONE does not credit; DONE credits once; repeats add nothing', async () => {
    const before = await balance();
    const created = await newEventOrder(321, 4321);

    await approve(created.orderId, 4321);
    expect(toss.confirmCalls).toBe(1);
    expect((await order(created.orderId)).confirmed_at).not.toBeNull();
    expect(await balance()).toBe(before);

    expect((await webhook(created.orderId)).status).toBe(200); // Toss still READY -> forged DONE body ignored
    expect(await balance()).toBe(before);
    expect(await topupRows(created.orderId)).toHaveLength(0);

    toss.status = 'DONE';
    await webhook(created.orderId);
    expect(await balance()).toBe(before + 321);
    expect(await topupRows(created.orderId)).toHaveLength(1);

    await webhook(created.orderId);
    expect(await balance()).toBe(before + 321);
    expect(await topupRows(created.orderId)).toHaveLength(1);
  });

  it('simultaneous webhook POSTs through independent admin clients credit exactly once', async () => {
    const before = await balance();
    const created = await newEventOrder(111, 1111);
    await approve(created.orderId, 1111);
    toss.status = 'DONE';

    const responses = await Promise.all(Array.from({ length: 6 }, () => webhook(created.orderId)));

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(await balance()).toBe(before + 111);
    expect(await topupRows(created.orderId)).toHaveLength(1);
    expect((await order(created.orderId)).credited_at).not.toBeNull();
  });

  it('webhook credit arriving before confirmed_at is written is not cleared by the success path', async () => {
    const before = await balance();
    const created = await newEventOrder(222, 2222);
    toss.onConfirm = async () => { await webhook(created.orderId); };

    await approve(created.orderId, 2222);

    const row = await order(created.orderId);
    expect(row.credited_at).not.toBeNull();
    expect(row.confirmed_at).not.toBeNull();
    expect(await balance()).toBe(before + 222);
    expect(await topupRows(created.orderId)).toHaveLength(1);
  });

  it('a catalog price change before approval causes zero confirm calls', async () => {
    const before = await balance();
    const created = await newEventOrder(333, 3333);
    await adminClient().from('payment_topup_tiers').update({ price_krw: 3999 }).eq('id', created.tierId);

    await approve(created.orderId, 3333);

    expect(toss.confirmCalls).toBe(0);
    expect(await balance()).toBe(before);
  });

  it('catalog changes after confirm do not change the credited snapshot', async () => {
    const before = await balance();
    const created = await newEventOrder(444, 4444);
    await approve(created.orderId, 4444);
    await adminClient().from('payment_topup_tiers').update({ tokens: 9999, price_krw: 1, is_active: false }).eq('id', created.tierId);

    toss.status = 'DONE';
    await webhook(created.orderId);

    expect(await balance()).toBe(before + 444);
  });
});

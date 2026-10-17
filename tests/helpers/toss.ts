import { vi } from 'vitest';

/**
 * Autonomous (no remote DB) test boundary for the Toss webhook.
 *
 * - `tossPayment()` builds a Toss `GET /v1/payments/orders/{orderId}` response body.
 * - `installTossFetch()` stubs global fetch so lib/payments/toss.ts runs for real against it.
 * - `fakeWebhookDb` is an in-memory stand-in for the service-role Supabase client: the
 *   payment_orders table plus an `apply_wallet_delta` RPC that mirrors the real function's
 *   unique(wallet_id, reference_type, reference_id) idempotency. Real locking/uniqueness under
 *   independent sessions is proven only by the opt-in live-DB suite (05-07 Task 1).
 */

export type FakeOrder = {
  order_id: string;
  user_id: string;
  tier_id: string;
  amount_krw: number;
  token_amount: number;
  credited_at: string | null;
};

export type FakeLedgerRow = {
  wallet_id: string;
  delta: number;
  reference_type: string;
  reference_id: string;
  reason: string;
};

export function tossPayment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mId: 'tvivarepublica',
    paymentKey: 'tgen_test_payment_key',
    orderId: 'ns_order_123456',
    orderName: '300 토큰 충전',
    status: 'DONE',
    method: '카드',
    totalAmount: 2850,
    balanceAmount: 2850,
    approvedAt: '2026-10-17T10:00:00+09:00',
    ...overrides,
  };
}

export function webhookBody(data: Record<string, unknown> = {}, eventType = 'PAYMENT_STATUS_CHANGED'): string {
  return JSON.stringify({
    eventType,
    createdAt: '2026-10-17T10:00:01.000000',
    data: { orderId: 'ns_order_123456', ...data },
  });
}

export function webhookRequest(body: string): Request {
  return new Request('https://app.example/api/payments/toss/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

type FetchReply = { status?: number; body: Record<string, unknown> } | Error;

/** Stubs global fetch; each call shifts the next reply (the last reply repeats). */
export function installTossFetch(...replies: FetchReply[]) {
  process.env.TOSS_SECRET_KEY = 'test_sk_unit_only';
  const queue = [...replies];
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    const reply = queue.length > 1 ? queue.shift()! : queue[0];
    if (!reply) throw new Error('no fake Toss reply configured');
    if (reply instanceof Error) throw reply;
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => reply.body } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function createFakeWebhookDb() {
  const state = {
    orders: new Map<string, FakeOrder>(),
    ledger: [] as FakeLedgerRow[],
    balances: new Map<string, number>(),
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    failSelect: false,
    failRpc: false,
    failUpdate: 0,
  };

  function reset() {
    state.orders.clear();
    state.ledger.length = 0;
    state.balances.clear();
    state.rpcCalls.length = 0;
    state.failSelect = false;
    state.failRpc = false;
    state.failUpdate = 0;
  }

  function seedOrder(order: Partial<FakeOrder> = {}): FakeOrder {
    const row: FakeOrder = {
      order_id: 'ns_order_123456',
      user_id: '00000000-0000-4000-8000-000000000001',
      tier_id: 't300',
      amount_krw: 2850,
      token_amount: 300,
      credited_at: null,
      ...order,
    };
    state.orders.set(row.order_id, row);
    if (!state.balances.has(row.user_id)) state.balances.set(row.user_id, 0);
    return row;
  }

  function applyWalletDelta(args: Record<string, unknown>) {
    const walletId = String(args.p_wallet_id);
    const referenceType = String(args.p_reference_type);
    const referenceId = String(args.p_reference_id);
    const delta = Number(args.p_delta);
    const current = state.balances.get(walletId) ?? 0;
    const duplicate = state.ledger.some(
      (row) => row.wallet_id === walletId && row.reference_type === referenceType && row.reference_id === referenceId
    );
    if (duplicate) return current; // insert ... on conflict do nothing → return current balance
    state.ledger.push({ wallet_id: walletId, delta, reference_type: referenceType, reference_id: referenceId, reason: String(args.p_reason) });
    state.balances.set(walletId, current + delta);
    return current + delta;
  }

  type Filter = { column: string; value: unknown; op: 'eq' | 'is' };
  const matches = (row: Record<string, unknown>, filters: Filter[]) =>
    filters.every((f) => row[f.column] === f.value);

  function ordersQuery() {
    return {
      select(_columns: string) {
        const filters: Filter[] = [];
        const builder = {
          eq(column: string, value: unknown) {
            filters.push({ column, value, op: 'eq' });
            return builder;
          },
          async maybeSingle() {
            await Promise.resolve();
            if (state.failSelect) return { data: null, error: { message: 'db down' } };
            const row = [...state.orders.values()].find((o) => matches(o, filters));
            return { data: row ? { ...row } : null, error: null };
          },
        };
        return builder;
      },
      update(values: Partial<FakeOrder>) {
        const filters: Filter[] = [];
        const run = async () => {
          await Promise.resolve();
          if (state.failUpdate > 0) {
            state.failUpdate -= 1;
            return { data: null, error: { message: 'update failed' } };
          }
          for (const row of state.orders.values()) if (matches(row, filters)) Object.assign(row, values);
          return { data: null, error: null };
        };
        const builder = {
          eq(column: string, value: unknown) {
            filters.push({ column, value, op: 'eq' });
            return builder;
          },
          is(column: string, value: unknown) {
            filters.push({ column, value, op: 'is' });
            return builder;
          },
          then<T>(onFulfilled: (value: { data: null; error: { message: string } | null }) => T, onRejected?: (reason: unknown) => T) {
            return run().then(onFulfilled, onRejected);
          },
        };
        return builder;
      },
    };
  }

  function client() {
    return {
      from(table: string) {
        if (table !== 'payment_orders') throw new Error(`webhook must not touch table ${table}`);
        return ordersQuery();
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        await Promise.resolve();
        state.rpcCalls.push({ fn, args });
        if (fn !== 'apply_wallet_delta') throw new Error(`unexpected rpc ${fn}`);
        if (state.failRpc) return { data: null, error: { message: 'rpc failed' } };
        return { data: applyWalletDelta(args), error: null };
      },
    };
  }

  return { state, reset, seedOrder, client };
}

export const fakeWebhookDb = createFakeWebhookDb();

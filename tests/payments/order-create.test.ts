import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

const sessionState: { userId: string | null } = { userId: null };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionState.userId ? { id: sessionState.userId } : null } }) } }),
}));

import { createTopupOrderAction } from '@/lib/payments/actions';

describe('top-up order creation (Supabase integration)', () => {
  let userId: string;
  const orderIds: string[] = [];

  beforeAll(async () => {
    const user = await createTestUser();
    userId = user.id;
    sessionState.userId = userId;
  });

  afterAll(async () => {
    if (orderIds.length) await adminClient().from('payment_orders').delete().in('order_id', orderIds);
    if (userId) await deleteTestUser(userId);
  });

  it('derives price and tokens from the server tier and persists a safe pathname plus query', async () => {
    const created = await createTopupOrderAction('t300', '/studio?tab=drafts');
    orderIds.push(created.orderId);

    expect(created).toMatchObject({ amountKrw: 2_850, orderName: '300 토큰 충전' });
    const { data, error } = await adminClient().from('payment_orders').select('user_id,tier_id,amount_krw,token_amount,return_path').eq('order_id', created.orderId).single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ user_id: userId, tier_id: 't300', amount_krw: 2_850, token_amount: 300, return_path: '/studio?tab=drafts' });
  });

  it.each(['//evil.example', '/\\evil.example', '/path://evil.example'])('falls back to root for unsafe return path %s', async (returnPath) => {
    const created = await createTopupOrderAction('t100', returnPath);
    orderIds.push(created.orderId);
    const { data } = await adminClient().from('payment_orders').select('return_path').eq('order_id', created.orderId).single();
    expect(data?.return_path).toBe('/');
  });

  it('rejects invalid tier ids and unauthenticated users', async () => {
    await expect(createTopupOrderAction('invalid' as never, '/')).rejects.toThrow();
    sessionState.userId = null;
    await expect(createTopupOrderAction('t100', '/')).rejects.toThrow();
  });
});

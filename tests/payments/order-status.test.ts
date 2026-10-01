import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

const sessionState: { userId: string | null } = { userId: null };
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionState.userId ? { id: sessionState.userId } : null } }) } }),
}));

import { getTopupOrderStatusAction } from '@/lib/payments/actions';

describe('top-up order status (Supabase integration)', () => {
  let ownerId: string;
  let otherId: string;
  let orderId: string;

  beforeAll(async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    ownerId = owner.id;
    otherId = other.id;
    sessionState.userId = ownerId;
    const { data, error } = await adminClient().from('payment_orders').insert({
      order_id: `ns_${crypto.randomUUID()}`,
      user_id: ownerId,
      tier_id: 't550',
      amount_krw: 5_000,
      token_amount: 550,
      credited_at: new Date().toISOString(),
    }).select('order_id').single();
    if (error) throw error;
    orderId = data.order_id;
  });

  afterAll(async () => {
    if (orderId) await adminClient().from('payment_orders').delete().eq('order_id', orderId);
    if (ownerId) await deleteTestUser(ownerId);
    if (otherId) await deleteTestUser(otherId);
  });

  it('returns credited only from credited_at, even without confirmed_at', async () => {
    sessionState.userId = ownerId;
    await expect(getTopupOrderStatusAction(orderId)).resolves.toEqual({ credited: true, tokenAmount: 550 });
  });

  it('fails closed for another user and a missing order', async () => {
    sessionState.userId = otherId;
    await expect(getTopupOrderStatusAction(orderId)).rejects.toThrow();
    await expect(getTopupOrderStatusAction('ns_missing_order')).rejects.toThrow();
  });
});

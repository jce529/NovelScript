import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { generateOrderId, getTopupTier, type TopupTierId } from './tiers';

export async function createTopupOrder(userId: string, tierId: TopupTierId, returnPath: string) {
  const tier = getTopupTier(tierId);
  if (!tier) throw new Error('Invalid top-up tier');

  const orderId = generateOrderId();
  const { error } = await createAdminClient().from('payment_orders').insert({
    order_id: orderId,
    user_id: userId,
    tier_id: tier.id,
    amount_krw: tier.priceKrw,
    token_amount: tier.tokens,
    return_path: returnPath,
  });
  if (error) throw new Error('Unable to create top-up order');

  return { orderId, amountKrw: tier.priceKrw, orderName: `${tier.tokens.toLocaleString('ko-KR')} 토큰 충전` };
}

export async function getTopupOrderStatus(userId: string, orderId: string) {
  const { data, error } = await createAdminClient()
    .from('payment_orders')
    .select('credited_at,token_amount')
    .eq('order_id', orderId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) throw new Error('Top-up order not found');
  return { credited: Boolean(data.credited_at), tokenAmount: Number(data.token_amount) };
}

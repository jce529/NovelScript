'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { listTopupTiers } from './catalog';
import { createTopupOrder, getTopupOrderStatus } from './orders';
import { TOPUP_TIER_ID_PATTERN, type TopupTier } from './tiers';

// Bounded format check only; existence and sale window are checked by the catalog.
const tierIdSchema = z.string().regex(TOPUP_TIER_ID_PATTERN);
const orderIdSchema = z.string().regex(/^ns_[A-Za-z0-9_-]{36}$/);

function safeReturnPath(value: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.includes('://')
    ? value
    : '/';
}

async function authenticatedSession() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Authentication required');
  return { supabase, userId: user.id };
}

async function authenticatedUserId() {
  return (await authenticatedSession()).userId;
}

export async function listTopupTiersAction(): Promise<{ tiers: TopupTier[]; balance: number }> {
  const { supabase, userId } = await authenticatedSession();
  const [tiers, wallet] = await Promise.all([
    listTopupTiers(),
    supabase.from('wallets').select('balance').eq('id', userId).maybeSingle(),
  ]);
  if (wallet.error) throw new Error('Unable to load wallet balance');
  return { tiers, balance: wallet.data ? Number(wallet.data.balance) : 0 };
}

export async function createTopupOrderAction(tierId: string, returnPath: string) {
  const parsedTier = tierIdSchema.safeParse(tierId);
  if (!parsedTier.success) throw new Error('Invalid top-up tier');
  const userId = await authenticatedUserId();
  return createTopupOrder(userId, parsedTier.data, safeReturnPath(returnPath));
}

export async function getTopupOrderStatusAction(orderId: string): Promise<{ credited: boolean; tokenAmount: number }> {
  const parsedOrderId = orderIdSchema.safeParse(orderId);
  if (!parsedOrderId.success) throw new Error('Invalid top-up order');
  const userId = await authenticatedUserId();
  return getTopupOrderStatus(userId, parsedOrderId.data);
}

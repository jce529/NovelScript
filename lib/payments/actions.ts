'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createTopupOrder, getTopupOrderStatus } from './orders';

const tierIdSchema = z.enum(['t100', 't300', 't550', 't1000']);
const orderIdSchema = z.string().regex(/^ns_[A-Za-z0-9_-]{36}$/);

function safeReturnPath(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.includes('://')
    ? value
    : '/';
}

async function authenticatedUserId() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Authentication required');
  return user.id;
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

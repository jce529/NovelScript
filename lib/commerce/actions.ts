import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  checkWriteAccess, isWriteAccessDbError, WRITE_SUSPENDED_MESSAGE, type WriteDenialCode,
} from '../auth/write-access';

const orderSchema = z.object({
  chapterIds: z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length),
  idempotencyKey: z.string().uuid(),
});

export interface PurchaseResult { ok: boolean; orderId?: string; error?: string; code?: WriteDenialCode }

/** D-07: purchases are writes. The authoritative check runs inside both purchase RPCs
 * (0008_sanction_enforcement.sql) while the buyer's profile row is share-locked, so a
 * sanction committed mid-purchase cannot slip through. Passing the session `userId` adds a
 * cheap pre-check that avoids creating a PENDING order for a suspended buyer. */
export interface PurchaseOptions { userId?: string }

function purchaseError(message: string): PurchaseResult {
  if (isWriteAccessDbError(message)) return { ok: false, error: WRITE_SUSPENDED_MESSAGE, code: 'write_suspended' };
  if (message.includes('insufficient balance')) return { ok: false, error: '토큰 잔액이 부족해요.' };
  if (message.includes('authentication_required')) return { ok: false, error: '로그인이 필요해요.' };
  if (message.includes('already_entitled') || message.includes('content_unavailable_or_owned')) {
    return { ok: false, error: '이미 열람 가능하거나 현재 구매할 수 없는 회차예요. 새로고침해주세요.' };
  }
  return { ok: false, error: '구매를 완료하지 못했어요. 같은 주문으로 다시 시도해주세요.' };
}

async function preCheck(supabase: SupabaseClient, options?: PurchaseOptions): Promise<PurchaseResult | null> {
  if (!options?.userId) return null;
  const access = await checkWriteAccess(supabase, options.userId);
  return access.ok ? null : { ok: false, error: access.error, code: access.code };
}

export async function createPurchaseOrder(
  supabase: SupabaseClient, input: { chapterIds: string[]; idempotencyKey: string }, options?: PurchaseOptions
): Promise<PurchaseResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '구매 항목을 확인해주세요.' };
  const denied = await preCheck(supabase, options);
  if (denied) return denied;
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_chapter_ids: parsed.data.chapterIds, p_idempotency_key: parsed.data.idempotencyKey,
  });
  return error ? purchaseError(error.message) : { ok: true, orderId: data };
}

export async function payPurchaseOrder(
  supabase: SupabaseClient, orderId: string, options?: PurchaseOptions
): Promise<PurchaseResult> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: '주문을 확인해주세요.' };
  const denied = await preCheck(supabase, options);
  if (denied) return { ...denied, orderId };
  const { data, error } = await supabase.rpc('pay_purchase_order', { p_order_id: orderId });
  return error ? { ...purchaseError(error.message), orderId } : { ok: true, orderId: data };
}

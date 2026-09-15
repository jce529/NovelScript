import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const orderSchema = z.object({
  chapterIds: z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length),
  idempotencyKey: z.string().uuid(),
});

export interface PurchaseResult { ok: boolean; orderId?: string; error?: string }

function purchaseError(message: string): string {
  if (message.includes('insufficient balance')) return '토큰 잔액이 부족해요.';
  if (message.includes('authentication_required')) return '로그인이 필요해요.';
  if (message.includes('already_entitled') || message.includes('content_unavailable_or_owned')) {
    return '이미 열람 가능하거나 현재 구매할 수 없는 회차예요. 새로고침해주세요.';
  }
  return '구매를 완료하지 못했어요. 같은 주문으로 다시 시도해주세요.';
}

export async function createPurchaseOrder(
  supabase: SupabaseClient, input: { chapterIds: string[]; idempotencyKey: string }
): Promise<PurchaseResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '구매 항목을 확인해주세요.' };
  const { data, error } = await supabase.rpc('create_purchase_order', {
    p_chapter_ids: parsed.data.chapterIds, p_idempotency_key: parsed.data.idempotencyKey,
  });
  return error ? { ok: false, error: purchaseError(error.message) } : { ok: true, orderId: data };
}

export async function payPurchaseOrder(supabase: SupabaseClient, orderId: string): Promise<PurchaseResult> {
  if (!z.string().uuid().safeParse(orderId).success) return { ok: false, error: '주문을 확인해주세요.' };
  const { data, error } = await supabase.rpc('pay_purchase_order', { p_order_id: orderId });
  return error ? { ok: false, orderId, error: purchaseError(error.message) } : { ok: true, orderId: data };
}

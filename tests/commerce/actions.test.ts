import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPurchaseOrder, payPurchaseOrder } from '../../lib/commerce/actions';
import { canView, readChapterContent } from '../../lib/access/actions';

const chapterId = '30000000-0000-4000-8000-000000000001';
const orderId = '40000000-0000-4000-8000-000000000001';
const workId = '20000000-0000-4000-8000-000000000001';
function client(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  return { rpc, supabase: { rpc } as unknown as SupabaseClient };
}

describe('purchase service boundary', () => {
  it.each([[], [chapterId, chapterId], ['invalid'], Array(101).fill(chapterId)])(
    'rejects invalid carts without contacting the database: %j', async (...ids) => {
      const { supabase, rpc } = client(orderId);
      const result = await createPurchaseOrder(supabase, { chapterIds: ids as string[], idempotencyKey: orderId });
      expect(result.ok).toBe(false);
      expect(rpc).not.toHaveBeenCalled();
    }
  );

  it('sends targets and retry key without a caller-supplied user or price', async () => {
    const { supabase, rpc } = client(orderId);
    expect(await createPurchaseOrder(supabase, { chapterIds: [chapterId], idempotencyKey: orderId }))
      .toEqual({ ok: true, orderId });
    expect(rpc).toHaveBeenCalledWith('create_purchase_order', {
      p_chapter_ids: [chapterId], p_idempotency_key: orderId,
    });
  });

  it('keeps the order ID for retry after insufficient funds', async () => {
    const { supabase } = client(null, { message: 'insufficient balance' });
    expect(await payPurchaseOrder(supabase, orderId)).toEqual({ ok: false, orderId, error: '토큰 잔액이 부족해요.' });
  });

  it('does not expose raw internal database errors', async () => {
    const { supabase } = client(null, { message: 'private database diagnostics' });
    expect((await payPurchaseOrder(supabase, orderId)).error).not.toContain('private');
  });

  it('rejects malformed order IDs without calling settlement', async () => {
    const { supabase, rpc } = client(null);
    expect((await payPurchaseOrder(supabase, 'invalid')).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('access service boundary', () => {
  it('uses session-scoped access for work-wide checks', async () => {
    const { supabase, rpc } = client(true);
    expect(await canView(supabase, workId)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('can_view', { p_work_id: workId, p_chapter_id: null });
  });

  it('fails closed on missing grants and propagates DB failures', async () => {
    expect(await canView(client(null).supabase, workId, chapterId)).toBe(false);
    await expect(canView(client(null, { message: 'offline' }).supabase, workId)).rejects.toThrow('offline');
  });

  it('distinguishes an empty readable chapter from denied content', async () => {
    expect(await readChapterContent(client('').supabase, chapterId)).toBe('');
    expect(await readChapterContent(client(null).supabase, chapterId)).toBeNull();
  });
});

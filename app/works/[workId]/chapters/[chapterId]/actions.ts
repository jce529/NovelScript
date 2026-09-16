'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { canView, getChapterAccessState } from '@/lib/access/actions';
import {
  createPurchaseOrder, payPurchaseOrder, PURCHASE_BLINDED_MESSAGE, PURCHASE_UNAVAILABLE_MESSAGE, type PurchaseResult,
} from '@/lib/commerce/actions';
import { incrementChapterView } from '@/lib/reader/views';
import { upsertReadingProgress } from '@/lib/reader/progress';
import { submitReport } from '@/lib/reader/reports';

/** D-09: increments unconditionally, regardless of login state or lock status —
 * "opened the viewer" is the trigger, not "successfully read content".
 * READ-04/D-14: reading progress is ONLY recorded for a chapter the reader could
 * actually read (Claude's discretion — a locked/paid chapter's D-06 message is not
 * "reading", so it must not become the reader's 이어보기 resume point). */
export async function trackChapterOpenAction(workId: string, chapterId: string, locked: boolean): Promise<void> {
  // Bookkeeping must never break reading (D-07/07-06): every failure is swallowed.
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    // D-07: both bookkeeping writes no-op for a suspended reader; the read itself is unaffected.
    try {
      await incrementChapterView(supabase, { chapterId, userId: user?.id ?? null });
    } catch { /* view count is best effort */ }
    // The client flag is only a hint; permission is rechecked server-side (blind-aware can_view).
    if (!locked && user && await canView(supabase, workId, chapterId)) {
      await upsertReadingProgress(supabase, { userId: user.id, workId, chapterId });
    }
  } catch { /* progress is best effort */ }
}

export async function purchaseChapterAction(chapterId: string, idempotencyKey: string): Promise<PurchaseResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  // D-13: recheck the explicit reader state before creating an order. A blind (or an already
  // readable/owned chapter) never reaches the purchase RPCs; the RPCs still enforce the blind.
  const { data: meta } = await supabase
    .from('chapters').select('work_id').eq('id', chapterId).eq('is_published', true).is('deleted_at', null).maybeSingle();
  if (!meta) return { ok: false, error: PURCHASE_UNAVAILABLE_MESSAGE, code: 'content_unavailable' };
  let access;
  try {
    access = await getChapterAccessState(supabase, { workId: meta.work_id, chapterId });
  } catch {
    return { ok: false, error: PURCHASE_UNAVAILABLE_MESSAGE, code: 'content_unavailable' };
  }
  if (access.state === 'blinded') return { ok: false, error: PURCHASE_BLINDED_MESSAGE, code: 'content_blinded' };
  // A retry after a successful payment finds the chapter already owned: report success so the
  // client refreshes instead of charging again.
  if (access.state === 'readable' && access.entitled) return { ok: true };
  if (access.state !== 'purchase_required') return { ok: false, error: PURCHASE_UNAVAILABLE_MESSAGE, code: 'content_unavailable' };
  const order = await createPurchaseOrder(supabase, { chapterIds: [chapterId], idempotencyKey }, { userId: user.id });
  if (!order.ok || !order.orderId) return order;
  const result = await payPurchaseOrder(supabase, order.orderId, { userId: user.id });
  if (result.ok) revalidatePath('/works', 'layout');
  return result;
}

export async function submitReportAction(input: { workId: string; chapterId: string | null; reasonCategory: string; detail: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return submitReport(supabase, { reporterId: user.id, ...input });
}

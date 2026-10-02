import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToggleDenial } from '../auth/write-access';
import { toggleRow } from './toggle';

/** READ-07/D-18: toggleable, login-gated. Delivery channel out of scope; this only
 * tracks subscribe/unsubscribe state, distinct from work_likes (D-08). Atomic via DB RPC (BUG-02). */
export async function toggleSubscription(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<{ subscribed?: boolean; denied?: ToggleDenial; error?: string }> {
  const { state, denied, error } = await toggleRow(supabase, 'work_subscriptions', { workId, userId }, '알림 설정을 변경하지 못했어요.');
  return { ...(state === undefined ? {} : { subscribed: state }), ...(denied ? { denied } : {}), ...(error ? { error } : {}) };
}

export async function getSubscriptionState(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from('work_subscriptions').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

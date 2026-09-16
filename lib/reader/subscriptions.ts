import type { SupabaseClient } from '@supabase/supabase-js';
import { checkWriteAccess, type ToggleDenial } from '../auth/write-access';

/** READ-07/D-18: toggleable, login-gated. Delivery channel out of scope — this only
 * tracks subscribe/unsubscribe state, distinct from work_likes (D-08). */
export async function toggleSubscription(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<{ subscribed: boolean; denied?: ToggleDenial }> {
  // D-07: checked before BOTH branches so un-toggling cannot bypass suspension.
  const access = await checkWriteAccess(supabase, userId);
  const { data: existing } = await supabase
    .from('work_subscriptions').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  if (!access.ok) return { subscribed: Boolean(existing), denied: { error: access.error, code: access.code } };
  if (existing) {
    await supabase.from('work_subscriptions').delete().eq('work_id', workId).eq('user_id', userId);
    return { subscribed: false };
  }
  await supabase.from('work_subscriptions').insert({ work_id: workId, user_id: userId });
  return { subscribed: true };
}

export async function getSubscriptionState(
  supabase: SupabaseClient,
  { workId, userId }: { workId: string; userId: string }
): Promise<boolean> {
  const { data } = await supabase
    .from('work_subscriptions').select('work_id').eq('work_id', workId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

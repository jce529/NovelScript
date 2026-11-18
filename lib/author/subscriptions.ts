import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkWriteAccess, isWriteAccessDbError, WRITE_FORBIDDEN_MESSAGE,
  WRITE_UNAVAILABLE_MESSAGE,
} from '../auth/write-access';
import { getAuthorStats } from './queries';
import type {
  AuthorSubscriptionFailure, MyAuthorSubscription, ToggleAuthorSubscriptionResult,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AUTH_REQUIRED: AuthorSubscriptionFailure = { ok: false, code: 'auth_required', error: '로그인 후 이용해 주세요.' };
const UNAVAILABLE: AuthorSubscriptionFailure = { ok: false, code: 'unavailable', error: '구독 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' };
const TOGGLE_UNAVAILABLE: AuthorSubscriptionFailure = { ok: false, code: 'unavailable', error: '구독 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.' };

async function sessionUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user?.id ?? null;
}

/** An absent row and a retained notify=false row both display as unsubscribed. */
export async function getAuthorSubscriptionState(
  supabase: SupabaseClient, authorId: string,
): Promise<{ ok: true; notify: boolean } | AuthorSubscriptionFailure> {
  if (!UUID.test(authorId)) return UNAVAILABLE;
  try {
    const userId = await sessionUserId(supabase);
    if (!userId) return AUTH_REQUIRED;
    const { data, error } = await supabase.from('author_subscriptions')
      .select('notify').eq('author_id', authorId).eq('user_id', userId).maybeSingle();
    if (error || (data !== null && typeof data?.notify !== 'boolean')) return UNAVAILABLE;
    return { ok: true, notify: data?.notify ?? false };
  } catch { return UNAVAILABLE; }
}

export async function listMyAuthorSubscriptions(
  supabase: SupabaseClient,
): Promise<{ ok: true; items: MyAuthorSubscription[] } | AuthorSubscriptionFailure> {
  try {
    if (!await sessionUserId(supabase)) return AUTH_REQUIRED;
    const { data, error } = await supabase.rpc('list_my_author_subscriptions');
    if (error || !Array.isArray(data)) return UNAVAILABLE;
    const items: MyAuthorSubscription[] = [];
    for (const value of data) {
      if (!value || typeof value !== 'object') return UNAVAILABLE;
      const row = value as Record<string, unknown>;
      // SQL returns quoted camel-case column names. A missing public profile has a null penName.
      if (typeof row.authorId !== 'string' || !UUID.test(row.authorId) ||
        !(row.penName === null || typeof row.penName === 'string') ||
        typeof row.notify !== 'boolean' || typeof row.subscribedAt !== 'string') return UNAVAILABLE;
      items.push({ authorId: row.authorId, penName: row.penName?.trim() || '알 수 없는 작가',
        notify: row.notify, subscribedAt: row.subscribedAt });
    }
    return { ok: true, items };
  } catch { return UNAVAILABLE; }
}

export async function toggleAuthorSubscription(
  supabase: SupabaseClient, authorId: string,
): Promise<ToggleAuthorSubscriptionResult> {
  if (!UUID.test(authorId)) return TOGGLE_UNAVAILABLE;
  try {
    const userId = await sessionUserId(supabase);
    if (!userId) return AUTH_REQUIRED;
    const access = await checkWriteAccess(supabase, userId);
    if (!access.ok) return { ok: false, code: access.code, error: access.error };
    const { data, error } = await supabase.rpc('toggle_author_subscriptions', { p_author_id: authorId });
    if (error) {
      if (isWriteAccessDbError(error.message)) {
        return { ok: false, code: 'write_forbidden', error: WRITE_FORBIDDEN_MESSAGE };
      }
      return TOGGLE_UNAVAILABLE;
    }
    if (typeof data !== 'boolean') return TOGGLE_UNAVAILABLE;
    const stats = await getAuthorStats(supabase, authorId);
    if (!stats.ok) return { ok: false, code: 'unavailable', error: WRITE_UNAVAILABLE_MESSAGE };
    return { ok: true, notify: data, subscriberCount: stats.stats.subscriberCount };
  } catch { return TOGGLE_UNAVAILABLE; }
}

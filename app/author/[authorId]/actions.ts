'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthorProfile, getAuthorStats, listAuthorWorks, normalizeAuthorWorksQuery } from '@/lib/author/queries';
import { getAuthorSubscriptionState, toggleAuthorSubscription } from '@/lib/author/subscriptions';
import type { AuthorProfile, AuthorStats, AuthorWorkPage, ToggleAuthorSubscriptionResult } from '@/lib/author/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILURE = { ok: false, code: 'unavailable', error: '구독 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요' } as const;
type QueryInput = { status?: unknown; sort?: unknown; offset?: unknown };
type PageData = { kind: 'not_found' | 'unavailable' } | {
  kind: 'ready'; profile: AuthorProfile; stats: AuthorStats; page: AuthorWorkPage;
  loggedIn: boolean; isSelf: boolean; notify: boolean;
};

/** Public reads use the anon-capable author API; no private profile fields leave this boundary. */
export async function loadAuthorPageData(authorId: string, input: QueryInput): Promise<PageData> {
  if (typeof authorId !== 'string' || !UUID.test(authorId)) return { kind: 'not_found' };
  try {
    const supabase = await createClient();
    const profile = await getAuthorProfile(supabase, authorId);
    if (!profile.ok) return { kind: profile.code === 'not_found' ? 'not_found' : 'unavailable' };
    const query = { ...normalizeAuthorWorksQuery(input), offset: 0 };
    const [stats, works, session] = await Promise.all([
      getAuthorStats(supabase, authorId), listAuthorWorks(supabase, authorId, query), supabase.auth.getUser(),
    ]);
    if (!stats.ok) return { kind: stats.code === 'not_found' ? 'not_found' : 'unavailable' };
    if (stats.stats.workCount === 0) return { kind: 'not_found' };
    if (!works.ok) return { kind: works.code === 'not_found' ? 'not_found' : 'unavailable' };
    const user = session.error ? null : session.data.user;
    const isSelf = user?.id === authorId;
    let notify = false;
    if (user && !isSelf) {
      const subscription = await getAuthorSubscriptionState(supabase, authorId);
      if (!subscription.ok) return { kind: 'unavailable' };
      notify = subscription.notify;
    }
    return { kind: 'ready', profile: profile.profile, stats: stats.stats, page: works.page,
      loggedIn: Boolean(user), isSelf, notify };
  } catch { return { kind: 'unavailable' }; }
}

export async function loadAuthorWorksAction(authorId: string, input: QueryInput) {
  const failure = { ok: false, code: 'unavailable', error: '작품을 더 불러오지 못했어요' } as const;
  if (typeof authorId !== 'string' || !UUID.test(authorId)) return failure;
  try {
    const result = await listAuthorWorks(await createClient(), authorId, normalizeAuthorWorksQuery(input));
    return result.ok ? result : failure;
  } catch { return failure; }
}

export async function toggleAuthorSubscriptionAction(authorId: string): Promise<ToggleAuthorSubscriptionResult> {
  if (typeof authorId !== 'string' || !UUID.test(authorId)) return FAILURE;
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, code: 'auth_required', error: '로그인 후 이용해 주세요.' };
    if (user.id === authorId) return FAILURE;
    const result = await toggleAuthorSubscription(supabase, authorId);
    if (!result.ok) {
      return { ok: false, code: result.code, error: result.code === 'write_suspended' || result.code === 'write_forbidden'
        ? '계정이 정지되어 알림 구독을 바꿀 수 없어요. 문의가 필요하면 고객센터를 이용해 주세요'
        : FAILURE.error };
    }
    // A committed toggle must not appear to fail just because cache invalidation failed.
    try {
      revalidatePath(`/author/${authorId}`);
      revalidatePath('/library');
    } catch { /* The returned authoritative values still update the current client. */ }
    return { ok: true, notify: result.notify, subscriberCount: result.subscriberCount };
  } catch { return FAILURE; }
}

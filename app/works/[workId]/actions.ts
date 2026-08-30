'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { toggleLike } from '@/lib/reader/likes';
import { toggleSubscription } from '@/lib/reader/subscriptions';
import { toggleBookmark } from '@/lib/reader/bookmarks';

export async function toggleLikeAction(workId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await toggleLike(supabase, { workId, userId: user.id });
  revalidatePath(`/works/${workId}`);
  return { ok: true, liked: result.liked };
}

export async function toggleSubscriptionAction(workId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await toggleSubscription(supabase, { workId, userId: user.id });
  revalidatePath(`/works/${workId}`);
  return { ok: true, subscribed: result.subscribed };
}

export async function toggleBookmarkAction(workId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await toggleBookmark(supabase, { workId, userId: user.id });
  revalidatePath(`/works/${workId}`);
  return { ok: true, bookmarked: result.bookmarked };
}

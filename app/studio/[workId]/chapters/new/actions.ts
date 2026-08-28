'use server';

import { createClient } from '@/lib/supabase/server';
import { createChapter } from '@/lib/chapters/actions';

export async function submitCreateChapter(workId: string, title: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.' };
  return createChapter(supabase, { ownerId: user.id, workId, title });
}

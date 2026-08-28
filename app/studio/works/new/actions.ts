'use server';

import { createClient } from '@/lib/supabase/server';
import { createWork } from '@/lib/works/actions';

export async function submitCreateWork(input: { title: string; synopsis: string | null; genre: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.' };

  return createWork(supabase, {
    ownerId: user.id,
    title: input.title,
    synopsis: input.synopsis,
    genre: input.genre,
  });
}

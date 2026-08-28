'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { reorderChapters } from '@/lib/chapters/actions';

export async function reorderChaptersAction(workId: string, orderedIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await reorderChapters(supabase, { ownerId: user.id, workId, orderedIds });
  if (result.ok) revalidatePath(`/studio/${workId}/chapters`);
  return result;
}

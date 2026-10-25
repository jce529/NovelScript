'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { moveChapter, reorderChapters } from '@/lib/chapters/actions';

export async function reorderChaptersAction(workId: string, orderedIds: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await reorderChapters(supabase, { ownerId: user.id, workId, orderedIds });
  if (result.ok) revalidatePath(`/studio/${workId}/chapters`);
  return result;
}

/** 17-07 "이동…" / drag: chapter to another 회차 folder of the same work. `targetFolderId: null` = 회차 root. */
export async function moveChapterAction(workId: string, chapterId: string, targetFolderId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await moveChapter(supabase, { ownerId: user.id, workId, chapterId, targetFolderId });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

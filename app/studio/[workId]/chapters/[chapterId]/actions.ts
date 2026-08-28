'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { saveChapterContent, publishChapter, unpublishChapter } from '@/lib/chapters/actions';

export async function getChapterAction(chapterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('chapters')
    .select('id, title, content, is_published, price_tier, work_id, works!inner(owner_id)')
    .eq('id', chapterId)
    .eq('works.owner_id', user.id)
    .maybeSingle();
  return data;
}

export async function saveChapterContentAction(workId: string, chapterId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await saveChapterContent(supabase, { ownerId: user.id, chapterId, content });
  if (result.ok) revalidatePath(`/studio/${workId}/chapters/${chapterId}`);
  return result;
}

export async function publishChapterAction(workId: string, chapterId: string, priceTier: number | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await publishChapter(supabase, { ownerId: user.id, chapterId, priceTier });
  if (result.ok) revalidatePath(`/studio/${workId}/chapters`);
  return result;
}

export async function unpublishChapterAction(workId: string, chapterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await unpublishChapter(supabase, { ownerId: user.id, chapterId });
  if (result.ok) revalidatePath(`/studio/${workId}/chapters`);
  return result;
}

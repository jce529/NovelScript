'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { saveChapterContent, publishChapter, unpublishChapter } from '@/lib/chapters/actions';
import { searchMentionNodes, quickAddMentionNode } from '@/lib/ai/mentions';
import type { KbCategory } from '@/lib/kb/templates';
import { estimateCost, generate } from '@/lib/ai/generate';
import { createGeminiClient, type ModelTier } from '@/lib/ai/gemini';
import type { PresetLevel, StylePresetId } from '@/lib/ai/prompt';

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
  if (!data) return null;

  const { data: work } = await supabase.from('works').select('genre').eq('id', data.work_id).maybeSingle();
  return { ...data, genre: work?.genre ?? null };
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

export async function searchMentionsAction(workId: string, query: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  return searchMentionNodes(supabase, { ownerId: user.id, workId, query });
}

export async function quickAddMentionAction(workId: string, category: KbCategory, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  return quickAddMentionNode(supabase, { ownerId: user.id, workId, category, name });
}

function getGeminiClientOrError(): { client?: ReturnType<typeof createGeminiClient>; error?: string } {
  try {
    return { client: createGeminiClient() };
  } catch {
    return { error: 'AI 기능을 사용할 수 없어요. 잠시 후 다시 시도해주세요.' };
  }
}

export interface AiGenerationInput {
  workId: string;
  modelTier: ModelTier;
  mentionedNodeIds: string[];
  presetLevel: PresetLevel;
  customInstruction: string | null;
  styleId: StylePresetId;
  genre: string;
  precedingText: string;
}

export async function estimateCostAction(input: AiGenerationInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const { client, error } = getGeminiClientOrError();
  if (!client) return { ok: false, error };

  return estimateCost(supabase, client, { ...input, ownerId: user.id });
}

export async function generateAction(input: AiGenerationInput & { chapterId: string; regenerationFeedback?: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const { client, error } = getGeminiClientOrError();
  if (!client) return { ok: false, error };

  return generate(supabase, client, { ...input, ownerId: user.id });
}

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { saveChapterContent, publishChapter, unpublishChapter } from '@/lib/chapters/actions';
import { searchMentionNodes, quickAddMentionNode } from '@/lib/ai/mentions';
import { saveNodeContent } from '@/lib/kb/actions';
import type { KbCategory } from '@/lib/kb/templates';
import { chat, type DocumentProposal } from '@/lib/ai/chat';
import { createGeminiClient, type ModelTier } from '@/lib/ai/gemini';
import type { PresetLevel, StylePresetId, ChatTurn } from '@/lib/ai/prompt';

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

export interface ChatActionInput {
  workId: string;
  chapterId: string;
  modelTier: ModelTier;
  mentionedNodeIds: string[];
  presetLevel: PresetLevel;
  styleId: StylePresetId;
  genre: string;
  precedingText: string;
  /** Full chat session so far, oldest first, INCLUDING the newest user
   * message as its last entry — the single entry point for every AI 패널
   * turn now (no separate "생성하기" call shape; see lib/ai/chat.ts). */
  chatHistory: ChatTurn[];
}

/** This session's redesign: ONE chat action for the whole AI 패널, replacing
 * the old generateAction/planChatAction split. Every turn may come back with
 * a chapter-prose draft, a KB document proposal, both absent (plain reply),
 * or neither (see lib/ai/chat.ts's ChatResult) — never both at once. */
export async function chatAction(input: ChatActionInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const { client, error } = getGeminiClientOrError();
  if (!client) return { ok: false, error };

  return chat(supabase, client, { ...input, ownerId: user.id });
}

/** Persists a chat-proposed document as a real KB document (createNode +
 * saveNodeContent, since createNode always seeds template content and has no
 * way to set custom content at creation time) and returns enough to add it to
 * the AiPanel's mentioned-documents list immediately. */
export async function saveDocumentProposalAction(workId: string, proposal: DocumentProposal) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };

  const created = await quickAddMentionNode(supabase, { ownerId: user.id, workId, category: proposal.category, name: proposal.name });
  if (!created.ok || !created.nodeId) return created;

  const saved = await saveNodeContent(supabase, { ownerId: user.id, nodeId: created.nodeId, content: proposal.content });
  if (!saved.ok) return { ok: false, error: saved.error };

  return { ok: true, nodeId: created.nodeId };
}

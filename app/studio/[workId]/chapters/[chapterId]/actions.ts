'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { readChapterContent } from '@/lib/access/actions';
import { createClient } from '@/lib/supabase/server';
import { saveChapterContent, publishChapter, unpublishChapter } from '@/lib/chapters/actions';
import { searchMentionNodes, quickAddMentionNode } from '@/lib/ai/mentions';
import { listCategoryFolderCandidates, saveNodeContent, validateTargetFolder, type FolderCandidatesResult } from '@/lib/kb/actions';
import type { KbCategory } from '@/lib/kb/templates';
import { chat, type ChatInput, type DocumentProposal } from '@/lib/ai/chat';
import { createPlatformProvider } from '@/lib/ai/providers/registry';
import { ProviderCallError, logProviderFailure } from '@/lib/ai/providers/errors';
import { readProviderFixture } from '@/lib/ai/providers/fixture';
import type { ModelTier } from '@/lib/ai/providers/types';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import type { PresetLevel, StylePresetId, ChatTurn } from '@/lib/ai/prompt';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAiDocPlanningMode } from '@/lib/ai/decision/activation';
import { createJevClient } from '@/lib/ai/decision/jev';
import { readDecisionFixture, createFixtureDecisionClient } from '@/lib/ai/decision/fixture';
import { DecisionCallError } from '@/lib/ai/decision/errors';

export async function getChapterAction(chapterId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('chapters')
    .select('id, title, is_published, price_tier, work_id, works!inner(owner_id)')
    .eq('id', chapterId)
    .eq('works.owner_id', user.id)
    .maybeSingle();
  if (!data) return null;

  const { data: work } = await supabase.from('works').select('genre').eq('id', data.work_id).maybeSingle();
  const content = await readChapterContent(supabase, chapterId);
  if (content === null) return null;
  return { ...data, content, genre: work?.genre ?? null };
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

export async function listCategoryFoldersAction(workId: string, category: KbCategory): Promise<FolderCandidatesResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'query_failed' };
  return listCategoryFolderCandidates(supabase, { ownerId: user.id, workId, category });
}

export async function quickAddMentionAction(workId: string, category: KbCategory, name: string, targetFolderId?: string, folderVersion?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  if (targetFolderId) {
    const validation = await validateTargetFolder(supabase, {
      ownerId: user.id, workId, category, targetFolderId, expectedVersion: folderVersion,
    });
    if (!validation.ok) return { ok: false, error: validation.error };
  }
  return quickAddMentionNode(supabase, { ownerId: user.id, workId, category, name, targetFolderId });
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
  /** D-01: generated once per writer send in AiPanel; resent unchanged on retry. */
  idempotencyKey: string;
}

// Not exported: 'use server' modules may only export async functions.
const chatActionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  modelTier: z.enum(['lite', 'pro']),
});

// Dev fixture only: keys whose response was already dropped once (in-memory, per server process).
const droppedFixtureKeys = new Set<string>();

/** Every chatAction call resolves planning fresh from the DB-backed activation resolver — no
 * code change is needed to turn Jev document planning on/off (Plan 15-11/15-09 HIGH). */
async function resolveChatPlanning(): Promise<ChatInput['planning']> {
  const fixtureMode = readDecisionFixture(process.env);
  if (fixtureMode) return { mode: 'active', decisionClient: createFixtureDecisionClient(fixtureMode) };

  const status = await getAiDocPlanningMode(createAdminClient());
  if (status.mode !== 'active') return undefined;

  try {
    return { mode: 'active', decisionClient: createJevClient() };
  } catch (err) {
    const kind = err instanceof DecisionCallError ? err.info.kind : 'config';
    console.error('[ai] decision client unavailable', { stage: 'decision_client', kind });
    return undefined;
  }
}

/** This session's redesign: ONE chat action for the whole AI 패널, replacing
 * the old generateAction/planChatAction split. Every turn may come back with
 * a chapter-prose draft, a KB document proposal, both absent (plain reply),
 * or neither (see lib/ai/chat.ts's ChatResult) — never both at once. */
export async function chatAction(input: ChatActionInput): Promise<ChatResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 'failed', failureKind: 'unauthenticated', error: CHAT_COPY.unauthenticated };

  const parsed = chatActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };

  let client;
  try {
    client = createPlatformProvider();
  } catch (err) {
    // Never log or return the raw error: it may carry the API key (D-11).
    const info = err instanceof ProviderCallError
      ? err.info
      : { provider: 'gemini' as const, status: null, kind: 'config' as const, providerErrorCode: null };
    logProviderFailure(info, parsed.data.idempotencyKey);
    return { ok: false, status: 'failed', failureKind: 'config', error: CHAT_COPY.config };
  }

  const planning = await resolveChatPlanning();

  // Explicit field list (never spread input) so a forged ownerId cannot ride along.
  const result = await chat(supabase, client, {
    workId: input.workId,
    chapterId: input.chapterId,
    modelTier: parsed.data.modelTier,
    mentionedNodeIds: input.mentionedNodeIds,
    presetLevel: input.presetLevel,
    styleId: input.styleId,
    genre: input.genre,
    precedingText: input.precedingText,
    chatHistory: input.chatHistory,
    idempotencyKey: parsed.data.idempotencyKey,
    ownerId: user.id,
    planning,
  });

  // Dev fixture: simulate a response lost AFTER the real debit, once per key, so 다시 시도 hits already_processed.
  if (
    readProviderFixture(process.env) === 'drop-response' &&
    result.status === 'completed' &&
    !droppedFixtureKeys.has(parsed.data.idempotencyKey)
  ) {
    droppedFixtureKeys.add(parsed.data.idempotencyKey);
    throw new Error('dev fixture: dropped response');
  }
  return result;
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

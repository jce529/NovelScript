'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { readChapterContent } from '@/lib/access/actions';
import { createClient } from '@/lib/supabase/server';
import { saveChapterContent, publishChapter, unpublishChapter } from '@/lib/chapters/actions';
import { searchMentionNodes, quickAddMentionNode } from '@/lib/ai/mentions';
import { listCategoryFolderCandidates, listTemplateOptions, validateTargetFolder, validateTargetTemplate, createNode, formatFolderPath, TEMPLATE_REVALIDATION_FAILED, type FolderCandidate, type FolderCandidatesResult, type TemplateOption } from '@/lib/kb/actions';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import { chat, type ChatInput } from '@/lib/ai/chat';
import { createPlatformProvider } from '@/lib/ai/providers/registry';
import { ProviderCallError, logProviderFailure } from '@/lib/ai/providers/errors';
import { readProviderFixture } from '@/lib/ai/providers/fixture';
import type { ModelTier, ProviderId } from '@/lib/ai/providers/types';
import { isKnownModel } from '@/lib/ai/providers/catalog';
import { getDefaultProviderModel } from '@/lib/ai/providers/settings';
import { loadConnectedByokModels } from '@/lib/ai/providers/byok-models';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import type { PresetLevel, StylePresetId, ChatTurn } from '@/lib/ai/prompt';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAiDocPlanningMode } from '@/lib/ai/decision/activation';
import { createJevClient } from '@/lib/ai/decision/jev';
import { readDecisionFixture, createFixtureDecisionClient } from '@/lib/ai/decision/fixture';
import { DecisionCallError } from '@/lib/ai/decision/errors';
import { regenerateDocumentWithTemplate, type RegenerateResult } from '@/lib/ai/document-regenerate';
import { recordDocumentSaveDecision, runShadowPlan } from '@/lib/ai/decision/shadow';

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
  const byokModels = await loadConnectedByokModels(supabase, user.id);
  const defaultProviderModel = await getDefaultProviderModel(supabase, user.id, byokModels);
  return { ...data, content, genre: work?.genre ?? null, defaultProviderModel, byokModels };
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
  providerId: ProviderId;
  model: string;
  keySource?: 'service' | 'byok';
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
  providerId: z.enum(['gemini', 'openai', 'anthropic']),
  model: z.string(),
  keySource: z.enum(['service', 'byok']).optional().default('service'),
}).refine((value) => isKnownModel(value.providerId, value.model), { message: 'unknown model for provider' });

// Dev fixture only: keys whose response was already dropped once (in-memory, per server process).
const droppedFixtureKeys = new Set<string>();

/** Every chatAction call resolves planning fresh from the DB-backed activation resolver — no
 * code change is needed to turn Jev document planning on/off (Plan 15-11/15-09 HIGH). */
async function resolveChatPlanning(): Promise<{ planning: ChatInput['planning']; mode: 'off' | 'shadow' | 'active' }> {
  const fixtureMode = readDecisionFixture(process.env);
  if (fixtureMode) return { planning: { mode: 'active', decisionClient: createFixtureDecisionClient(fixtureMode) }, mode: 'active' };

  const status = await getAiDocPlanningMode(createAdminClient());
  if (status.mode !== 'active') return { planning: undefined, mode: status.mode };

  try {
    return { planning: { mode: 'active', decisionClient: createJevClient() }, mode: status.mode };
  } catch (err) {
    const kind = err instanceof DecisionCallError ? err.info.kind : 'config';
    console.error('[ai] decision client unavailable', { stage: 'decision_client', kind });
    return { planning: undefined, mode: status.mode };
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
  if (parsed.data.keySource === 'byok') return { ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.byokPending };

  let client;
  try {
    client = createPlatformProvider(parsed.data.providerId);
  } catch (err) {
    // Never log or return the raw error: it may carry the API key (D-11).
    const info = err instanceof ProviderCallError
      ? err.info
      : { provider: parsed.data.providerId, status: null, kind: 'config' as const, providerErrorCode: null };
    logProviderFailure(info, parsed.data.idempotencyKey);
    return { ok: false, status: 'failed', failureKind: 'config', error: CHAT_COPY.config };
  }

  const resolvedPlanning = await resolveChatPlanning();

  // Explicit field list (never spread input) so a forged ownerId cannot ride along.
  const result = await chat(supabase, client, {
    workId: input.workId,
    chapterId: input.chapterId,
    providerId: parsed.data.providerId,
    model: parsed.data.model,
    mentionedNodeIds: input.mentionedNodeIds,
    presetLevel: input.presetLevel,
    styleId: input.styleId,
    genre: input.genre,
    precedingText: input.precedingText,
    chatHistory: input.chatHistory,
    idempotencyKey: parsed.data.idempotencyKey,
    ownerId: user.id,
    planning: resolvedPlanning.planning,
  });

  if (resolvedPlanning.mode === 'shadow') {
    const lastUser = [...input.chatHistory].reverse().find((turn) => turn.role === 'user');
    const trigger = {
      ownerId: user.id, workId: input.workId, requestKey: parsed.data.idempotencyKey,
      requestLength: lastUser?.content.length ?? 0,
      hasChapterContext: input.precedingText.length > 0,
      mentionedFactCount: input.mentionedNodeIds.length,
    };
    after(async () => {
      const { data: work } = await supabase.from('works').select('id').eq('id', trigger.workId).eq('owner_id', user.id).maybeSingle();
      if (!work) return;
      let decisionClient;
      try { decisionClient = createJevClient(); } catch { return; }
      await runShadowPlan({
        client: decisionClient, admin: createAdminClient(), rng: Math.random, now: () => new Date(),
        sampleRate: Number(process.env.AI_DOC_SHADOW_SAMPLE_RATE ?? '0.05'),
        dailyMax: Number(process.env.AI_DOC_SHADOW_DAILY_MAX ?? '500'),
        modelVersion: process.env.JEV_MODEL_VERSION ?? 'unknown',
      }, trigger);
    });
  }

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

const proposalSchema = z.object({
  category: z.enum(KB_CATEGORIES), name: z.string().trim().min(1).max(100), content: z.string().max(20000),
  recommendedFolderId: z.string().uuid().optional(), recommendedFolderPath: z.string().max(500).optional(),
  recommendedFolderVersion: z.string().max(4000).optional(), recommendedTemplateId: z.string().uuid().nullable().optional(),
  recommendedTemplateName: z.string().max(200).optional(),
});
const saveSchema = z.object({
  workId: z.string().uuid(), proposal: proposalSchema, targetFolderId: z.string().uuid(),
  folderVersion: z.string().max(4000).optional(), templateId: z.string().uuid().nullable(), regenerated: z.boolean(),
});

export interface SaveRecommendation {
  source: 'jev' | 'default'; folderId: string; folderPath: string; folderVersion: string;
  templateId: string | null; templateName: string;
}

export async function loadSavePlanAction(
  workId: string, category: KbCategory,
  rec?: { folderId?: string; folderVersion?: string; templateId?: string | null },
): Promise<
  | { status: 'ok'; recommended: SaveRecommendation; folders: FolderCandidate[]; templates: Pick<TemplateOption, 'id' | 'name' | 'scope' | 'isDefault'>[] }
  | { status: 'root_missing' | 'root_duplicate' | 'query_failed' | 'unauthenticated' }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'unauthenticated' };
  try {
    const listed = await listCategoryFolderCandidates(supabase, { ownerId: user.id, workId, category });
    if (listed.status !== 'ok') return { status: listed.status };
    const templates = await listTemplateOptions(supabase, { ownerId: user.id, workId, category });
    const defaultTemplate = templates.find((template) => template.isDefault);
    if (!defaultTemplate) return { status: 'query_failed' };
    const recommendedFolder = rec?.folderId
      ? await validateTargetFolder(supabase, { ownerId: user.id, workId, category, targetFolderId: rec.folderId, expectedVersion: rec.folderVersion })
      : null;
    const recommendedTemplate = rec?.templateId !== undefined
      ? await validateTargetTemplate(supabase, { ownerId: user.id, workId, category, templateId: rec.templateId })
      : null;
    const jevValid = recommendedFolder?.ok && recommendedTemplate?.ok;
    const folder = jevValid ? recommendedFolder.folder : listed.root;
    const template = jevValid ? recommendedTemplate.template : defaultTemplate;
    return {
      status: 'ok',
      recommended: {
        source: jevValid ? 'jev' : 'default', folderId: folder.id,
        folderPath: formatFolderPath(category, folder.path, ' › '), folderVersion: folder.version,
        templateId: template.id, templateName: template.name,
      },
      folders: listed.candidates,
      templates: templates.map(({ id, name, scope, isDefault }) => ({ id, name, scope, isDefault })),
    };
  } catch {
    return { status: 'query_failed' };
  }
}

export async function saveDocumentProposalAction(raw: unknown): Promise<
  | { ok: true; nodeId: string }
  | { ok: false; reason: 'invalid_input' | 'unauthenticated' | 'folder_changed' | 'template_changed' | 'query_failed' | 'root_missing' | 'root_duplicate' | 'write_failed'; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthenticated', error: CHAT_COPY.unauthenticated };
  const parsed = saveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid_input', error: CHAT_COPY.invalid_input };
  const { workId, proposal, targetFolderId, folderVersion, templateId } = parsed.data;
  const folder = await validateTargetFolder(supabase, { ownerId: user.id, workId, category: proposal.category, targetFolderId, expectedVersion: folderVersion });
  if (!folder.ok) return { ok: false, reason: folder.reason, error: folder.error };
  const template = await validateTargetTemplate(supabase, { ownerId: user.id, workId, category: proposal.category, templateId });
  if (!template.ok) return { ok: false, reason: 'template_changed', error: TEMPLATE_REVALIDATION_FAILED };
  const created = await createNode(supabase, {
    ownerId: user.id, workId, parentId: targetFolderId, category: proposal.category,
    nodeType: 'file', name: proposal.name, initialContent: proposal.content,
  });
  if (!created.ok || !created.nodeId) return { ok: false, reason: 'write_failed', error: created.error ?? '문서를 저장하지 못했어요.' };

  const p = parsed.data;
  if (p.proposal.recommendedFolderId) {
    // validateTargetFolder already confirmed this folder belongs to the authenticated owner's work.
    after(() => recordDocumentSaveDecision(createAdminClient(), {
      ownerId: user.id, workId: p.workId, nodeId: created.nodeId!, recommendedFolderId: p.proposal.recommendedFolderId,
      actualFolderId: p.targetFolderId, recommendedTemplateId: p.proposal.recommendedTemplateId,
      actualTemplateId: p.templateId, regenerated: p.regenerated,
    }));
  }
  revalidatePath(`/studio/${workId}/chapters`);
  return { ok: true, nodeId: created.nodeId };
}

const regenerateSchema = z.object({
  workId: z.string().uuid(), proposal: proposalSchema, templateId: z.string().uuid().nullable(),
  targetFolderId: z.string().uuid(), folderVersion: z.string().max(4000).optional(),
  modelTier: z.enum(['lite', 'pro']), idempotencyKey: z.string().uuid(),
  presetLevel: z.enum(['beginner', 'intermediate', 'freeform']),
  styleId: z.enum(['concise-hemingway', 'maximalist-dostoevsky', 'lyrical-kimhoon', 'colloquial-kimyounha']),
  genre: z.string().max(100),
});

export async function regenerateDocumentWithTemplateAction(raw: unknown): Promise<RegenerateResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, failureKind: 'unauthenticated', error: CHAT_COPY.unauthenticated };
  const parsed = regenerateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };

  let client;
  try {
    client = createPlatformProvider('gemini');
  } catch (err) {
    const info = err instanceof ProviderCallError
      ? err.info
      : { provider: 'gemini' as const, status: null, kind: 'config' as const, providerErrorCode: null };
    logProviderFailure(info, parsed.data.idempotencyKey);
    return { ok: false, failureKind: 'config', error: CHAT_COPY.config };
  }
  return regenerateDocumentWithTemplate(supabase, client, { ...parsed.data, ownerId: user.id });
}

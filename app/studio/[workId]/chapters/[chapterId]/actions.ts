'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { readChapterContent } from '@/lib/access/actions';
import { createClient } from '@/lib/supabase/server';
import { saveChapterContent, publishChapter, unpublishChapter } from '@/lib/chapters/actions';
import { searchMentionNodes, quickAddMentionNode } from '@/lib/ai/mentions';
import { listCategoryFolderCandidates, getWorkKbNodes, listTemplateOptions, validateTargetFolder, validateTargetTemplate, createNode, formatFolderPath, TEMPLATE_REVALIDATION_FAILED, type FolderCandidate, type FolderCandidatesResult, type TemplateOption } from '@/lib/kb/actions';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import type { FlatKbNode } from '@/lib/kb/tree';
import { chat, type ChatInput } from '@/lib/ai/chat';
import { resolveGenerationRoute, type GenerationRoute } from '@/lib/ai/providers/byok';
import { readProviderFixture } from '@/lib/ai/providers/fixture';
import type { ProviderId } from '@/lib/ai/providers/types';
import { isKnownModel } from '@/lib/ai/providers/catalog';
import { resolveDefaultProviderModel } from '@/lib/ai/providers/settings';
import { loadConnectedByokModels } from '@/lib/ai/providers/byok-models';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import type { PresetLevel, StylePresetId, ChatTurn } from '@/lib/ai/prompt';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAiDocPlanningMode } from '@/lib/ai/decision/activation';
import { createJevClient } from '@/lib/ai/decision/jev';
import { readDecisionFixture, createFixtureDecisionClient } from '@/lib/ai/decision/fixture';
import { DecisionCallError } from '@/lib/ai/decision/errors';
import { regenerateDocumentWithTemplate, type RegenerateResult } from '@/lib/ai/document-regenerate';
import { planCategoryOnly, planFolderAndTemplate } from '@/lib/ai/decision/plan';
import { recordDocumentSaveDecision, runShadowPlan } from '@/lib/ai/decision/shadow';
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_CHARS, MAX_IMPORT_FILES, MAX_IMPORT_CHARS, documentNameFromFile } from '@/lib/ai/attachments';

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
  const { selection: defaultProviderModel, fallback: defaultFallback } = await resolveDefaultProviderModel(supabase, user.id, byokModels);
  return { ...data, content, genre: work?.genre ?? null, defaultProviderModel, defaultFallback, byokModels };
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
  /** 회차 편집기에서 호출하면 chapterId, 설정 문서 편집기에서 호출하면 nodeId (둘 중 하나). */
  chapterId?: string;
  nodeId?: string;
  /** Files attached to this conversation only (never saved). */
  attachments?: { name: string; content: string }[];
  providerId: ProviderId;
  model: string;
  keySource?: 'service' | 'byok';
  replacementConsent?: boolean;
  replacementSelection?: { providerId: ProviderId; model: string; keySource: 'service' };
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
  replacementConsent: z.boolean().optional().default(false),
  replacementSelection: z.object({ providerId: z.enum(['gemini', 'openai', 'anthropic']), model: z.string(), keySource: z.literal('service') }).optional(),
  chapterId: z.string().min(1).max(100).optional(),
  nodeId: z.string().min(1).max(100).optional(),
  attachments: z.array(z.object({ name: z.string().max(200), content: z.string().max(MAX_ATTACHMENT_CHARS) })).max(MAX_ATTACHMENTS).optional(),
}).refine((value) => isKnownModel(value.providerId, value.model), { message: 'unknown model for provider' })
  .refine((value) => Boolean(value.chapterId) !== Boolean(value.nodeId), { message: 'exactly one of chapterId/nodeId' });

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
  const work = await supabase.from('works').select('id').eq('id', input.workId).eq('owner_id', user.id).maybeSingle();
  if (work.error || !work.data) return { ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };
  if (parsed.data.chapterId) {
    const chapter = await supabase.from('chapters').select('id').eq('id', parsed.data.chapterId).eq('work_id', input.workId).maybeSingle();
    if (chapter.error || !chapter.data) return { ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };
  } else if (parsed.data.nodeId) {
    const node = await supabase.from('kb_nodes').select('id').eq('id', parsed.data.nodeId).eq('owner_id', user.id).eq('work_id', input.workId).is('deleted_at', null).maybeSingle();
    if (node.error || !node.data) return { ok: false, status: 'failed', failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };
  }

  let route: GenerationRoute;
  try {
    route = await resolveGenerationRoute({
      supabase, admin: createAdminClient() as never, ownerId: user.id,
      selection: { providerId: parsed.data.providerId, model: parsed.data.model, keySource: parsed.data.keySource },
    });
    if (route.kind === 'replacement_required' && parsed.data.replacementConsent && parsed.data.replacementSelection &&
      JSON.stringify(route.replacement) === JSON.stringify(parsed.data.replacementSelection)) {
      route = await resolveGenerationRoute({ supabase, admin: createAdminClient() as never, ownerId: user.id, selection: parsed.data.replacementSelection });
    }
  } catch (err) {
    // Never log or return the raw error: it may carry the API key (D-11).
    console.error('[ai] generation route unavailable', { provider: parsed.data.providerId, idempotencyKey: parsed.data.idempotencyKey });
    return { ok: false, status: 'failed', failureKind: 'config', error: CHAT_COPY.config };
  }

  if (route.kind === 'replacement_required') return { kind: 'replacement_required', ok: false, status: 'failed', failureKind: 'unavailable', replacement: route.replacement,
    original: { providerId: parsed.data.providerId, model: parsed.data.model }, error: CHAT_COPY.byokPending } as unknown as ChatResult;

  const resolvedPlanning = await resolveChatPlanning();

  // Explicit field list (never spread input) so a forged ownerId cannot ride along.
  const result = await chat(supabase, route.client, {
    workId: input.workId,
    chapterId: parsed.data.chapterId,
    nodeId: parsed.data.nodeId,
    contextKind: parsed.data.nodeId ? 'document' : 'chapter',
    attachments: parsed.data.attachments,
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
    route,
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
  providerId: z.enum(['gemini', 'openai', 'anthropic']), model: z.string(), keySource: z.enum(['service', 'byok']), idempotencyKey: z.string().uuid(),
  replacementConsent: z.boolean().optional().default(false),
  replacementSelection: z.object({ providerId: z.enum(['gemini', 'openai', 'anthropic']), model: z.string(), keySource: z.literal('service') }).optional(),
  presetLevel: z.enum(['beginner', 'intermediate', 'freeform']),
  styleId: z.enum(['concise-hemingway', 'maximalist-dostoevsky', 'lyrical-kimhoon', 'colloquial-kimyounha']),
  genre: z.string().max(100),
});

export async function regenerateDocumentWithTemplateAction(raw: unknown): Promise<RegenerateResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, failureKind: 'unauthenticated', error: CHAT_COPY.unauthenticated };
  const parsed = regenerateSchema.safeParse(raw);
  if (!parsed.success || !isKnownModel(parsed.data.providerId, parsed.data.model)) {
    return { ok: false, failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };
  }
  const work = await supabase.from('works').select('id').eq('id', parsed.data.workId).eq('owner_id', user.id).maybeSingle();
  if (work.error || !work.data) return { ok: false, failureKind: 'invalid_input', error: CHAT_COPY.invalid_input };
  let route: GenerationRoute;
  try {
    route = await resolveGenerationRoute({ supabase, admin: createAdminClient() as never, ownerId: user.id,
      selection: { providerId: parsed.data.providerId, model: parsed.data.model, keySource: parsed.data.keySource } });
    if (route.kind === 'replacement_required' && parsed.data.replacementConsent && parsed.data.replacementSelection &&
      JSON.stringify(route.replacement) === JSON.stringify(parsed.data.replacementSelection)) {
      route = await resolveGenerationRoute({ supabase, admin: createAdminClient() as never, ownerId: user.id, selection: parsed.data.replacementSelection });
    }
  } catch (err) {
    console.error('[ai] regeneration route unavailable', { provider: parsed.data.providerId, idempotencyKey: parsed.data.idempotencyKey });
    return { ok: false, failureKind: 'config', error: CHAT_COPY.config };
  }
  if (route.kind === 'replacement_required') return { kind: 'replacement_required', ok: false, status: 'failed', failureKind: 'unavailable',
    replacement: route.replacement, original: { providerId: parsed.data.providerId, model: parsed.data.model }, error: CHAT_COPY.byokPending };
  return regenerateDocumentWithTemplate(supabase, route.client, { ...parsed.data, ownerId: user.id, route });
}

/** 설정 문서 편집기의 AI 패널이 필요로 하는 값: 기본 모델·BYOK 모델·작품 장르. */
export async function getNodeAiContextAction(workId: string, nodeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: node } = await supabase.from('kb_nodes').select('id, work_id, name, category')
    .eq('id', nodeId).eq('owner_id', user.id).is('deleted_at', null).maybeSingle();
  if (!node || node.work_id !== workId) return null;
  const { data: work } = await supabase.from('works').select('genre').eq('id', workId).eq('owner_id', user.id).maybeSingle();
  const byokModels = await loadConnectedByokModels(supabase, user.id);
  const { selection: defaultProviderModel, fallback: defaultFallback } = await resolveDefaultProviderModel(supabase, user.id, byokModels);
  return { genre: work?.genre ?? null, defaultProviderModel, defaultFallback, byokModels, node: { id: node.id, name: node.name, category: node.category } };
}

const importSchema = z.object({
  workId: z.string().uuid(),
  category: z.enum(KB_CATEGORIES),
  targetFolderId: z.string().uuid(),
  folderVersion: z.string().max(4000).optional(),
  files: z.array(z.object({ name: z.string().min(1).max(200), content: z.string().max(MAX_IMPORT_CHARS) })).min(1).max(MAX_IMPORT_FILES),
});

export type ImportFilesResult =
  | { ok: true; created: { fileName: string; nodeId: string; name: string }[]; failed: { fileName: string; error: string }[] }
  | { ok: false; error: string };

/** 로컬에서 작업한 .md/.txt 여러 개를 선택한 카테고리 폴더에 설정 문서로 한 번에 저장한다. */
export async function importFilesAction(raw: unknown): Promise<ImportFilesResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: CHAT_COPY.unauthenticated };
  const parsed = importSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: '파일 개수나 크기가 한도를 넘었어요.' };
  const { workId, category, targetFolderId, folderVersion, files } = parsed.data;
  const folder = await validateTargetFolder(supabase, { ownerId: user.id, workId, category, targetFolderId, expectedVersion: folderVersion });
  if (!folder.ok) return { ok: false, error: folder.error };

  const created: { fileName: string; nodeId: string; name: string }[] = [];
  const failed: { fileName: string; error: string }[] = [];
  for (const file of files) {
    const name = documentNameFromFile(file.name);
    if (!name) { failed.push({ fileName: file.name, error: '파일 이름이 비어 있어요.' }); continue; }
    const result = await createNode(supabase, {
      ownerId: user.id, workId, parentId: targetFolderId, category, nodeType: 'file', name, initialContent: file.content,
    });
    if (result.ok && result.nodeId) created.push({ fileName: file.name, nodeId: result.nodeId, name });
    else failed.push({ fileName: file.name, error: result.error ?? '저장하지 못했어요.' });
  }
  if (created.length > 0) revalidatePath(`/studio/${workId}`, 'layout');
  return { ok: true, created, failed };
}

export interface UploadClassification {
  fileName: string;
  /** null = Jev가 확신하지 못함 → 사용자가 직접 고르도록 둔다. */
  category: KbCategory | null;
  folderId: string | null;
  folderPath: string | null;
  folderVersion: string | null;
  confidence: number | null;
}
export type ClassifyUploadResult =
  | { ok: true; items: UploadClassification[] }
  | { ok: false; reason: 'unauthenticated' | 'invalid_input' | 'unavailable'; error: string };

const classifySchema = z.object({
  workId: z.string().uuid(),
  files: z.array(z.object({ name: z.string().min(1).max(200), content: z.string().max(MAX_IMPORT_CHARS) })).min(1).max(MAX_IMPORT_FILES),
});

/** Jev가 업로드 파일마다 카테고리·폴더를 제안한다. 저장은 하지 않고, 사용자가 승인한 뒤 importClassifiedFilesAction이 저장한다. */
export async function classifyUploadFilesAction(raw: unknown): Promise<ClassifyUploadResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'unauthenticated', error: CHAT_COPY.unauthenticated };
  const parsed = classifySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid_input', error: '파일 개수나 크기가 한도를 넘었어요.' };
  const { workId, files } = parsed.data;
  const { data: work } = await supabase.from('works').select('id').eq('id', workId).eq('owner_id', user.id).maybeSingle();
  if (!work) return { ok: false, reason: 'invalid_input', error: '작품을 찾을 수 없어요.' };

  const fixtureMode = readDecisionFixture(process.env);
  let client;
  try { client = fixtureMode ? createFixtureDecisionClient(fixtureMode) : createJevClient(); } catch {
    return { ok: false, reason: 'unavailable', error: '자동 분류를 지금 쓸 수 없어요. 폴더를 직접 선택해 주세요.' };
  }

  const items: UploadClassification[] = [];
  const classifyOne = async (file: { name: string; content: string }): Promise<UploadClassification> => {
    const empty = { fileName: file.name, category: null, folderId: null, folderPath: null, folderVersion: null, confidence: null };
    try {
      const state = { userRequest: '업로드한 설정 파일을 알맞은 설정집 카테고리에 분류', fileName: documentNameFromFile(file.name), fileContent: file.content.slice(0, 3000) };
      const category = await planCategoryOnly(client, state);
      if (category.kind !== 'category') return empty;
      const selected = await planFolderAndTemplate(client, supabase, { ownerId: user.id, workId, category: category.category, state });
      if (selected.kind !== 'planned') return { ...empty, category: category.category, confidence: category.confidence };
      return {
        fileName: file.name, category: category.category, confidence: category.confidence,
        folderId: selected.folder.id, folderVersion: selected.folder.version,
        folderPath: formatFolderPath(category.category, selected.folder.path, ' › '),
      };
    } catch { return empty; }
  };
  for (let i = 0; i < files.length; i += 5) {
    items.push(...await Promise.all(files.slice(i, i + 5).map(classifyOne)));
  }
  return { ok: true, items };
}

const importClassifiedSchema = z.object({
  workId: z.string().uuid(),
  files: z.array(z.object({
    name: z.string().min(1).max(200), content: z.string().max(MAX_IMPORT_CHARS),
    targetFolderId: z.string().uuid(),
  })).min(1).max(MAX_IMPORT_FILES),
});

/** 승인 화면 트리용: 작품의 카테고리(인물·장소…) 폴더와 기존 문서만 돌려준다. 회차·템플릿 영역은 배치 대상이 아니다. */
export async function loadPlacementTreeAction(workId: string): Promise<FlatKbNode[] | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const nodes = await getWorkKbNodes(supabase, { ownerId: user.id, workId });
  return nodes.filter((node) => (KB_CATEGORIES as string[]).includes(node.category));
}

/** 사용자가 트리에서 확정한 위치대로 저장한다. 폴더의 카테고리는 폴더 자체에서 읽고, 저장 직전에 폴더를 다시 검증한다. */
export async function importClassifiedFilesAction(raw: unknown): Promise<ImportFilesResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: CHAT_COPY.unauthenticated };
  const parsed = importClassifiedSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: '파일 개수나 크기가 한도를 넘었어요.' };
  const { workId, files } = parsed.data;

  const folderCategory = new Map<string, KbCategory | null>();
  async function categoryOf(folderId: string): Promise<KbCategory | null> {
    if (folderCategory.has(folderId)) return folderCategory.get(folderId)!;
    const { data } = await supabase.from('kb_nodes').select('category, node_type')
      .eq('id', folderId).eq('owner_id', user!.id).eq('work_id', workId).eq('scope', 'work').is('deleted_at', null).maybeSingle();
    const category = data?.node_type === 'folder' && (KB_CATEGORIES as string[]).includes(data.category) ? data.category as KbCategory : null;
    folderCategory.set(folderId, category);
    return category;
  }

  const created: { fileName: string; nodeId: string; name: string }[] = [];
  const failed: { fileName: string; error: string }[] = [];
  for (const file of files) {
    const category = await categoryOf(file.targetFolderId);
    if (!category) { failed.push({ fileName: file.name, error: '문서를 넣을 수 없는 폴더예요.' }); continue; }
    const folder = await validateTargetFolder(supabase, { ownerId: user.id, workId, category, targetFolderId: file.targetFolderId });
    if (!folder.ok) { failed.push({ fileName: file.name, error: folder.error }); continue; }
    const name = documentNameFromFile(file.name);
    if (!name) { failed.push({ fileName: file.name, error: '파일 이름이 비어 있어요.' }); continue; }
    const result = await createNode(supabase, { ownerId: user.id, workId, parentId: file.targetFolderId, category, nodeType: 'file', name, initialContent: file.content });
    if (result.ok && result.nodeId) created.push({ fileName: file.name, nodeId: result.nodeId, name });
    else failed.push({ fileName: file.name, error: result.error ?? '저장하지 못했어요.' });
  }
  if (created.length > 0) revalidatePath(`/studio/${workId}`, 'layout');
  return { ok: true, created, failed };
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { planFolderAndTemplate, planTaskAndCategory } from '@/lib/ai/decision/plan';
import type { DecisionClient } from '@/lib/ai/decision/types';
import { formatFolderPath, FOLDER_COPY } from '@/lib/kb/actions';
import { composeSystemInstruction, assembleUserContent } from '@/lib/ai/prompt';
import { validateDocumentAgainstPlan, DOCUMENT_CONTRACT_COPY } from '@/lib/ai/document-contract';
import { CHAT_COPY, classifyCappedReason, type ChatResult } from '@/lib/ai/chat-result';
import { settlePaidGeneration, type AnyPaidGenerationContext } from '@/lib/ai/paid-generation';
import type { ProviderClient } from '@/lib/ai/providers/types';
import type { ChatInput } from '@/lib/ai/chat';
import { parseChatResponse } from '@/lib/ai/chat-parse';

export const CLARIFY_MESSAGE = '어떤 문서로 저장할지 조금 더 알려주시면 정확하게 도와드릴게요.';

export function buildDocumentPlanState(
  input: Pick<ChatInput, 'precedingText' | 'chatHistory'>,
  mentionedDocs: { name: string; content: string }[],
): Record<string, unknown> {
  return {
    userRequest: input.chatHistory.at(-1)?.content ?? '',
    chapterContext: input.precedingText,
    mentionedFacts: mentionedDocs.map((doc) => `${doc.name}: ${doc.content}`),
  };
}

export type StrategyOutcome = { kind: 'fallthrough' } | { kind: 'result'; chatResult: ChatResult };

export async function runDocumentPlanningStrategy(args: {
  supabase: SupabaseClient;
  providerClient: ProviderClient;
  decisionClient: DecisionClient;
  ctx: AnyPaidGenerationContext;
  input: ChatInput;
  mentionedDocs: { name: string; content: string }[];
}): Promise<StrategyOutcome> {
  const { supabase, providerClient, decisionClient, ctx, input, mentionedDocs } = args;
  let plan: { category: string; folderPath: string; templateName: string; templateContent: string; purpose: string; folderId: string; folderVersion: string; templateId: string | null };

  try {
    const state = buildDocumentPlanState(input, mentionedDocs);
    const task = await planTaskAndCategory(decisionClient, state);
    if (task.kind === 'clarify') {
      return { kind: 'result', chatResult: { ok: true, status: 'completed', reply: CLARIFY_MESSAGE, draft: null, proposal: null, wasCapped: false, ...('walletBalance' in ctx ? { remainingBalance: ctx.walletBalance } : {}) } };
    }
    if (task.kind !== 'document') return { kind: 'fallthrough' };
    const selected = await planFolderAndTemplate(decisionClient, supabase, {
      ownerId: input.ownerId, workId: input.workId, category: task.category, state,
    });
    if (selected.kind === 'data_integrity') {
      return { kind: 'result', chatResult: { ok: false, status: 'failed', failureKind: 'unknown', error: FOLDER_COPY[selected.reason] } };
    }
    const folderPath = formatFolderPath(task.category, selected.folder.path, '/');
    plan = {
      category: task.category,
      folderPath,
      templateName: selected.template.name,
      templateContent: selected.template.content,
      purpose: `${task.category} 설정`,
      folderId: selected.folder.id,
      folderVersion: selected.folder.version,
      templateId: selected.template.id,
    };
  } catch {
    console.error('[ai] document planning failed', { stage: 'document_planning', idempotencyKey: input.idempotencyKey });
    return { kind: 'result', chatResult: { ok: false, status: 'failed', failureKind: 'unknown', error: CHAT_COPY.unknown } };
  }

  const systemInstruction = composeSystemInstruction({
    presetLevel: input.presetLevel, styleId: input.styleId, genre: input.genre,
    documentPlan: { category: plan.category as ChatInput['planning'] extends never ? never : import('@/lib/kb/categories').KbCategory, folderPath: plan.folderPath, templateName: plan.templateName, templateContent: plan.templateContent, purpose: plan.purpose },
  });
  const contents = assembleUserContent({ mentionedDocs: mentionedDocs as Array<{ name: string; category: string; content: string }>, precedingText: input.precedingText, chatHistory: input.chatHistory, contextKind: input.contextKind });
  const id = { ownerId: input.ownerId, idempotencyKey: input.idempotencyKey, providerId: input.providerId, model: input.model, workId: input.workId, chapterId: input.chapterId ?? null };
  const model = 'walletBalance' in ctx ? ctx.model : ctx.route.trusted.selection.model;
  const settled = await settlePaidGeneration(providerClient, ctx, { ...id, ledgerReason: input.chapterId ? `chapter:${input.chapterId}` : `kb:${input.nodeId ?? 'unknown'}` }, () =>
    providerClient.generateContent({ model, systemInstruction, contents, maxOutputTokens: ctx.maxOutputTokens, temperature: 0.9 }));
  if (settled.kind === 'terminal') return { kind: 'result', chatResult: settled.chatResult };

  const wasCapped = settled.result.finishReason === 'max_tokens';
  const cappedReason = wasCapped ? classifyCappedReason({ maxOutputTokens: ctx.maxOutputTokens, usage: settled.result.usage }) : undefined;
  const parsed = parseChatResponse(settled.result.text);
  const check = validateDocumentAgainstPlan(parsed.proposal, { category: plan.category as import('@/lib/kb/categories').KbCategory, templateContent: plan.templateContent });
  const remainingBalance = 'remainingBalance' in settled ? { remainingBalance: settled.remainingBalance } : {};
  if (!check.ok) {
    return { kind: 'result', chatResult: { ok: true, status: 'completed', reply: `${parsed.reply}\n\n${DOCUMENT_CONTRACT_COPY}`.trim(), draft: parsed.draft, proposal: null, wasCapped, ...(cappedReason && { cappedReason }), ...remainingBalance } };
  }
  return { kind: 'result', chatResult: {
    ok: true, status: 'completed', reply: parsed.reply, draft: parsed.draft,
    proposal: { ...parsed.proposal!, recommendedFolderId: plan.folderId, recommendedFolderPath: plan.folderPath, recommendedFolderVersion: plan.folderVersion, recommendedTemplateId: plan.templateId, recommendedTemplateName: plan.templateName },
    wasCapped, ...(cappedReason && { cappedReason }), ...remainingBalance,
  } };
}

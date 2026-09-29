import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { validateTargetFolder, validateTargetTemplate, formatFolderPath, TEMPLATE_REVALIDATION_FAILED } from '@/lib/kb/actions';
import { preflightPaidGeneration, settlePaidGeneration } from '@/lib/ai/paid-generation';
import { composeSystemInstruction, type DocumentProposal, type PresetLevel, type StylePresetId } from '@/lib/ai/prompt';
import { validateDocumentAgainstPlan } from '@/lib/ai/document-contract';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import { parseChatResponse } from '@/lib/ai/chat-parse';
import type { ModelTier, ProviderClient } from '@/lib/ai/providers/types';

export const REGENERATION_FAILED = '문서를 다시 생성하지 못했어요. 다시 시도해주세요.';

export type RegenerateResult =
  | { ok: true; content: string; name: string; remainingBalance: number }
  | { ok: false; error: string; status?: ChatResult['status']; failureKind?: ChatResult['failureKind'] };

const UUID = z.string().uuid();

export async function regenerateDocumentWithTemplate(
  supabase: SupabaseClient,
  client: ProviderClient,
  input: {
    ownerId: string; workId: string; proposal: DocumentProposal; templateId: string | null;
    targetFolderId: string; folderVersion?: string; modelTier: ModelTier; idempotencyKey: string;
    presetLevel: PresetLevel; styleId: StylePresetId; genre: string;
  },
): Promise<RegenerateResult> {
  if (
    !UUID.safeParse(input.idempotencyKey).success || !UUID.safeParse(input.workId).success ||
    !UUID.safeParse(input.targetFolderId).success ||
    (input.templateId !== null && !UUID.safeParse(input.templateId).success) ||
    !['lite', 'pro'].includes(input.modelTier) ||
    !input.proposal.name.trim() || input.proposal.name.length > 100 || input.proposal.content.length > 20000 ||
    input.genre.length > 100
  ) return { ok: false, error: CHAT_COPY.invalid_input, failureKind: 'invalid_input' };

  const targetTemplate = await validateTargetTemplate(supabase, {
    ownerId: input.ownerId, workId: input.workId, category: input.proposal.category, templateId: input.templateId,
  });
  if (!targetTemplate.ok) return { ok: false, error: TEMPLATE_REVALIDATION_FAILED };
  const targetFolder = await validateTargetFolder(supabase, {
    ownerId: input.ownerId, workId: input.workId, category: input.proposal.category,
    targetFolderId: input.targetFolderId, expectedVersion: input.folderVersion,
  });
  if (!targetFolder.ok) return { ok: false, error: targetFolder.error };

  const identity = { ownerId: input.ownerId, idempotencyKey: input.idempotencyKey, modelTier: input.modelTier };
  const preflight = await preflightPaidGeneration(supabase, identity);
  if (!preflight.ok) {
    return {
      ok: false,
      error: preflight.chatResult.error ?? CHAT_COPY.unknown,
      status: preflight.chatResult.status,
      failureKind: preflight.chatResult.failureKind,
    };
  }

  const systemInstruction = composeSystemInstruction({
    presetLevel: input.presetLevel,
    styleId: input.styleId,
    genre: input.genre,
    documentPlan: {
      category: input.proposal.category,
      folderPath: formatFolderPath(input.proposal.category, targetFolder.folder.path, '/'),
      templateName: targetTemplate.template.name,
      templateContent: targetTemplate.template.content,
      purpose: `${input.proposal.category} 설정`,
    },
  });
  const contents = `문서 이름은 반드시 "${input.proposal.name}" 그대로 유지하고 본문 제목에도 같은 이름을 쓸 것.\n기존 생성 결과(사실 원천 — 새 템플릿 구조로 다시 정리하고, 여기에 없는 사실을 새로 확정하지 말 것):\n${input.proposal.content}`;
  const settled = await settlePaidGeneration(client, preflight.ctx, {
    ...identity, ledgerReason: `document_regenerate:${input.workId}`,
  }, () => client.generateContent({
    model: preflight.ctx.model, systemInstruction, contents,
    maxOutputTokens: preflight.ctx.maxOutputTokens, temperature: 0.7,
  }));
  if (settled.kind === 'terminal') {
    return {
      ok: false,
      error: settled.chatResult.error ?? (settled.chatResult.status === 'refused' ? CHAT_COPY.refusedTitle : CHAT_COPY.unknown),
      status: settled.chatResult.status,
      failureKind: settled.chatResult.failureKind,
    };
  }

  const parsed = parseChatResponse(settled.result.text);
  if (!validateDocumentAgainstPlan(parsed.proposal, {
    category: input.proposal.category, templateContent: targetTemplate.template.content,
  }).ok) return { ok: false, error: REGENERATION_FAILED };
  // BUG-04: 템플릿만 바꾸는 재생성이므로 이름은 원본을 강제하고, 본문 제목이 원본 이름과 다르면 실패 처리한다.
  const title = parsed.proposal!.content.split('\n').map((line) => line.trim()).find((line) => /^#\s+\S/.test(line));
  if (title && !title.includes(input.proposal.name.trim())) return { ok: false, error: REGENERATION_FAILED };
  return {
    ok: true,
    content: parsed.proposal!.content,
    name: input.proposal.name,
    remainingBalance: settled.remainingBalance,
  };
}

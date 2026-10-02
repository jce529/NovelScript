import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { validateTargetFolder, validateTargetTemplate, formatFolderPath, TEMPLATE_REVALIDATION_FAILED } from '@/lib/kb/actions';
import { preflightPaidGeneration, settlePaidGeneration } from '@/lib/ai/paid-generation';
import { composeSystemInstruction, type DocumentProposal, type PresetLevel, type StylePresetId } from '@/lib/ai/prompt';
import { validateDocumentAgainstPlan } from '@/lib/ai/document-contract';
import { CHAT_COPY, type ChatResult } from '@/lib/ai/chat-result';
import { parseChatResponse } from '@/lib/ai/chat-parse';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import type { ModelTier, ProviderClient } from '@/lib/ai/providers/types';

export const REGENERATION_FAILED = '문서를 다시 생성하지 못했어요. 다시 시도해주세요.';

export type RegenerateResult =
  | { ok: true; content: string; name: string; remainingBalance: number }
  | { ok: false; error: string; status?: ChatResult['status']; failureKind?: ChatResult['failureKind'] };

const UUID = z.string().uuid();
const LINKABLE_NAME_LIMIT = 200;

/** BUG-05: 호출자 본인의 이 작품(5개 카테고리+custom)과 계정 공유 KB의 파일 이름(mentions와 같은 범위). `names`를 주면 그 이름만 조회한다. 조회 오류는 null(fail closed). */
async function queryKbFileNames(
  supabase: SupabaseClient, { ownerId, workId, names }: { ownerId: string; workId: string; names?: string[] },
): Promise<string[] | null> {
  try {
    let work = supabase.from('kb_nodes').select('name').eq('owner_id', ownerId).eq('work_id', workId).eq('scope', 'work')
      .eq('node_type', 'file').in('category', [...KB_CATEGORIES, 'custom']).is('deleted_at', null);
    let shared = supabase.from('kb_nodes').select('name').eq('owner_id', ownerId).eq('scope', 'account_template')
      .eq('node_type', 'file').is('deleted_at', null);
    if (names) { work = work.in('name', names); shared = shared.in('name', names); }
    else { work = work.order('name').limit(LINKABLE_NAME_LIMIT); shared = shared.order('name').limit(LINKABLE_NAME_LIMIT); }
    const [w, a] = await Promise.all([work, shared]);
    if (w.error || a.error) return null;
    return [...new Set([...(w.data ?? []), ...(a.data ?? [])].map((row) => String(row.name).trim()))];
  } catch {
    return null;
  }
}

async function findExistingLinkTargets(
  supabase: SupabaseClient, input: { ownerId: string; workId: string; names: string[] },
): Promise<Set<string> | null> {
  const found = await queryKbFileNames(supabase, input);
  return found ? new Set(found) : null;
}

/** BUG-05: 모델에게 링크해도 되는 KB 문서 이름을 알려 주는 프롬프트 문단. 목록을 못 얻으면 새 링크를 금지한다. */
async function linkPolicyPrompt(supabase: SupabaseClient, input: { ownerId: string; workId: string; selfName: string }): Promise<string> {
  const names = await queryKbFileNames(supabase, input);
  const linkable = (names ?? []).filter((name) => name !== input.selfName.trim());
  if (linkable.length === 0) return '\n링크: 기존 생성 결과에 없는 [[링크]]를 새로 만들지 말 것. 다른 문서 이름은 링크 없이 일반 텍스트로 쓸 것.';
  return `\n링크: [[문서 이름]] 형태의 링크는 아래 KB 문서 이름만 사용할 것(기존 생성 결과에 이미 있는 링크는 유지). 아래에 없는 인물·세력·장소 이름은 [[ ]] 없이 일반 텍스트로 쓸 것.\nKB 문서: ${linkable.join(', ')}`;
}

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

  // BUG-06: settle releases the wallet lease; this also covers exits before settle.
  try {
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
    const linkPolicy = await linkPolicyPrompt(supabase, { ownerId: input.ownerId, workId: input.workId, selfName: input.proposal.name });
    const contents = `문서 이름은 반드시 "${input.proposal.name}" 그대로 유지하고 본문 제목에도 같은 이름을 쓸 것.\n기존 생성 결과(사실 원천 — 새 템플릿 구조로 다시 정리하고, 여기에 없는 사실을 새로 확정하지 말 것):\n${input.proposal.content}${linkPolicy}`;
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
    const links = (content: string) => [...content.matchAll(/\[\[([^\[\]]+)\]\]/g)].map((match) => match[1]);
    const originalLinks = links(input.proposal.content);
    const regeneratedLinks = links(parsed.proposal!.content);
    if (
      regeneratedLinks.filter((target) => target === input.proposal.name).length <
        originalLinks.filter((target) => target === input.proposal.name).length
    ) return { ok: false, error: REGENERATION_FAILED };
    // BUG-05: 원본에 없던 링크는 KB에 실제 있는 문서일 때만 허용한다(지어낸 링크 차단).
    const newTargets = [...new Set(regeneratedLinks.filter((target) => !originalLinks.includes(target)).map((target) => target.trim()))];
    if (newTargets.length > 0) {
      const existing = await findExistingLinkTargets(supabase, { ownerId: input.ownerId, workId: input.workId, names: newTargets });
      if (!existing || newTargets.some((target) => !existing.has(target))) return { ok: false, error: REGENERATION_FAILED };
    }
    return {
      ok: true,
      content: parsed.proposal!.content,
      name: input.proposal.name,
      remainingBalance: settled.remainingBalance,
    };
  } finally {
    await preflight.ctx.release?.();
  }
}

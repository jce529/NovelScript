import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getMentionedNodesContent } from '@/lib/ai/mentions';
import {
  composeSystemInstruction, assembleUserContent, type PresetLevel, type StylePresetId, type ChatTurn, type DocumentProposal,
} from '@/lib/ai/prompt';
import type { ProviderId, ProviderClient } from '@/lib/ai/providers/types';
import type { ChatResult } from '@/lib/ai/chat-result';
import { preflightPaidGeneration, settlePaidGeneration } from '@/lib/ai/paid-generation';
import { runDocumentPlanningStrategy } from '@/lib/ai/document-plan';
import type { DecisionClient } from '@/lib/ai/decision/types';
import { parseChatResponse } from '@/lib/ai/chat-parse';
import type { ChatAttachment } from '@/lib/ai/attachments';

export { AI_GENERATION_REFERENCE_TYPE } from './paid-generation';
export { parseChatResponse, type ParsedChatResponse } from '@/lib/ai/chat-parse';
export type { ChatResult, DocumentProposal };

export function chatLedgerReason(input: { chapterId?: string; nodeId?: string }): string {
  return input.chapterId ? `chapter:${input.chapterId}` : `kb:${input.nodeId ?? 'unknown'}`;
}

export interface ChatInput {
  ownerId: string;
  workId: string;
  /** Exactly one of chapterId (회차 편집기) / nodeId (설정 문서 편집기) identifies where the chat runs. */
  chapterId?: string;
  nodeId?: string;
  /** What `precedingText` is: the chapter body (default) or the open 설정 문서. */
  contextKind?: 'chapter' | 'document';
  /** Files the writer attached to this conversation only — never persisted. */
  attachments?: ChatAttachment[];
  providerId: ProviderId;
  model: string;
  mentionedNodeIds: string[];
  presetLevel: PresetLevel;
  styleId: StylePresetId;
  /** D-07: active genre for this generation — resolved by the caller. */
  genre: string;
  precedingText: string;
  /** Full chat session so far, oldest first, INCLUDING the newest user
   * message as the last entry (caller appends it before calling). */
  chatHistory: ChatTurn[];
  /** D-01: one per writer send; validated as UUID by chatAction. Ledger reference_id. */
  idempotencyKey: string;
  /** Plan 15-04: supplied by chatAction only when planning is active. */
  planning?: { mode: 'active'; decisionClient: DecisionClient };
}

/**
 * This session's redesign of EDIT-04 + D-13: ONE chat, no separate
 * "생성하기" button. Every turn goes through this single function — the
 * wallet debit/cap lifecycle is unchanged (D-13), but the result now carries
 * `draft`/`proposal` instead of assuming every response is chapter prose.
 *
 * Wallet reads/writes use the ADMIN (service-role) client, not the session
 * `supabase` client passed in — see the Wallet RLS Gap note in Phase 04's
 * plans. `input.ownerId` must always come from the authenticated session
 * (never client-supplied) — the Server Action wrapper enforces that, not
 * this function.
 *
 * D-07 (07-03): generation is a user-initiated write. Write access is checked with the session
 * client BEFORE the wallet read and any provider call (no generation, no
 * charge for a suspended writer). A suspension can still land while the provider call is in
 * flight, so access is checked again with the service-role client immediately before the
 * wallet debit: if it is now refused, the completed output is discarded and nothing is charged.
 * A suspension committed after that second check is treated like any write that finished just
 * before the sanction.
 *
 * Phase 8 (COST-01, D-02/D-03): the debit uses reference_type 'ai_generation' and
 * reference_id = input.idempotencyKey, so the ledger unique constraint
 * (wallet_id, reference_type, reference_id) guarantees one debit per writer send. A key already
 * recorded for this wallet returns 'already_processed' before the cap and the provider call.
 * Ledger lookup failures fail closed. A debit error is followed by a scoped ledger re-read:
 * row present → 'already_processed'; absent → settlement failure with no body exposed.
 * Residual risk (accepted): two same-key requests that both pass the precheck before either
 * debits may both call the provider (D-03 only blocks recorded keys); the unique constraint
 * still guarantees a single debit. No process-local lock, no new table.
 *
 * D-05..D-08: a structured provider refusal is debited by provider-reported usage with the same
 * key and returned as 'refused' with normalized reason info only (no reply/draft/proposal).
 * D-10..D-12: provider failures map to rate_limited / unavailable / config, never charge, and
 * log only { provider, status, kind, idempotencyKey }.
 */
export async function chat(supabase: SupabaseClient, client: ProviderClient, input: ChatInput): Promise<ChatResult> {
  const id = { ownerId: input.ownerId, idempotencyKey: input.idempotencyKey, providerId: input.providerId, model: input.model };
  const pre = await preflightPaidGeneration(supabase, id);
  if (!pre.ok) return pre.chatResult;

  // BUG-06: settle releases the wallet lease; this also covers early exits before settle.
  try {
    const mentioned = await getMentionedNodesContent(supabase, { ownerId: input.ownerId, workId: input.workId, nodeIds: input.mentionedNodeIds });
    const mentionedDocs = [...mentioned, ...(input.attachments ?? []).map((file) => ({ category: '첨부 파일', name: file.name, content: file.content }))] as typeof mentioned;
    if (input.planning?.mode === 'active') {
      const strategy = await runDocumentPlanningStrategy({ supabase, providerClient: client, decisionClient: input.planning.decisionClient, ctx: pre.ctx, input, mentionedDocs });
      if (strategy.kind === 'result') return strategy.chatResult;
    }
    const systemInstruction = composeSystemInstruction({ presetLevel: input.presetLevel, styleId: input.styleId, genre: input.genre });
    const contents = assembleUserContent({ mentionedDocs, precedingText: input.precedingText, chatHistory: input.chatHistory, contextKind: input.contextKind });
    const settled = await settlePaidGeneration(client, pre.ctx, { ...id, ledgerReason: chatLedgerReason(input) },
      () => client.generateContent({ model: pre.ctx.model, systemInstruction, contents, maxOutputTokens: pre.ctx.maxOutputTokens, temperature: 0.9 }));
    if (settled.kind === 'terminal') return settled.chatResult;

    const { reply, draft, proposal } = parseChatResponse(settled.result.text);
    return {
      ok: true,
      status: 'completed',
      reply,
      draft,
      proposal,
      wasCapped: settled.result.finishReason === 'max_tokens',
      remainingBalance: settled.remainingBalance,
    };
  } finally {
    await pre.ctx.release?.();
  }
}

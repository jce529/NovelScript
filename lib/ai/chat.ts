import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMentionedNodesContent } from '@/lib/ai/mentions';
import {
  composeSystemInstruction, assembleUserContent, type PresetLevel, type StylePresetId, type ChatTurn, type DocumentProposal,
} from '@/lib/ai/prompt';
import { computeMaxOutputTokens, computeDebitAmount } from '@/lib/ai/cost';
import type { ModelTier, ProviderClient, GenerateResult } from '@/lib/ai/providers/types';
import { MODEL_TIER_TO_ID } from '@/lib/ai/providers/models';
import { ProviderCallError, toSanitizedProviderError, logProviderFailure } from '@/lib/ai/providers/errors';
import { CHAT_COPY, type ChatResult, type ChatFailureKind } from '@/lib/ai/chat-result';
import { KB_CATEGORIES, type KbCategory } from '@/lib/kb/categories';
import { checkWriteAccess } from '@/lib/auth/write-access';

export const AI_GENERATION_REFERENCE_TYPE = 'ai_generation';
export type { ChatResult, DocumentProposal };

export interface ParsedChatResponse {
  reply: string;
  draft: string | null;
  proposal: DocumentProposal | null;
}

/** Parses lib/ai/prompt.ts's RESPONSE_PROTOCOL_INSTRUCTIONS [REPLY]/[DRAFT]/
 * [DOCUMENT] format. Falls back to treating the whole response as the reply
 * (no draft, no proposal) if the model didn't follow the format, or drops a
 * DOCUMENT block missing a required field — a malformed block must never
 * silently insert garbage into 본문 or create a garbage KB document. */
export function parseChatResponse(raw: string): ParsedChatResponse {
  const replyMatch = raw.match(/\[REPLY\]([\s\S]*?)(?:\[\/REPLY\]|\[DRAFT\]|\[DOCUMENT\]|$)/);
  const reply = (replyMatch ? replyMatch[1] : raw).trim();

  const draftMatch = raw.match(/\[DRAFT\]([\s\S]*?)\[\/DRAFT\]/);
  const draft = draftMatch ? draftMatch[1].trim() || null : null;

  const docMatch = raw.match(/\[DOCUMENT\]([\s\S]*?)\[\/DOCUMENT\]/);
  let proposal: DocumentProposal | null = null;
  if (docMatch) {
    const block = docMatch[1];
    const category = block.match(/카테고리:\s*(.+)/)?.[1]?.trim();
    const name = block.match(/이름:\s*(.+)/)?.[1]?.trim();
    const content = block.match(/내용:\s*([\s\S]*)/)?.[1]?.trim();
    if (category && name && content && KB_CATEGORIES.includes(category as KbCategory)) {
      proposal = { category: category as KbCategory, name, content };
    }
  }

  return { reply, draft, proposal };
}

export interface ChatInput {
  ownerId: string;
  workId: string;
  chapterId: string;
  modelTier: ModelTier;
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
}

async function findGenerationEntry(admin: SupabaseClient, ownerId: string, key: string): Promise<'found' | 'absent' | 'error'> {
  try {
    const { data, error } = await admin.from('ledger_entries').select('id').eq('wallet_id', ownerId).eq('reference_type', AI_GENERATION_REFERENCE_TYPE).eq('reference_id', key).maybeSingle();
    if (error) return 'error';
    return data ? 'found' : 'absent';
  } catch {
    return 'error';
  }
}

async function readBalance(admin: SupabaseClient, ownerId: string): Promise<number | undefined> {
  try {
    const { data, error } = await admin.from('wallets').select('balance').eq('id', ownerId).maybeSingle();
    if (error || !data) return undefined;
    return Number(data.balance);
  } catch {
    return undefined;
  }
}

function failed(kind: ChatFailureKind, error: string, extra: Partial<ChatResult> = {}): ChatResult {
  return { ok: false, status: 'failed', failureKind: kind, error, ...extra };
}

async function alreadyProcessed(admin: SupabaseClient, ownerId: string): Promise<ChatResult> {
  const result: ChatResult = { ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle };
  const balance = await readBalance(admin, ownerId);
  if (balance !== undefined) result.remainingBalance = balance;
  return result;
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
  const ownerId = input.ownerId;
  const key = input.idempotencyKey;

  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return failed('write_denied', access.error, { code: access.code });

  const admin = createAdminClient();

  const pre = await findGenerationEntry(admin, ownerId, key);
  if (pre === 'error') return failed('unavailable', CHAT_COPY.unavailable);
  if (pre === 'found') return alreadyProcessed(admin, ownerId);

  const { data: wallet } = await admin.from('wallets').select('balance').eq('id', ownerId).maybeSingle();
  if (!wallet) return failed('unknown', CHAT_COPY.walletMissing);
  const walletBalance = Number(wallet.balance);

  const mentionedDocs = await getMentionedNodesContent(supabase, { ownerId, workId: input.workId, nodeIds: input.mentionedNodeIds });
  const systemInstruction = composeSystemInstruction({ presetLevel: input.presetLevel, styleId: input.styleId, genre: input.genre });
  const contents = assembleUserContent({ mentionedDocs, precedingText: input.precedingText, chatHistory: input.chatHistory });
  const model = MODEL_TIER_TO_ID[input.modelTier];

  // No input-token estimate: the output cap comes from the whole balance. Actual input+output
  // usage is debited after the call, clamped to the balance read above.
  const maxOutputTokens = computeMaxOutputTokens({ walletBalance, modelTier: input.modelTier });
  if (maxOutputTokens <= 0) {
    return failed('insufficient_balance', CHAT_COPY.insufficient_balance, { wasCapped: true, remainingBalance: walletBalance });
  }

  // Provider failures happen BEFORE any debit: never charged, no ledger row, so the same key
  // may be resent (D-04).
  let result: GenerateResult;
  try {
    result = await client.generateContent({ model, systemInstruction, contents, maxOutputTokens, temperature: 0.9 });
  } catch (err) {
    // D-11/D-12: only the sanitized allowlist crosses into logs/results — never the raw error,
    // the prompt, the contents or the system instruction.
    const info = err instanceof ProviderCallError ? err.info : toSanitizedProviderError(client.provider, err);
    logProviderFailure(info, input.idempotencyKey);
    return failed(info.kind, CHAT_COPY[info.kind]);
  }

  const stillAllowed = await checkWriteAccess(admin, ownerId);
  if (!stillAllowed.ok) return failed('write_denied', stillAllowed.error, { code: stillAllowed.code });

  // With no pre-call input estimate, actual usage can exceed the balance by a fraction of a
  // token; charge at most what the wallet held so the writer still gets the capped body (D-13).
  const debitAmount = Math.min(walletBalance, computeDebitAmount({
    modelTier: input.modelTier,
    promptTokenCount: result.usage.inputTokens,
    candidatesTokenCount: result.usage.outputTokens,
    thoughtsTokenCount: result.usage.thoughtsTokens,
  }));

  // Pre-debit recheck narrows the concurrent window so a racing duplicate gets no free body.
  const recheck = await findGenerationEntry(admin, ownerId, key);
  if (recheck === 'found') return alreadyProcessed(admin, ownerId);
  if (recheck === 'error') return failed('settlement', CHAT_COPY.settlement);

  let newBalance: unknown = null;
  let debitFailed = false;
  try {
    const { data, error } = await admin.rpc('apply_wallet_delta', {
      p_wallet_id: ownerId,
      p_delta: 0 - debitAmount,
      p_reference_type: AI_GENERATION_REFERENCE_TYPE,
      p_reference_id: input.idempotencyKey,
      p_reason: `chapter:${input.chapterId}`,
    });
    if (error) debitFailed = true;
    else newBalance = data;
  } catch {
    debitFailed = true;
  }

  if (debitFailed) {
    // Never log the DB error itself; never clamp the amount or retry with another key.
    console.error('[ai] wallet settlement failed', { provider: client.provider, stage: 'settlement', idempotencyKey: key });
    const post = await findGenerationEntry(admin, ownerId, key);
    if (post === 'found') return alreadyProcessed(admin, ownerId);
    return failed('settlement', CHAT_COPY.settlement);
  }

  // D-05..D-08: structured refusal — charged above like any completion (actual reported usage,
  // same key), but the body is never returned. Prose refusals are not detected (D-05 C).
  if (result.refusal) {
    return {
      ok: false, status: 'refused', error: CHAT_COPY.refusedTitle, remainingBalance: Number(newBalance),
      refusal: { stage: result.refusal.stage, reasonCode: result.refusal.reasonCode, debitAmount },
    };
  }

  const { reply, draft, proposal } = parseChatResponse(result.text);
  return {
    ok: true,
    status: 'completed',
    reply,
    draft,
    proposal,
    wasCapped: result.finishReason === 'max_tokens',
    remainingBalance: Number(newBalance),
  };
}

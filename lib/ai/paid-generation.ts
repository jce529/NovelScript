import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkWriteAccess } from '@/lib/auth/write-access';
import { computeDebitAmount, computeMaxOutputTokens } from '@/lib/ai/cost';
import { CHAT_COPY, type ChatFailureKind, type ChatResult } from '@/lib/ai/chat-result';
import { ProviderCallError, logProviderFailure, toSanitizedProviderError } from '@/lib/ai/providers/errors';
import { MODEL_TIER_TO_ID } from '@/lib/ai/providers/models';
import type { GenerateResult, ModelTier, ProviderClient } from '@/lib/ai/providers/types';

/**
 * Shared Phase 8 payment lifecycle for every paid Gemini generation.
 *
 * D-03/D-04: an existing ledger reference is checked before generation; a racing same-key
 * request is checked again immediately before debit, and the unique ledger key prevents a
 * second charge. Provider failures happen before debit and remain retryable with the same key.
 * D-05..D-08: structured refusals are charged from reported usage, then returned without body.
 * D-10..D-12: provider failures are sanitized through the shared allowlist before logging/result.
 * D-13: cap from the observed wallet, charge actual usage, and clamp debit to that balance.
 * Write access is checked before wallet reads and once more after generation before settlement.
 */export const AI_GENERATION_REFERENCE_TYPE = 'ai_generation';

export interface PaidGenerationContext {
  admin: SupabaseClient;
  walletBalance: number;
  model: string;
  maxOutputTokens: number;
}

export interface PaidGenerationIdentity {
  ownerId: string;
  idempotencyKey: string;
  modelTier: ModelTier;
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

export async function preflightPaidGeneration(
  supabase: SupabaseClient, id: PaidGenerationIdentity,
): Promise<{ ok: true; ctx: PaidGenerationContext } | { ok: false; chatResult: ChatResult }> {
  const access = await checkWriteAccess(supabase, id.ownerId);
  if (!access.ok) return { ok: false, chatResult: failed('write_denied', access.error, { code: access.code }) };

  const admin = createAdminClient();
  const pre = await findGenerationEntry(admin, id.ownerId, id.idempotencyKey);
  if (pre === 'error') return { ok: false, chatResult: failed('unavailable', CHAT_COPY.unavailable) };
  if (pre === 'found') return { ok: false, chatResult: await alreadyProcessed(admin, id.ownerId) };

  const balance = await readBalance(admin, id.ownerId);
  if (balance === undefined) return { ok: false, chatResult: failed('unknown', CHAT_COPY.walletMissing) };
  const maxOutputTokens = computeMaxOutputTokens({ walletBalance: balance, modelTier: id.modelTier });
  if (maxOutputTokens <= 0) {
    return { ok: false, chatResult: failed('insufficient_balance', CHAT_COPY.insufficient_balance, { wasCapped: true, remainingBalance: balance }) };
  }
  return { ok: true, ctx: { admin, walletBalance: balance, model: MODEL_TIER_TO_ID[id.modelTier], maxOutputTokens } };
}

export type SettleOutcome =
  | { kind: 'completed'; result: GenerateResult; debitAmount: number; remainingBalance: number }
  | { kind: 'terminal'; chatResult: ChatResult };

export async function settlePaidGeneration(
  client: ProviderClient,
  ctx: PaidGenerationContext,
  id: PaidGenerationIdentity & { ledgerReason: string },
  generate: () => Promise<GenerateResult>,
): Promise<SettleOutcome> {
  let result: GenerateResult;
  try {
    result = await generate();
  } catch (err) {
    const info = err instanceof ProviderCallError ? err.info : toSanitizedProviderError(client.provider, err);
    logProviderFailure(info, id.idempotencyKey);
    return { kind: 'terminal', chatResult: failed(info.kind, CHAT_COPY[info.kind]) };
  }

  const stillAllowed = await checkWriteAccess(ctx.admin, id.ownerId);
  if (!stillAllowed.ok) return { kind: 'terminal', chatResult: failed('write_denied', stillAllowed.error, { code: stillAllowed.code }) };

  const debitAmount = Math.min(ctx.walletBalance, computeDebitAmount({
    modelTier: id.modelTier,
    promptTokenCount: result.usage.inputTokens,
    candidatesTokenCount: result.usage.outputTokens,
    thoughtsTokenCount: result.usage.thoughtsTokens,
  }));
  const recheck = await findGenerationEntry(ctx.admin, id.ownerId, id.idempotencyKey);
  if (recheck === 'found') return { kind: 'terminal', chatResult: await alreadyProcessed(ctx.admin, id.ownerId) };
  if (recheck === 'error') return { kind: 'terminal', chatResult: failed('settlement', CHAT_COPY.settlement) };

  let newBalance: unknown = null;
  let debitFailed = false;
  try {
    const { data, error } = await ctx.admin.rpc('apply_wallet_delta', {
      p_wallet_id: id.ownerId,
      p_delta: 0 - debitAmount,
      p_reference_type: AI_GENERATION_REFERENCE_TYPE,
      p_reference_id: id.idempotencyKey,
      p_reason: id.ledgerReason,
    });
    if (error) debitFailed = true;
    else newBalance = data;
  } catch {
    debitFailed = true;
  }
  if (debitFailed) {
    console.error('[ai] wallet settlement failed', { provider: client.provider, stage: 'settlement', idempotencyKey: id.idempotencyKey });
    const post = await findGenerationEntry(ctx.admin, id.ownerId, id.idempotencyKey);
    if (post === 'found') return { kind: 'terminal', chatResult: await alreadyProcessed(ctx.admin, id.ownerId) };
    return { kind: 'terminal', chatResult: failed('settlement', CHAT_COPY.settlement) };
  }
  const remainingBalance = Number(newBalance);
  if (result.refusal) {
    return { kind: 'terminal', chatResult: {
      ok: false, status: 'refused', error: CHAT_COPY.refusedTitle, remainingBalance,
      refusal: { stage: result.refusal.stage, reasonCode: result.refusal.reasonCode, debitAmount },
    } };
  }
  return { kind: 'completed', result, debitAmount, remainingBalance };
}

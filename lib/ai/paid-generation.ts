import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkWriteAccess } from '@/lib/auth/write-access';
import { computeDebitAmount, computeMaxOutputTokens, type VendorPricing } from '@/lib/ai/cost';
import { CHAT_COPY, type ChatFailureKind, type ChatResult } from '@/lib/ai/chat-result';
import { GenerationRejectedError } from '@/lib/ai/generation-rejected';
import { ProviderCallError, logProviderFailure, toSanitizedProviderError } from '@/lib/ai/providers/errors';
import { MODEL_TIER_TO_ID } from '@/lib/ai/providers/models';
import { GEMINI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/gemini/cost';
import { OPENAI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/openai/cost';
import { ANTHROPIC_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/anthropic/cost';
import { PROVIDER_CALL_TIMEOUT_MS, type GenerateResult, type ModelTier, type ProviderClient, type ProviderId } from '@/lib/ai/providers/types';

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
 * BUG-06: one paid generation per wallet at a time. After the ledger pre-check, preflight takes a
 * per-wallet lease (migration 0021) before reading the balance; a second concurrent request gets
 * 'generation_in_progress' before any provider call. settle releases the lease on every outcome
 * and callers release in `finally` on early exits; `release` is idempotent. If a process dies the
 * lease expires after GENERATION_LEASE_TTL_SECONDS (> provider call cap + settle margin).
 * Residual risk: a provider request already sent when the lease expires may still bill.
 */
export const AI_GENERATION_REFERENCE_TYPE = 'ai_generation';
export const GENERATION_LEASE_TTL_SECONDS = Math.ceil(PROVIDER_CALL_TIMEOUT_MS / 1000) + 60;

export interface PaidGenerationContext {
  admin: SupabaseClient;
  walletBalance: number;
  model: string;
  pricing: VendorPricing;
  maxOutputTokens: number;
  /** Releases this request's wallet lease. Idempotent; absent for contexts built without a lease. */
  release?: () => Promise<void>;
}

export type PaidGenerationIdentity = {
  ownerId: string;
  idempotencyKey: string;
} & ({ providerId: ProviderId; model: string; modelTier?: never } | { modelTier: ModelTier; providerId?: never; model?: never });

function resolvePricing(providerId: ProviderId, model: string): VendorPricing {
  const table = providerId === 'openai' ? OPENAI_PRICING_USD_PER_MILLION
    : providerId === 'anthropic' ? ANTHROPIC_PRICING_USD_PER_MILLION
    : GEMINI_PRICING_USD_PER_MILLION;
  const pricing = table[model];
  if (!pricing) throw new Error('Unknown provider model');
  return pricing;
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

/** Atomic wallet lease. 'busy' = another live generation holds it; 'error' = could not tell (fail closed). */
async function acquireLease(admin: SupabaseClient, ownerId: string, token: string): Promise<'acquired' | 'busy' | 'error'> {
  try {
    const { data, error } = await admin.rpc('acquire_ai_generation_lock', {
      p_wallet_id: ownerId, p_owner_token: token, p_ttl_seconds: GENERATION_LEASE_TTL_SECONDS,
    });
    if (error || typeof data !== 'boolean') return 'error';
    return data ? 'acquired' : 'busy';
  } catch {
    return 'error';
  }
}

function leaseReleaser(admin: SupabaseClient, ownerId: string, token: string): () => Promise<void> {
  let done: Promise<void> | null = null;
  return () => {
    done ??= (async () => {
      try {
        const { error } = await admin.rpc('release_ai_generation_lock', { p_wallet_id: ownerId, p_owner_token: token });
        if (error) console.error('[ai] generation lease release failed', { stage: 'lease_release' });
      } catch {
        console.error('[ai] generation lease release failed', { stage: 'lease_release' });
      }
    })();
    return done;
  };
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

  const token = crypto.randomUUID();
  const lease = await acquireLease(admin, id.ownerId, token);
  if (lease === 'error') return { ok: false, chatResult: failed('unavailable', CHAT_COPY.unavailable) };
  if (lease === 'busy') return { ok: false, chatResult: failed('generation_in_progress', CHAT_COPY.generation_in_progress) };
  const release = leaseReleaser(admin, id.ownerId, token);

  try {
    const balance = await readBalance(admin, id.ownerId);
    if (balance === undefined) {
      await release();
      return { ok: false, chatResult: failed('unknown', CHAT_COPY.walletMissing) };
    }
    const model = id.model ?? MODEL_TIER_TO_ID[id.modelTier!];
    const pricing = resolvePricing(id.providerId ?? 'gemini', model);
    const maxOutputTokens = computeMaxOutputTokens({ walletBalance: balance, pricing });
    if (maxOutputTokens <= 0) {
      await release();
      return { ok: false, chatResult: failed('insufficient_balance', CHAT_COPY.insufficient_balance, { wasCapped: true, remainingBalance: balance }) };
    }
    return { ok: true, ctx: { admin, walletBalance: balance, model, pricing, maxOutputTokens, release } };
  } catch (err) {
    await release();
    throw err;
  }
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
  try {
    return await settleInner(client, ctx, id, generate);
  } finally {
    await ctx.release?.();
  }
}

async function settleInner(
  client: ProviderClient,
  ctx: PaidGenerationContext,
  id: PaidGenerationIdentity & { ledgerReason: string },
  generate: () => Promise<GenerateResult>,
): Promise<SettleOutcome> {
  let result: GenerateResult;
  try {
    result = await generate();
  } catch (err) {
    // BUG-06: 우리 검증이 응답을 거부 — 차감·원장 기록 없이 실패로 돌려 같은 키로 재시도할 수 있게 한다.
    if (err instanceof GenerationRejectedError) {
      console.warn('[ai] output rejected', { provider: client.provider, reason: err.reason, idempotencyKey: id.idempotencyKey });
      return { kind: 'terminal', chatResult: failed('rejected_output', err.userMessage) };
    }
    const info = err instanceof ProviderCallError ? err.info : toSanitizedProviderError(client.provider, err);
    logProviderFailure(info, id.idempotencyKey);
    return { kind: 'terminal', chatResult: failed(info.kind, CHAT_COPY[info.kind]) };
  }

  const stillAllowed = await checkWriteAccess(ctx.admin, id.ownerId);
  if (!stillAllowed.ok) return { kind: 'terminal', chatResult: failed('write_denied', stillAllowed.error, { code: stillAllowed.code }) };

  const debitAmount = Math.min(ctx.walletBalance, computeDebitAmount({
    pricing: ctx.pricing,
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

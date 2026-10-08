import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkWriteAccess } from '@/lib/auth/write-access';
import { BYOK_MAX_OUTPUT_TOKENS, computeDebitAmount, computeMaxOutputTokens, type VendorPricing } from '@/lib/ai/cost';
import { CHAT_COPY, type ChatFailureKind, type ChatResult } from '@/lib/ai/chat-result';
import { GenerationRejectedError } from '@/lib/ai/generation-rejected';
import { ProviderCallError, logProviderFailure, toSanitizedProviderError } from '@/lib/ai/providers/errors';
import { markByokFailed, type GenerationRoute } from '@/lib/ai/providers/byok';
import { MODEL_TIER_TO_ID } from '@/lib/ai/providers/models';
import { GEMINI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/gemini/cost';
import { OPENAI_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/openai/cost';
import { ANTHROPIC_PRICING_USD_PER_MILLION } from '@/lib/ai/providers/anthropic/cost';
import { recordAiUsage } from '@/lib/ai/usage';
import { PROVIDER_CALL_TIMEOUT_MS, type GenerateResult, type ModelTier, type ProviderClient, type ProviderId } from '@/lib/ai/providers/types';

export const AI_GENERATION_REFERENCE_TYPE = 'ai_generation';
export const GENERATION_LEASE_TTL_SECONDS = Math.ceil(PROVIDER_CALL_TIMEOUT_MS / 1000) + 60;

type RouteIdentity = { providerId: ProviderId; model: string };
export interface ServicePaidGenerationContext {
  route: { keySource: 'service' } & RouteIdentity;
  admin: SupabaseClient;
  walletBalance: number;
  model: string;
  pricing: VendorPricing;
  maxOutputTokens: number;
  release?: () => Promise<void>;
}
export interface ByokPaidGenerationContext {
  route: { keySource: 'byok'; trusted: Extract<GenerationRoute, { kind: 'byok' }> };
  admin: SupabaseClient;
  maxOutputTokens: typeof BYOK_MAX_OUTPUT_TOKENS;
}
/** Existing service-only consumers can continue to rely on wallet settlement fields. */
export type PaidGenerationContext = ServicePaidGenerationContext;
export type AnyPaidGenerationContext = ServicePaidGenerationContext | ByokPaidGenerationContext;

export type PaidGenerationIdentity = {
  ownerId: string;
  idempotencyKey: string;
  workId?: string | null;
  chapterId?: string | null;
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
  } catch { return 'error'; }
}

async function readBalance(admin: SupabaseClient, ownerId: string): Promise<number | undefined> {
  try {
    const { data, error } = await admin.from('wallets').select('balance').eq('id', ownerId).maybeSingle();
    if (error || !data) return undefined;
    return Number(data.balance);
  } catch { return undefined; }
}

async function acquireLease(admin: SupabaseClient, ownerId: string, token: string): Promise<'acquired' | 'busy' | 'error'> {
  try {
    const { data, error } = await admin.rpc('acquire_ai_generation_lock', {
      p_wallet_id: ownerId, p_owner_token: token, p_ttl_seconds: GENERATION_LEASE_TTL_SECONDS,
    });
    if (error || typeof data !== 'boolean') return 'error';
    return data ? 'acquired' : 'busy';
  } catch { return 'error'; }
}

function leaseReleaser(admin: SupabaseClient, ownerId: string, token: string): () => Promise<void> {
  let done: Promise<void> | null = null;
  return () => {
    done ??= (async () => {
      try {
        const { error } = await admin.rpc('release_ai_generation_lock', { p_wallet_id: ownerId, p_owner_token: token });
        if (error) console.error('[ai] generation lease release failed', { stage: 'lease_release' });
      } catch { console.error('[ai] generation lease release failed', { stage: 'lease_release' }); }
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

type PreflightFailure = { ok: false; chatResult: ChatResult; replacement?: Extract<GenerationRoute, { kind: 'replacement_required' }>['replacement'] };
type ServicePreflight = { ok: true; ctx: ServicePaidGenerationContext } | PreflightFailure;
type RoutedPreflight = { ok: true; ctx: AnyPaidGenerationContext } | PreflightFailure;

export function preflightPaidGeneration(supabase: SupabaseClient, id: PaidGenerationIdentity): Promise<ServicePreflight>;
export function preflightPaidGeneration(supabase: SupabaseClient, id: PaidGenerationIdentity, route: GenerationRoute): Promise<RoutedPreflight>;
export async function preflightPaidGeneration(
  supabase: SupabaseClient, id: PaidGenerationIdentity, route?: GenerationRoute,
): Promise<ServicePreflight | RoutedPreflight> {
  const access = await checkWriteAccess(supabase, id.ownerId);
  if (!access.ok) return { ok: false, chatResult: failed('write_denied', access.error, { code: access.code }) };

  const admin = createAdminClient();
  if (route?.kind === 'replacement_required') {
    return { ok: false, chatResult: { ok: false, status: 'failed', failureKind: 'unavailable', error: CHAT_COPY.byokPending }, replacement: route.replacement };
  }
  if (route?.kind === 'byok') {
    return { ok: true, ctx: { route: { keySource: 'byok', trusted: route }, admin, maxOutputTokens: BYOK_MAX_OUTPUT_TOKENS } };
  }

  const serviceSelection = route?.kind === 'service' ? route.selection : undefined;
  const model = serviceSelection?.model ?? id.model ?? MODEL_TIER_TO_ID[id.modelTier!];
  const providerId = serviceSelection?.providerId ?? id.providerId ?? 'gemini';
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
    const pricing = resolvePricing(providerId, model);
    const maxOutputTokens = computeMaxOutputTokens({ walletBalance: balance, pricing });
    if (maxOutputTokens <= 0) {
      await release();
      return { ok: false, chatResult: failed('insufficient_balance', CHAT_COPY.insufficient_balance, { wasCapped: true, remainingBalance: balance }) };
    }
    return { ok: true, ctx: { route: { keySource: 'service', providerId, model }, admin, walletBalance: balance, model, pricing, maxOutputTokens, release } };
  } catch (err) {
    await release();
    throw err;
  }
}

export type SettleOutcome =
  | { kind: 'completed'; result: GenerateResult; debitAmount: number; remainingBalance: number }
  | { kind: 'terminal'; chatResult: ChatResult };
export type ByokSettleOutcome =
  | { kind: 'completed'; result: GenerateResult }
  | { kind: 'terminal'; chatResult: ChatResult };

export function settlePaidGeneration(client: ProviderClient, ctx: ServicePaidGenerationContext, id: PaidGenerationIdentity & { ledgerReason: string }, generate: () => Promise<GenerateResult>): Promise<SettleOutcome>;
export function settlePaidGeneration(client: ProviderClient, ctx: ByokPaidGenerationContext, id: PaidGenerationIdentity & { ledgerReason: string }, generate: () => Promise<GenerateResult>): Promise<ByokSettleOutcome>;
export function settlePaidGeneration(client: ProviderClient, ctx: AnyPaidGenerationContext, id: PaidGenerationIdentity & { ledgerReason: string }, generate: () => Promise<GenerateResult>): Promise<SettleOutcome | ByokSettleOutcome>;
export async function settlePaidGeneration(
  client: ProviderClient, ctx: AnyPaidGenerationContext, id: PaidGenerationIdentity & { ledgerReason: string }, generate: () => Promise<GenerateResult>,
): Promise<SettleOutcome | ByokSettleOutcome> {
  try { return await settleInner(client, ctx, id, generate); }
  finally { if ('release' in ctx) await ctx.release?.(); }
}

async function recordUsageBestEffort(client: ProviderClient, ctx: AnyPaidGenerationContext, id: PaidGenerationIdentity, result: GenerateResult): Promise<void> {
  try {
    await recordAiUsage(ctx.admin, {
      ownerId: id.ownerId,
      provider: client.provider,
      model: ctx.route.keySource === 'service' ? ctx.route.model : ctx.route.trusted.selection.model,
      keySource: ctx.route.keySource,
      status: result.refusal ? 'refused' : 'completed',
      idempotencyKey: id.idempotencyKey,
      usage: result.usage,
      workId: id.workId,
      chapterId: id.chapterId,
    });
  } catch {
    console.error('[ai] usage write failed', { stage: 'insert', provider: client.provider, idempotencyKey: id.idempotencyKey });
  }
}

async function settleInner(
  client: ProviderClient, ctx: AnyPaidGenerationContext, id: PaidGenerationIdentity & { ledgerReason: string }, generate: () => Promise<GenerateResult>,
): Promise<SettleOutcome | ByokSettleOutcome> {
  let result: GenerateResult;
  try { result = await generate(); }
  catch (err) {
    if (err instanceof GenerationRejectedError) {
      console.warn('[ai] output rejected', { provider: client.provider, reason: err.reason, idempotencyKey: id.idempotencyKey });
      return { kind: 'terminal', chatResult: failed('rejected_output', err.userMessage) };
    }
    const info = err instanceof ProviderCallError ? err.info : toSanitizedProviderError(client.provider, err, { keySource: ctx.route.keySource });
    logProviderFailure(info, id.idempotencyKey);
    if (ctx.route.keySource === 'byok' && info.kind === 'invalid_key') {
      try { await markByokFailed(ctx.admin as unknown as Parameters<typeof markByokFailed>[0], { ownerId: id.ownerId, providerId: client.provider, expectedKeyId: ctx.route.trusted.keyId }); }
      catch { console.error('[ai] BYOK status update failed', { stage: 'status_update', provider: client.provider, idempotencyKey: id.idempotencyKey }); }
    }
    const failureKind = info.kind;
    return { kind: 'terminal', chatResult: failed(failureKind, CHAT_COPY[failureKind]) };
  }

  await recordUsageBestEffort(client, ctx, id, result);
  if (ctx.route.keySource === 'byok') {
    if (result.refusal) return { kind: 'terminal', chatResult: { ok: false, status: 'refused', error: CHAT_COPY.refusedTitle } };
    return { kind: 'completed', result };
  }

  const serviceCtx = ctx as ServicePaidGenerationContext;
  const stillAllowed = await checkWriteAccess(serviceCtx.admin, id.ownerId);
  if (!stillAllowed.ok) return { kind: 'terminal', chatResult: failed('write_denied', stillAllowed.error, { code: stillAllowed.code }) };
  const debitAmount = Math.min(serviceCtx.walletBalance, computeDebitAmount({
    pricing: serviceCtx.pricing, promptTokenCount: result.usage.inputTokens,
    candidatesTokenCount: result.usage.outputTokens, thoughtsTokenCount: result.usage.thoughtsTokens,
  }));
  const recheck = await findGenerationEntry(serviceCtx.admin, id.ownerId, id.idempotencyKey);
  if (recheck === 'found') return { kind: 'terminal', chatResult: await alreadyProcessed(serviceCtx.admin, id.ownerId) };
  if (recheck === 'error') return { kind: 'terminal', chatResult: failed('settlement', CHAT_COPY.settlement) };
  let newBalance: unknown = null;
  let debitFailed = false;
  try {
    const { data, error } = await serviceCtx.admin.rpc('apply_wallet_delta', {
      p_wallet_id: id.ownerId, p_delta: 0 - debitAmount, p_reference_type: AI_GENERATION_REFERENCE_TYPE,
      p_reference_id: id.idempotencyKey, p_reason: id.ledgerReason,
    });
    if (error) debitFailed = true; else newBalance = data;
  } catch { debitFailed = true; }
  if (debitFailed) {
    console.error('[ai] wallet settlement failed', { provider: client.provider, stage: 'settlement', idempotencyKey: id.idempotencyKey });
    const post = await findGenerationEntry(serviceCtx.admin, id.ownerId, id.idempotencyKey);
    if (post === 'found') return { kind: 'terminal', chatResult: await alreadyProcessed(serviceCtx.admin, id.ownerId) };
    return { kind: 'terminal', chatResult: failed('settlement', CHAT_COPY.settlement) };
  }
  const remainingBalance = Number(newBalance);
  if (result.refusal) return { kind: 'terminal', chatResult: {
    ok: false, status: 'refused', error: CHAT_COPY.refusedTitle, remainingBalance,
    refusal: { stage: result.refusal.stage, reasonCode: result.refusal.reasonCode, debitAmount },
  } };
  return { kind: 'completed', result, debitAmount, remainingBalance };
}

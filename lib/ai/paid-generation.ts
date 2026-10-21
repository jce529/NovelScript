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

export const SERVICE_SETTLEMENT_RPC = 'settle_service_ai_generation';

/**
 * COST-02 reopen (11-09/11-10): has this owner's logical key already been consumed?
 *
 * Source of truth is ai_usage unique(owner_id, idempotency_key):
 * - a service row counts only when service_settled_at is set (written in the same transaction
 *   as the debit by settle_service_ai_generation). A row with NULL is unconfirmed telemetry.
 * - a BYOK row means the key was already consumed by a BYOK generation.
 * When there is no row, or only an unsettled service row, the legacy ai_generation ledger row
 * (including historical delta-0 rows) is consulted for migration compatibility. New zero-cost
 * completions never create ledger rows. Lookup errors are never downgraded to 'absent'.
 */
async function findCompletedGeneration(admin: SupabaseClient, ownerId: string, key: string): Promise<'found' | 'absent' | 'error'> {
  try {
    const { data, error } = await admin.from('ai_usage').select('key_source, service_settled_at').eq('owner_id', ownerId).eq('idempotency_key', key).maybeSingle();
    if (error) return 'error';
    if (data && (data.key_source === 'byok' || data.service_settled_at != null)) return 'found';
  } catch { return 'error'; }
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
  const pre = await findCompletedGeneration(admin, id.ownerId, id.idempotencyKey);
  if (pre === 'error') return { ok: false, chatResult: failed('unavailable', CHAT_COPY.unavailable) };
  if (pre === 'found') return { ok: false, chatResult: await alreadyProcessed(admin, id.ownerId) };
  const token = crypto.randomUUID();
  const lease = await acquireLease(admin, id.ownerId, token);
  if (lease === 'error') return { ok: false, chatResult: failed('unavailable', CHAT_COPY.unavailable) };
  if (lease === 'busy') return { ok: false, chatResult: failed('generation_in_progress', CHAT_COPY.generation_in_progress) };
  const release = leaseReleaser(admin, id.ownerId, token);
  try {
    // A same-key request may have completed and released the lease between the first lookup
    // and our acquire: re-check under the lease so the provider is never called twice.
    const underLease = await findCompletedGeneration(admin, id.ownerId, id.idempotencyKey);
    if (underLease !== 'absent') {
      await release();
      return { ok: false, chatResult: underLease === 'found' ? await alreadyProcessed(admin, id.ownerId) : failed('unavailable', CHAT_COPY.unavailable) };
    }
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

  if (ctx.route.keySource === 'byok') {
    // BYOK: best-effort observation only (D-12); never wallet, lease or settlement.
    await recordUsageBestEffort(client, ctx, id, result);
    if (result.refusal) return { kind: 'terminal', chatResult: { ok: false, status: 'refused', error: CHAT_COPY.refusedTitle } };
    return { kind: 'completed', result };
  }

  const serviceCtx = ctx as ServicePaidGenerationContext;
  const stillAllowed = await checkWriteAccess(serviceCtx.admin, id.ownerId);
  if (!stillAllowed.ok) {
    // The body is discarded. Observation may remain as unconfirmed telemetry
    // (service_settled_at NULL), which is never treated as a completion.
    await recordUsageBestEffort(client, ctx, id, result);
    return { kind: 'terminal', chatResult: failed('write_denied', stillAllowed.error, { code: stillAllowed.code }) };
  }
  const reported = result.usage.reported.input || result.usage.reported.output;
  if (result.refusal && !reported) {
    // D-12: an unreported refusal has nothing to charge or record; leaving no marker keeps the
    // same key manually retryable.
    const balance = await readBalance(serviceCtx.admin, id.ownerId);
    return { kind: 'terminal', chatResult: {
      ok: false, status: 'refused', error: CHAT_COPY.refusedTitle,
      ...(balance !== undefined ? { remainingBalance: balance } : {}),
      refusal: { stage: result.refusal.stage, reasonCode: result.refusal.reasonCode, debitAmount: 0 },
    } };
  }
  const debitAmount = Math.min(serviceCtx.walletBalance, computeDebitAmount({
    pricing: serviceCtx.pricing, promptTokenCount: result.usage.inputTokens,
    candidatesTokenCount: result.usage.outputTokens, thoughtsTokenCount: result.usage.thoughtsTokens,
  }));

  // COST-02 reopen vs D-12: BYOK usage and auxiliary telemetry are best-effort and never block a
  // call. The service completion marker is different: it is part of settlement because it is what
  // makes a resend safe. So usage + positive debit + service_settled_at are committed together by
  // one RPC, and a failure to store them is a settlement failure (no body is returned without a
  // marker, even at zero cost). No automatic RPC retry.
  const settlement = await callServiceSettlement(serviceCtx.admin, {
    p_owner_id: id.ownerId,
    p_idempotency_key: id.idempotencyKey,
    p_debit_amount: debitAmount,
    p_ledger_reason: id.ledgerReason,
    p_usage: {
      provider: client.provider,
      model: serviceCtx.route.model,
      status: result.refusal ? 'refused' : 'completed',
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      thoughts_tokens: result.usage.thoughtsTokens ?? 0,
      input_reported: result.usage.reported.input,
      output_reported: result.usage.reported.output,
      work_id: id.workId ?? null,
      chapter_id: id.chapterId ?? null,
    },
  });

  if (settlement.kind === 'already_processed') {
    const chatResult: ChatResult = { ok: false, status: 'already_processed', error: CHAT_COPY.processedTitle, remainingBalance: settlement.remainingBalance };
    return { kind: 'terminal', chatResult };
  }
  if (settlement.kind === 'failed') {
    console.error('[ai] wallet settlement failed', { provider: client.provider, stage: 'settlement', idempotencyKey: id.idempotencyKey });
    // The commit may have happened with the response lost: re-read the completion marker.
    const post = await findCompletedGeneration(serviceCtx.admin, id.ownerId, id.idempotencyKey);
    if (post === 'found') return { kind: 'terminal', chatResult: await alreadyProcessed(serviceCtx.admin, id.ownerId) };
    return { kind: 'terminal', chatResult: failed('settlement', CHAT_COPY.settlement) };
  }
  const remainingBalance = settlement.remainingBalance;
  if (result.refusal) return { kind: 'terminal', chatResult: {
    ok: false, status: 'refused', error: CHAT_COPY.refusedTitle, remainingBalance,
    refusal: { stage: result.refusal.stage, reasonCode: result.refusal.reasonCode, debitAmount },
  } };
  return { kind: 'completed', result, debitAmount, remainingBalance };
}

type ServiceSettlementResult =
  | { kind: 'settled'; remainingBalance: number }
  | { kind: 'already_processed'; remainingBalance: number }
  | { kind: 'failed' };

async function callServiceSettlement(admin: SupabaseClient, args: Record<string, unknown>): Promise<ServiceSettlementResult> {
  try {
    const { data, error } = await admin.rpc(SERVICE_SETTLEMENT_RPC, args);
    if (error || !data || typeof data !== 'object') return { kind: 'failed' };
    const payload = data as { kind?: unknown; remainingBalance?: unknown };
    const remainingBalance = Number(payload.remainingBalance);
    if (payload.remainingBalance == null || !Number.isFinite(remainingBalance)) return { kind: 'failed' };
    if (payload.kind === 'settled') return { kind: 'settled', remainingBalance };
    if (payload.kind === 'already_processed') return { kind: 'already_processed', remainingBalance };
    return { kind: 'failed' };
  } catch { return { kind: 'failed' }; }
}

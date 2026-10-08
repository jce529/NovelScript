import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultModelFor, isKnownModel, PROVIDER_MODELS } from './catalog';
import { BYOK_COPY, PROVIDER_LABEL, byokFailureMessage } from './byok-copy';
import { checkKeyFormat, validateByokKey } from './byok-validate';
import { intersectWithCatalog } from './selection';
import type { ProviderId } from './types';
import { getDefaultProviderModel } from './settings';
import type { Selection } from './selection';
import { createPlatformProvider, createProviderWithApiKey } from './registry';
import type { ProviderClient } from './types';

type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string } | null }> };
export interface ByokKeyMeta { id: string; provider: ProviderId; maskedHint: string; status: 'connected' | 'failed'; modelIds: string[]; createdAt: string; verifiedAt: string | null }
export type ByokActionResult = { ok: true; message: string; modelCount?: number } | { ok: false; reason: string; message?: string };
const internal = (): ByokActionResult => ({ ok: false, reason: 'internal', message: BYOK_COPY.internalError });
const ownerArgs = (ownerId: string, providerId?: ProviderId) => ({ p_owner: ownerId, ...(providerId ? { p_provider: providerId } : {}) });
function validProvider(value: unknown): value is ProviderId { return value === 'openai' || value === 'anthropic' || value === 'gemini'; }

export type GenerationRoute =
  | { kind: 'service'; selection: Selection; client: ProviderClient }
  | { kind: 'byok'; selection: Selection; keyId: string; client: ProviderClient }
  | { kind: 'replacement_required'; replacement: Selection };

type GenerationRouteDeps = {
  supabase: Pick<SupabaseClient, 'from'>;
  admin: RpcClient;
  ownerId: string;
  selection: Selection;
  env?: Record<string, string | undefined>;
};

type GenerationKeyRow = { id: string; provider: unknown; status: unknown; model_ids: unknown };

async function findGenerationKey(supabase: Pick<SupabaseClient, 'from'>, ownerId: string, providerId: ProviderId): Promise<GenerationKeyRow | null> {
  try {
    const { data, error } = await supabase.from('byok_keys').select('id, provider, status, model_ids').eq('owner_id', ownerId).eq('provider', providerId).maybeSingle();
    if (error || !data || typeof data.id !== 'string' || !validProvider(data.provider) || typeof data.status !== 'string' || !Array.isArray(data.model_ids)) return null;
    return data as GenerationKeyRow;
  } catch { return null; }
}

function replacementFor(selection: Selection): Selection {
  return isKnownModel(selection.providerId, selection.model)
    ? { ...selection, keySource: 'service' }
    : { providerId: 'gemini', model: defaultModelFor('gemini'), keySource: 'service' };
}

/** Re-derive key ownership, status, and model access for each generation request. */
export async function resolveGenerationRoute(deps: GenerationRouteDeps): Promise<GenerationRoute> {
  const { ownerId, selection } = deps;
  if (selection.keySource === 'service') {
    return { kind: 'service', selection, client: createPlatformProvider(selection.providerId, deps.env ?? process.env) };
  }

  const key = await findGenerationKey(deps.supabase, ownerId, selection.providerId);
  if (!key || key.status !== 'connected' || key.provider !== selection.providerId || !isKnownModel(selection.providerId, selection.model) || !Array.isArray(key.model_ids) || !key.model_ids.includes(selection.model)) {
    return { kind: 'replacement_required', replacement: replacementFor(selection) };
  }

  const secret = await getByokSecret(deps.admin, ownerId, selection.providerId);
  if (!secret) return { kind: 'replacement_required', replacement: replacementFor(selection) };

  // The secret RPC is provider-scoped. Recheck the key id after decryption so a
  // delete/re-register race never sends the newly registered key for stale intent.
  const current = await findGenerationKey(deps.supabase, ownerId, selection.providerId);
  if (!current || current.id !== key.id || current.status !== 'connected' || !Array.isArray(current.model_ids) || !current.model_ids.includes(selection.model)) {
    return { kind: 'replacement_required', replacement: replacementFor(selection) };
  }

  return { kind: 'byok', selection, keyId: key.id, client: createProviderWithApiKey(selection.providerId, secret, { keySource: 'byok' }) };
}

/** Conditional transition; a false result means the request observed a stale key id. */
export async function markByokFailed(admin: RpcClient, input: { ownerId: string; providerId: ProviderId; expectedKeyId: string }): Promise<boolean> {
  try {
    const { data, error } = await admin.rpc('mark_byok_failed', {
      p_owner: input.ownerId, p_provider: input.providerId, p_expected_key_id: input.expectedKeyId,
    });
    return !error && data === true;
  } catch { return false; }
}

export async function listByokKeys(supabase: SupabaseClient, ownerId: string): Promise<ByokKeyMeta[]> {
  try {
    const { data, error } = await supabase.from('byok_keys').select('id, provider, masked_hint, status, model_ids, created_at, verified_at').eq('owner_id', ownerId).order('created_at', { ascending: true });
    if (error || !Array.isArray(data)) return [];
    const result: ByokKeyMeta[] = [];
    for (const row of data) {
      if (!row || !validProvider(row.provider) || !['connected', 'failed'].includes(row.status) || typeof row.id !== 'string' || typeof row.masked_hint !== 'string' || !Array.isArray(row.model_ids) || !row.model_ids.every((id: unknown) => typeof id === 'string') || typeof row.created_at !== 'string' || (row.verified_at !== null && typeof row.verified_at !== 'string')) return [];
      result.push({ id: row.id, provider: row.provider, maskedHint: row.masked_hint, status: row.status, modelIds: intersectWithCatalog(row.provider, row.model_ids), createdAt: row.created_at, verifiedAt: row.verified_at });
    }
    return result;
  } catch { return []; }
}

export async function registerByokKey(deps: { supabase: SupabaseClient; admin: RpcClient }, ownerId: string, providerId: ProviderId, plaintext: string): Promise<ByokActionResult> {
  try {
    const claim = await deps.admin.rpc('claim_byok_validation', { p_owner: ownerId, p_limit: 5, p_window_seconds: 600 });
    if (claim.error) return internal();
    if (claim.data !== true) return { ok: false, reason: 'throttled', message: BYOK_COPY.internalError };
    const checked = checkKeyFormat(plaintext);
    if (!checked.ok) return { ok: false, reason: 'format', message: byokFailureMessage('format', PROVIDER_LABEL[providerId]) };
    const validation = await validateByokKey(providerId, checked.key);
    if (!validation.ok) return { ok: false, reason: validation.reason, message: byokFailureMessage(validation.reason, PROVIDER_LABEL[providerId]) };
    const models = intersectWithCatalog(providerId, validation.modelIds);
    const saved = await deps.admin.rpc('register_byok_key', { ...ownerArgs(ownerId, providerId), p_plaintext: checked.key, p_hint: checked.key.slice(-4), p_models: models });
    if (saved.error) return saved.error.code === '23505' ? { ok: false, reason: 'already_registered' } : internal();
    return { ok: true, modelCount: models.length, message: BYOK_COPY.registrationSuccess(PROVIDER_LABEL[providerId], models.length) };
  } catch { return internal(); }
}

export async function getByokSecret(admin: RpcClient, ownerId: string, providerId: ProviderId, options: { includeFailed?: boolean } = {}): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc('get_byok_secret', { ...ownerArgs(ownerId, providerId), p_include_failed: options.includeFailed ?? false });
    return error || typeof data !== 'string' ? null : data;
  } catch { return null; }
}

export async function recheckByokKey(deps: { supabase: SupabaseClient; admin: RpcClient }, ownerId: string, providerId: ProviderId): Promise<ByokActionResult> {
  try {
    const claim = await deps.admin.rpc('claim_byok_validation', { p_owner: ownerId, p_limit: 5, p_window_seconds: 600 });
    if (claim.error) return internal();
    if (claim.data !== true) return { ok: false, reason: 'throttled', message: BYOK_COPY.internalError };
    const secret = await getByokSecret(deps.admin, ownerId, providerId, { includeFailed: true });
    if (!secret) return internal();
    const validation = await validateByokKey(providerId, secret);
    if (validation.ok) {
      const models = intersectWithCatalog(providerId, validation.modelIds);
      const { error } = await deps.admin.rpc('set_byok_status', { ...ownerArgs(ownerId, providerId), p_status: 'connected', p_models: models });
      if (error) return internal();
      return { ok: true, modelCount: models.length, message: BYOK_COPY.recheckSuccess(PROVIDER_LABEL[providerId], models.length) };
    }
    if (validation.reason === 'invalid' || validation.reason === 'forbidden') {
      const { data, error } = await deps.supabase.from('byok_keys').select('model_ids').eq('owner_id', ownerId).eq('provider', providerId).maybeSingle();
      if (error || !Array.isArray(data?.model_ids) || !data.model_ids.every((id: unknown) => typeof id === 'string')) return internal();
      const updated = await deps.admin.rpc('set_byok_status', { ...ownerArgs(ownerId, providerId), p_status: 'failed', p_models: data.model_ids });
      if (updated.error) return internal();
    }
    return { ok: false, reason: validation.reason, message: byokFailureMessage(validation.reason, PROVIDER_LABEL[providerId]) };
  } catch { return internal(); }
}

export async function deleteByokKey(deps: { supabase: SupabaseClient; admin: RpcClient }, ownerId: string, providerId: ProviderId): Promise<ByokActionResult> {
  try {
    const { data, error } = await deps.admin.rpc('delete_byok_key', ownerArgs(ownerId, providerId));
    if (error || typeof data !== 'boolean') return internal();
    const message = BYOK_COPY.deleteSuccess(PROVIDER_LABEL[providerId]);
    if (!data) return { ok: true, message };
    const next = await getDefaultProviderModel(deps.supabase, ownerId, { [providerId]: PROVIDER_MODELS[providerId].map(({ id }) => id) });
    const modelName = PROVIDER_MODELS[next.providerId].find(({ id }) => id === next.model)?.displayName ?? next.model;
    return { ok: true, message: `${message} ${BYOK_COPY.deleteReplacement(modelName)}` };
  } catch { return internal(); }
}

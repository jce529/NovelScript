import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PROVIDER_MODELS } from './catalog';
import { BYOK_COPY, PROVIDER_LABEL, byokFailureMessage } from './byok-copy';
import { checkKeyFormat, validateByokKey, type ByokFailureReason } from './byok-validate';
import { intersectWithCatalog } from './selection';
import type { ProviderId } from './types';
import { getDefaultProviderModel } from './settings';

type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> };
export interface ByokKeyMeta { id: string; provider: ProviderId; maskedHint: string; status: 'connected' | 'failed'; modelIds: string[]; createdAt: string; verifiedAt: string | null }
export type ByokActionResult = { ok: true; message: string; modelCount?: number } | { ok: false; reason: string; message?: string };
const internal = (): ByokActionResult => ({ ok: false, reason: 'internal', message: BYOK_COPY.internalError });
const ownerArgs = (ownerId: string, providerId?: ProviderId) => ({ p_owner: ownerId, ...(providerId ? { p_provider: providerId } : {}) });
function validProvider(value: unknown): value is ProviderId { return value === 'openai' || value === 'anthropic' || value === 'gemini'; }

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

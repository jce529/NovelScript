import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultModelFor, isKnownModel, PROVIDER_MODELS } from './catalog';
import { loadConnectedByokModels } from './byok-models';
import type { ByokModelMap, Selection } from './selection';
import type { ProviderId } from './types';

export type ProviderModelPair = Selection;
const FALLBACK: ProviderModelPair = { providerId: 'gemini', model: defaultModelFor('gemini'), keySource: 'service' };
function isProvider(value: string): value is ProviderId { return Object.hasOwn(PROVIDER_MODELS, value); }
function isValidPair(providerId: string, model: string): providerId is ProviderId { return isProvider(providerId) && isKnownModel(providerId, model); }

export type DefaultFallbackReason = 'not_set' | 'model_retired' | 'byok_key_missing' | 'byok_model_unavailable';
export type DefaultFallback = {
  reason: DefaultFallbackReason;
  /** 작가가 원래 설정한 기본값. 미설정이면 null. */
  original: ProviderModelPair | null;
  /** 대체 후보. 반환된 selection과 같다. */
  suggested: ProviderModelPair;
  /** 비용 주체가 BYOK → 서비스 키로 바뀌므로 작가의 명시 동의 전에는 호출하면 안 된다. */
  requiresConsent: boolean;
};
export type ResolvedDefault = { selection: ProviderModelPair; fallback?: DefaultFallback };

/** 대체가 일어났다면 이유와 함께 알려 주는 해석기. UI 안내·동의 창(BUG-02)이 이 값을 쓴다. */
export async function resolveDefaultProviderModel(supabase: SupabaseClient, ownerId: string, byokModels?: ByokModelMap): Promise<ResolvedDefault> {
  const { data } = await supabase.from('profiles').select('default_provider, default_model, default_key_source').eq('id', ownerId).maybeSingle();
  if (!data?.default_provider || !data?.default_model) return { selection: FALLBACK, fallback: { reason: 'not_set', original: null, suggested: FALLBACK, requiresConsent: false } };
  if (!isValidPair(data.default_provider, data.default_model)) {
    return { selection: FALLBACK, fallback: { reason: 'model_retired', original: null, suggested: FALLBACK, requiresConsent: false } };
  }
  const keySource = data.default_key_source === 'byok' ? 'byok' : 'service';
  const original: ProviderModelPair = { providerId: data.default_provider, model: data.default_model, keySource };
  if (keySource === 'service') return { selection: original };
  const connected = byokModels ?? await loadConnectedByokModels(supabase, ownerId);
  const models = connected[data.default_provider];
  if (models?.includes(data.default_model)) return { selection: original };
  const suggested: ProviderModelPair = { ...original, keySource: 'service' };
  return { selection: suggested, fallback: { reason: models?.length ? 'byok_model_unavailable' : 'byok_key_missing', original, suggested, requiresConsent: true } };
}

export async function getDefaultProviderModel(supabase: SupabaseClient, ownerId: string, byokModels?: ByokModelMap): Promise<ProviderModelPair> {
  return (await resolveDefaultProviderModel(supabase, ownerId, byokModels)).selection;
}

export async function setDefaultProviderModel(supabase: SupabaseClient, ownerId: string, pair: ProviderModelPair, byokModels?: ByokModelMap): Promise<{ ok: boolean; error?: string }> {
  if (!pair || !isValidPair(pair.providerId, pair.model) || (pair.keySource !== 'service' && pair.keySource !== 'byok')) return { ok: false, error: '지원하지 않는 모델이에요.' };
  if (pair.keySource === 'byok') {
    const connected = byokModels ?? await loadConnectedByokModels(supabase, ownerId);
    if (!connected[pair.providerId]?.includes(pair.model)) return { ok: false, error: '연결된 BYOK 키에서 확인된 모델이 아니에요.' };
  }
  const { error } = await supabase.from('profiles').update({ default_provider: pair.providerId, default_model: pair.model, default_key_source: pair.keySource }).eq('id', ownerId);
  if (error) return { ok: false, error: '저장하지 못했어요.' };
  return { ok: true };
}

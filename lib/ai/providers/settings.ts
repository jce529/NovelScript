import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultModelFor, isKnownModel, PROVIDER_MODELS } from './catalog';
import { loadConnectedByokModels } from './byok-models';
import type { ByokModelMap, Selection } from './selection';
import type { ProviderId } from './types';

export interface ProviderModelPair extends Selection {}
const FALLBACK: ProviderModelPair = { providerId: 'gemini', model: defaultModelFor('gemini'), keySource: 'service' };
function isProvider(value: string): value is ProviderId { return Object.hasOwn(PROVIDER_MODELS, value); }
function isValidPair(providerId: string, model: string): providerId is ProviderId { return isProvider(providerId) && isKnownModel(providerId, model); }

export async function getDefaultProviderModel(supabase: SupabaseClient, ownerId: string, byokModels?: ByokModelMap): Promise<ProviderModelPair> {
  const { data } = await supabase.from('profiles').select('default_provider, default_model, default_key_source').eq('id', ownerId).maybeSingle();
  if (!data?.default_provider || !data?.default_model || !isValidPair(data.default_provider, data.default_model)) return FALLBACK;
  const keySource = data.default_key_source === 'byok' ? 'byok' : 'service';
  if (keySource === 'service') return { providerId: data.default_provider, model: data.default_model, keySource };
  const connected = byokModels ?? await loadConnectedByokModels(supabase, ownerId);
  if (!connected[data.default_provider]?.includes(data.default_model)) return { providerId: data.default_provider, model: data.default_model, keySource: 'service' };
  return { providerId: data.default_provider, model: data.default_model, keySource };
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

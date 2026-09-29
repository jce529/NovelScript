import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultModelFor, isKnownModel, PROVIDER_MODELS } from './catalog';
import type { ProviderId } from './types';

export interface ProviderModelPair {
  providerId: ProviderId;
  model: string;
}

const FALLBACK: ProviderModelPair = { providerId: 'gemini', model: defaultModelFor('gemini') };

function isValidPair(providerId: string, model: string): providerId is ProviderId {
  return Object.hasOwn(PROVIDER_MODELS, providerId)
    && isKnownModel(providerId as ProviderId, model);
}

export async function getDefaultProviderModel(
  supabase: SupabaseClient, ownerId: string,
): Promise<ProviderModelPair> {
  const { data } = await supabase.from('profiles')
    .select('default_provider, default_model').eq('id', ownerId).maybeSingle();
  if (!data?.default_provider || !data?.default_model
    || !isValidPair(data.default_provider, data.default_model)) return FALLBACK;
  return { providerId: data.default_provider, model: data.default_model };
}

export async function setDefaultProviderModel(
  supabase: SupabaseClient, ownerId: string, pair: ProviderModelPair,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidPair(pair.providerId, pair.model)) return { ok: false, error: '알 수 없는 모델이에요.' };
  const { error } = await supabase.from('profiles')
    .update({ default_provider: pair.providerId, default_model: pair.model }).eq('id', ownerId);
  if (error) return { ok: false, error: '저장하지 못했어요.' };
  return { ok: true };
}

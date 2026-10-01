import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { intersectWithCatalog, type ByokModelMap } from './selection';
import type { ProviderId } from './types';

export async function loadConnectedByokModels(supabase: SupabaseClient, ownerId: string): Promise<ByokModelMap> {
  try {
    const { data, error } = await supabase.from('byok_keys').select('provider, status, model_ids').eq('owner_id', ownerId);
    if (error || !Array.isArray(data)) return {};
    const result: ByokModelMap = {};
    for (const row of data) {
      if (!row || !['gemini', 'openai', 'anthropic'].includes(row.provider) || row.status !== 'connected' || !Array.isArray(row.model_ids) || !row.model_ids.every((id: unknown) => typeof id === 'string')) return {};
      const provider = row.provider as ProviderId;
      const models = intersectWithCatalog(provider, row.model_ids as string[]);
      if (models.length) result[provider] = models;
    }
    return result;
  } catch { return {}; }
}

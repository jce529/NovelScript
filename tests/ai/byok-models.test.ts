import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));

import { loadConnectedByokModels } from '@/lib/ai/providers/byok-models';
import { resolveDefaultProviderModel } from '@/lib/ai/providers/settings';

type Row = { provider: string; status: string; model_ids: unknown };

function keysClient(result: { data: Row[] | null; error: unknown }, seen: { table?: string; columns?: string; filter?: [string, string] } = {}) {
  return {
    from(table: string) {
      seen.table = table;
      return {
        select(columns: string) {
          seen.columns = columns;
          return { async eq(column: string, value: string) { seen.filter = [column, value]; return result; } };
        },
      };
    },
  } as unknown as SupabaseClient;
}

const openaiConnected: Row = { provider: 'openai', status: 'connected', model_ids: ['gpt-4o-mini', 'gpt-5.6-terra'] };
const anthropicFailed: Row = { provider: 'anthropic', status: 'failed', model_ids: ['claude-haiku-4-5'] };
const anthropicConnected: Row = { provider: 'anthropic', status: 'connected', model_ids: ['claude-haiku-4-5'] };

describe('loadConnectedByokModels', () => {
  it('reads only the owner\'s metadata columns, never the secret', async () => {
    const seen: { table?: string; columns?: string; filter?: [string, string] } = {};
    await loadConnectedByokModels(keysClient({ data: [], error: null }, seen), 'owner-1');
    expect(seen).toEqual({ table: 'byok_keys', columns: 'provider, status, model_ids', filter: ['owner_id', 'owner-1'] });
  });

  it('returns the models of every connected provider', async () => {
    const map = await loadConnectedByokModels(keysClient({ data: [openaiConnected, anthropicConnected], error: null }), 'owner-1');
    expect(map).toEqual({ openai: ['gpt-4o-mini', 'gpt-5.6-terra'], anthropic: ['claude-haiku-4-5'] });
  });

  it('skips a failed key without hiding other providers\' connected models (BUG-01), whatever the row order', async () => {
    for (const data of [[openaiConnected, anthropicFailed], [anthropicFailed, openaiConnected]]) {
      const map = await loadConnectedByokModels(keysClient({ data, error: null }), 'owner-1');
      expect(map).toEqual({ openai: ['gpt-4o-mini', 'gpt-5.6-terra'] });
    }
  });

  it('returns an empty map when every key is failed', async () => {
    expect(await loadConnectedByokModels(keysClient({ data: [anthropicFailed], error: null }), 'owner-1')).toEqual({});
  });

  it('ignores a failed key even when its stored model list is odd', async () => {
    const odd: Row = { provider: 'anthropic', status: 'failed', model_ids: null };
    expect(await loadConnectedByokModels(keysClient({ data: [odd, openaiConnected], error: null }), 'owner-1')).toEqual({ openai: ['gpt-4o-mini', 'gpt-5.6-terra'] });
  });

  it('drops model ids that are no longer in the catalog', async () => {
    const stale: Row = { provider: 'openai', status: 'connected', model_ids: ['gpt-4o-mini', 'gone-model'] };
    expect(await loadConnectedByokModels(keysClient({ data: [stale], error: null }), 'owner-1')).toEqual({ openai: ['gpt-4o-mini'] });
  });

  it('fails closed on malformed rows and query errors', async () => {
    const malformed: Row[][] = [
      [{ provider: 'mystery', status: 'connected', model_ids: ['x'] }],
      [{ provider: 'openai', status: 'connected', model_ids: 'gpt-4o-mini' }],
      [{ provider: 'openai', status: 'connected', model_ids: [1, 2] }],
    ];
    for (const data of malformed) {
      expect(await loadConnectedByokModels(keysClient({ data: [openaiConnected, ...data], error: null }), 'owner-1')).toEqual({});
    }
    expect(await loadConnectedByokModels(keysClient({ data: null, error: { message: 'boom' } }), 'owner-1')).toEqual({});
  });
});

describe('default BYOK model with a failed key on another provider (BUG-01)', () => {
  it('does not report byok_key_missing for a connected default', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'byok_keys') return keysClient({ data: [openaiConnected, anthropicFailed], error: null }).from(table);
        return { select() { return { eq() { return { async maybeSingle() { return { data: { default_provider: 'openai', default_model: 'gpt-4o-mini', default_key_source: 'byok' }, error: null }; } }; } }; } };
      },
    } as unknown as SupabaseClient;
    const connected = await loadConnectedByokModels(supabase, 'owner-1');
    const r = await resolveDefaultProviderModel(supabase, 'owner-1', connected);
    expect(r.fallback).toBeUndefined();
    expect(r.selection).toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
  });
});

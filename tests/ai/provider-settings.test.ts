import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDefaultProviderModel, setDefaultProviderModel } from '@/lib/ai/providers/settings';

function profileStore(initial: { default_provider: string | null; default_model: string | null; default_key_source?: string | null } | null = null) {
  let row = initial;
  let writes = 0;
  const supabase = {
    from(table: string) {
      expect(table).toBe('profiles');
      return {
        select(columns: string) {
          expect(columns).toBe('default_provider, default_model, default_key_source');
          return { eq(column: string, id: string) {
            expect([column, id]).toEqual(['id', 'owner-1']);
            return { async maybeSingle() { return { data: row, error: null }; } };
          } };
        },
        update(values: { default_provider: string; default_model: string; default_key_source: string }) {
          writes++;
          return { async eq(column: string, id: string) {
            expect([column, id]).toEqual(['id', 'owner-1']);
            row = values;
            return { error: null };
          } };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { supabase, get writes() { return writes; } };
}

describe('account default provider/model', () => {
  it('falls back for a missing profile or null columns', async () => {
    for (const initial of [null, { default_provider: null, default_model: null }]) {
      const store = profileStore(initial);
      expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
        .toEqual({ providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' });
    }
  });

  it('reads and persists a matching pair', async () => {
    const store = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini' });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
      .toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' });
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'anthropic', model: 'claude-sonnet-5', keySource: 'service' }))
      .toEqual({ ok: true });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
      .toEqual({ providerId: 'anthropic', model: 'claude-sonnet-5', keySource: 'service' });
    expect(store.writes).toBe(1);
  });

  it('rejects a model from another provider without writing', async () => {
    const store = profileStore();
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'gemini', model: 'gpt-4o-mini', keySource: 'service' }))
      .toMatchObject({ ok: false });
    expect(store.writes).toBe(0);
  });

  it('falls back for an unknown stored provider and rejects it on write', async () => {
    const store = profileStore({ default_provider: 'unknown', default_model: 'gpt-4o-mini' });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
      .toEqual({ providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' });
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'unknown' as 'gemini', model: 'gpt-4o-mini', keySource: 'service' }))
      .toMatchObject({ ok: false });
    expect(store.writes).toBe(0);
  });

  it('reads a connected byok default from supplied map and downgrades an unavailable one', async () => {
    const store = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini', default_key_source: 'byok' });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1', { openai: ['gpt-4o-mini'] }))
      .toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1', {}))
      .toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' });
  });

  it('persists a connected byok selection and rejects an unavailable selection without writing', async () => {
    const store = profileStore();
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }, { openai: ['gpt-4o-mini'] }))
      .toEqual({ ok: true });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1', { openai: ['gpt-4o-mini'] }))
      .toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }, {}))
      .toMatchObject({ ok: false, error: '연결된 BYOK 키에서 확인된 모델이 아니에요.' });
    expect(store.writes).toBe(1);
  });
});

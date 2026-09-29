import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDefaultProviderModel, setDefaultProviderModel } from '@/lib/ai/providers/settings';

function profileStore(initial: { default_provider: string | null; default_model: string | null } | null = null) {
  let row = initial;
  let writes = 0;
  const supabase = {
    from(table: string) {
      expect(table).toBe('profiles');
      return {
        select(columns: string) {
          expect(columns).toBe('default_provider, default_model');
          return { eq(column: string, id: string) {
            expect([column, id]).toEqual(['id', 'owner-1']);
            return { async maybeSingle() { return { data: row, error: null }; } };
          } };
        },
        update(values: { default_provider: string; default_model: string }) {
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
        .toEqual({ providerId: 'gemini', model: 'gemini-3.5-flash' });
    }
  });

  it('reads and persists a matching pair', async () => {
    const store = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini' });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
      .toEqual({ providerId: 'openai', model: 'gpt-4o-mini' });
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'anthropic', model: 'claude-sonnet-5' }))
      .toEqual({ ok: true });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
      .toEqual({ providerId: 'anthropic', model: 'claude-sonnet-5' });
    expect(store.writes).toBe(1);
  });

  it('rejects a model from another provider without writing', async () => {
    const store = profileStore();
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'gemini', model: 'gpt-4o-mini' }))
      .toMatchObject({ ok: false });
    expect(store.writes).toBe(0);
  });

  it('falls back for an unknown stored provider and rejects it on write', async () => {
    const store = profileStore({ default_provider: 'unknown', default_model: 'gpt-4o-mini' });
    expect(await getDefaultProviderModel(store.supabase, 'owner-1'))
      .toEqual({ providerId: 'gemini', model: 'gemini-3.5-flash' });
    expect(await setDefaultProviderModel(store.supabase, 'owner-1', { providerId: 'unknown' as 'gemini', model: 'gpt-4o-mini' }))
      .toMatchObject({ ok: false });
    expect(store.writes).toBe(0);
  });
});

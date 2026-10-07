import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDefaultProviderModel, resolveDefaultProviderModel, setDefaultProviderModel } from '@/lib/ai/providers/settings';

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

  describe('resolveDefaultProviderModel fallback reasons', () => {
    const gemini = { providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' };
    it('reports not_set for an empty profile', async () => {
      const r = await resolveDefaultProviderModel(profileStore().supabase, 'owner-1');
      expect(r).toEqual({ selection: gemini, fallback: { reason: 'not_set', original: null, suggested: gemini, requiresConsent: false } });
    });
    it('reports model_retired for an unknown model', async () => {
      const r = await resolveDefaultProviderModel(profileStore({ default_provider: 'openai', default_model: 'gone-model' }).supabase, 'owner-1');
      expect(r.fallback).toMatchObject({ reason: 'model_retired', requiresConsent: false });
      expect(r.selection).toEqual(gemini);
    });
    it('reports byok_key_missing and requires consent before switching to the service key', async () => {
      const store = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini', default_key_source: 'byok' });
      const r = await resolveDefaultProviderModel(store.supabase, 'owner-1', {});
      expect(r.fallback).toMatchObject({ reason: 'byok_key_missing', requiresConsent: true });
      expect(r.fallback?.original).toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
      expect(r.selection.keySource).toBe('service');
    });
    it('reports byok_model_unavailable when the key exists but the model is not connected', async () => {
      const store = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini', default_key_source: 'byok' });
      const r = await resolveDefaultProviderModel(store.supabase, 'owner-1', { openai: ['gpt-4o'] });
      expect(r.fallback).toMatchObject({ reason: 'byok_model_unavailable', requiresConsent: true });
    });
    it('has no fallback when the default is usable', async () => {
      const byok = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini', default_key_source: 'byok' });
      expect((await resolveDefaultProviderModel(byok.supabase, 'owner-1', { openai: ['gpt-4o-mini'] })).fallback).toBeUndefined();
      const svc = profileStore({ default_provider: 'openai', default_model: 'gpt-4o-mini' });
      expect((await resolveDefaultProviderModel(svc.supabase, 'owner-1')).fallback).toBeUndefined();
    });
  });
});

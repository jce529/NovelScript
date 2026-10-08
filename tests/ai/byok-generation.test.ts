import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gemini: vi.fn(), openai: vi.fn(), anthropic: vi.fn(), fixture: vi.fn(),
  rpc: vi.fn(),
  log: vi.fn(), error: vi.fn(),
}));

vi.mock('@/lib/ai/providers/gemini', () => ({ createGeminiProvider: mocks.gemini }));
vi.mock('@/lib/ai/providers/openai', () => ({ createOpenAiProvider: mocks.openai }));
vi.mock('@/lib/ai/providers/anthropic', () => ({ createAnthropicProvider: mocks.anthropic }));
vi.mock('@/lib/ai/providers/fixture', () => ({ createFixtureProvider: mocks.fixture, readProviderFixture: () => null }));
import { createProviderWithApiKey } from '@/lib/ai/providers/registry';
import { markByokFailed, resolveGenerationRoute } from '@/lib/ai/providers/byok';
import type { Selection } from '@/lib/ai/providers/selection';

const ownerId = '00000000-0000-4000-8000-000000000001';
const secret = `sk-secret-${'x'.repeat(24)}`;
const client = { generate: vi.fn() };
const row = { id: 'key-old', provider: 'openai', status: 'connected', model_ids: ['gpt-4o-mini'] };

function deps(key: typeof row | null = row) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: key, error: null })),
  };
  return {
    supabase: { from: vi.fn(() => query) },
    admin: { rpc: mocks.rpc },
  };
}

describe('trusted BYOK generation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gemini.mockReturnValue(client);
    mocks.openai.mockReturnValue(client);
    mocks.anthropic.mockReturnValue(client);
    mocks.rpc.mockResolvedValue({ data: secret, error: null });
    vi.spyOn(console, 'log').mockImplementation(mocks.log);
    vi.spyOn(console, 'error').mockImplementation(mocks.error);
  });

  it('constructs each provider through the explicit key factory', () => {
    expect(createProviderWithApiKey('openai', secret, { keySource: 'byok' })).toBe(client);
    expect(createProviderWithApiKey('anthropic', secret, { keySource: 'byok' })).toBe(client);
    expect(createProviderWithApiKey('gemini', secret, { keySource: 'byok' })).toBe(client);
    expect(mocks.openai).toHaveBeenCalledWith({ apiKey: secret, errorContext: { keySource: 'byok' } });
    expect(mocks.anthropic).toHaveBeenCalledWith({ apiKey: secret, errorContext: { keySource: 'byok' } });
    expect(mocks.gemini).toHaveBeenCalledWith({ apiKey: secret, errorContext: { keySource: 'byok' } });
  });

  it('routes service selections only through the platform factory', async () => {
    const result = await resolveGenerationRoute({ ...deps(), ownerId, selection: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' }, env: { ...process.env, OPENAI_API_KEY: secret } } as never);
    expect(result).toMatchObject({ kind: 'service', client });
    expect(mocks.openai).toHaveBeenCalledWith({ apiKey: secret, errorContext: { keySource: 'service' } });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('derives connected key identity and membership before creating a BYOK client', async () => {
    const result = await resolveGenerationRoute({ ...deps(), ownerId, selection: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' } } as never);
    expect(result).toMatchObject({ kind: 'byok', keyId: 'key-old', client });
    expect(mocks.rpc).toHaveBeenCalledWith('get_byok_secret', expect.objectContaining({ p_owner: ownerId, p_provider: 'openai' }));
    expect(mocks.openai).toHaveBeenCalledWith({ apiKey: secret, errorContext: { keySource: 'byok' } });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([
    ['missing', null, { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }],
    ['failed', { ...row, status: 'failed' }, { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }],
    ['deleted', null, { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }],
    ['model mismatch', { ...row, model_ids: [] }, { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }],
    ['unknown catalog model', { ...row, model_ids: ['outside-model'] }, { providerId: 'openai', model: 'outside-model', keySource: 'byok' }, { providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' }],
  ] as const)('requires replacement for %s without creating a provider', async (_label, key, selection, replacement: Selection = { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' }) => {
    const result = await resolveGenerationRoute({ ...deps(key as typeof row | null), ownerId, selection } as never);
    expect(result).toMatchObject({ kind: 'replacement_required', replacement });
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(mocks.openai).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires replacement when decrypt returns null and uses Gemini when the selected model has no service entry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const same = await resolveGenerationRoute({ ...deps(), ownerId, selection: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' } } as never);
    expect(same).toMatchObject({ kind: 'replacement_required', replacement: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' } });
    const gemini = await resolveGenerationRoute({ ...deps(), ownerId, selection: { providerId: 'openai', model: 'not-in-catalog', keySource: 'byok' } } as never);
    expect(gemini).toMatchObject({ kind: 'replacement_required', replacement: { providerId: 'gemini', keySource: 'service' } });
    expect(mocks.openai).not.toHaveBeenCalled();
  });

  it('marks only invalid-key failures and treats stale expected ids as no-op', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(markByokFailed(deps().admin as never, { ownerId, providerId: 'openai', expectedKeyId: 'key-old' })).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('mark_byok_failed', { p_owner: ownerId, p_provider: 'openai', p_expected_key_id: 'key-old' });
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(markByokFailed(deps().admin as never, { ownerId, providerId: 'openai', expectedKeyId: 'deleted-key' })).resolves.toBe(false);
  });

  it('contains conditional RPC failures without exposing database details', async () => {
    const databaseDetail = `private database detail ${secret}`;
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: databaseDetail } });
    const result = await markByokFailed(deps().admin as never, { ownerId, providerId: 'anthropic', expectedKeyId: 'key-current' });
    expect(result).toBe(false);
    expect(JSON.stringify(result)).not.toContain(databaseDetail);

    mocks.rpc.mockRejectedValueOnce(new Error(databaseDetail));
    await expect(markByokFailed(deps().admin as never, { ownerId, providerId: 'gemini', expectedKeyId: 'key-current' })).resolves.toBe(false);
  });

});

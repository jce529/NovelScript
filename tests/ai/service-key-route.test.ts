import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gemini: vi.fn(), openai: vi.fn(), anthropic: vi.fn(), fixture: vi.fn(),
  rpc: vi.fn(), warn: vi.fn(), log: vi.fn(), error: vi.fn(),
}));

// Only SDK-facing factories are mocked; registry and byok are the real modules.
vi.mock('@/lib/ai/providers/gemini', () => ({ createGeminiProvider: mocks.gemini }));
vi.mock('@/lib/ai/providers/openai', () => ({ createOpenAiProvider: mocks.openai }));
vi.mock('@/lib/ai/providers/anthropic', () => ({ createAnthropicProvider: mocks.anthropic }));
vi.mock('@/lib/ai/providers/fixture', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/providers/fixture')>();
  return { ...actual, createFixtureProvider: mocks.fixture };
});
import { resolveGenerationRoute } from '@/lib/ai/providers/byok';
import { createProviderWithApiKey } from '@/lib/ai/providers/registry';
import type { ProviderId } from '@/lib/ai/providers/types';
import type { Selection } from '@/lib/ai/providers/selection';

const ownerId = '00000000-0000-4000-8000-000000000001';
const sentinel = 'sk-sentinel-ROUTE-0123456789abcdef';
const client = { generateContent: vi.fn() };
const providers: ProviderId[] = ['gemini', 'openai', 'anthropic'];
const modelFor: Record<ProviderId, string> = { gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-5' };
const keyVar: Record<ProviderId, string> = { gemini: 'GEMINI_API_KEY', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

function deps(env: Record<string, string | undefined>, selection: Selection) {
  const from = vi.fn(() => { throw new Error('supabase must not be touched for service route'); });
  return { supabase: { from } as never, admin: { rpc: mocks.rpc }, ownerId, selection, env };
}
const service = (p: ProviderId): Selection => ({ providerId: p, model: modelFor[p], keySource: 'service' });

describe('resolveGenerationRoute service boundary (real registry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gemini.mockReturnValue(client);
    mocks.openai.mockReturnValue(client);
    mocks.anthropic.mockReturnValue(client);
    mocks.fixture.mockReturnValue(client);
    vi.spyOn(console, 'warn').mockImplementation(mocks.warn);
    vi.spyOn(console, 'log').mockImplementation(mocks.log);
    vi.spyOn(console, 'error').mockImplementation(mocks.error);
  });

  for (const provider of providers) {
    for (const fixtureEnv of [{}, { NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'slow' }, { NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'off' }]) {
      it(`rejects keyless ${provider} service with API_KEY_MISSING (${JSON.stringify(fixtureEnv)})`, async () => {
        await expect(resolveGenerationRoute(deps({ ...fixtureEnv, [keyVar[provider]]: '   ' }, service(provider))))
          .rejects.toMatchObject({ info: { kind: 'config', providerErrorCode: 'API_KEY_MISSING' } });
        expect(mocks.fixture).not.toHaveBeenCalled();
        expect(mocks.gemini).not.toHaveBeenCalled();
        expect(mocks.openai).not.toHaveBeenCalled();
        expect(mocks.anthropic).not.toHaveBeenCalled();
        expect(mocks.rpc).not.toHaveBeenCalled();
      });
    }
  }

  it('serves the fixture in development when the real key exists, without a vendor SDK client', async () => {
    const route = await resolveGenerationRoute(deps({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'slow', GEMINI_API_KEY: sentinel }, service('gemini')));
    expect(route).toMatchObject({ kind: 'service' });
    expect(mocks.fixture).toHaveBeenCalledWith('slow');
    expect(mocks.gemini).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('builds the SDK provider with a service key when no fixture is active', async () => {
    await resolveGenerationRoute(deps({ OPENAI_API_KEY: sentinel }, service('openai')));
    expect(mocks.openai).toHaveBeenCalledWith({ apiKey: sentinel, errorContext: { keySource: 'service' } });
  });

  it('keyless service rejection does not block BYOK client creation', async () => {
    await expect(resolveGenerationRoute(deps({}, service('openai')))).rejects.toMatchObject({ info: { providerErrorCode: 'API_KEY_MISSING' } });
    expect(createProviderWithApiKey('openai', sentinel, { keySource: 'byok' })).toBe(client);
    expect(mocks.openai).toHaveBeenCalledWith({ apiKey: sentinel, errorContext: { keySource: 'byok' } });
  });

  it('never leaks a non-empty key through errors or logs', async () => {
    const env = { NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'slow', GEMINI_API_KEY: '', OPENAI_API_KEY: sentinel };
    let thrown: unknown;
    try { await resolveGenerationRoute(deps(env, service('gemini'))); } catch (e) { thrown = e; }
    await resolveGenerationRoute(deps(env, service('openai')));
    const dump = JSON.stringify([String(thrown), (thrown as Error)?.message, mocks.warn.mock.calls, mocks.log.mock.calls, mocks.error.mock.calls]);
    expect(dump).not.toContain(sentinel);
  });
});

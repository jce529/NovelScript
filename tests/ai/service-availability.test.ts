import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { assertServiceKeyAvailable, getServiceAvailability } from '@/lib/ai/providers/service-availability';
import { ProviderCallError } from '@/lib/ai/providers/errors';
import { PROVIDER_FIXTURE_MODES } from '@/lib/ai/providers/fixture';

const SENTINEL = 'sk-sentinel-DO-NOT-LEAK-7f3a';
const PROVIDERS = ['gemini', 'openai', 'anthropic'] as const;
const FIXTURE_ENVS: Record<string, string | undefined>[] = [
  {},
  { NODE_ENV: 'production' },
  { NODE_ENV: 'test' },
  { NODE_ENV: 'development', AI_PROVIDER_FIXTURE: 'off' },
  ...PROVIDER_FIXTURE_MODES.map((mode) => ({ NODE_ENV: 'development', AI_PROVIDER_FIXTURE: mode })),
];

describe('getServiceAvailability', () => {
  it('reports every provider unavailable for an empty env', () => {
    expect(getServiceAvailability({})).toEqual({ gemini: false, openai: false, anthropic: false });
  });

  it('treats empty and whitespace-only keys as missing', () => {
    expect(getServiceAvailability({ GEMINI_API_KEY: '', OPENAI_API_KEY: '   ', ANTHROPIC_API_KEY: '\t\n' }))
      .toEqual({ gemini: false, openai: false, anthropic: false });
  });

  it('enables only the provider with a real key', () => {
    expect(getServiceAvailability({ OPENAI_API_KEY: SENTINEL })).toEqual({ gemini: false, openai: true, anthropic: false });
  });

  it.each(FIXTURE_ENVS)('is not affected by fixture/NODE_ENV settings (%o)', (extra) => {
    expect(getServiceAvailability({ ...extra })).toEqual({ gemini: false, openai: false, anthropic: false });
    expect(getServiceAvailability({ ...extra, OPENAI_API_KEY: SENTINEL })).toEqual({ gemini: false, openai: true, anthropic: false });
  });

  it('returns only provider booleans (no key values or env names)', () => {
    const dto = getServiceAvailability({ GEMINI_API_KEY: SENTINEL, OPENAI_API_KEY: SENTINEL, ANTHROPIC_API_KEY: SENTINEL });
    expect(Object.keys(dto).sort()).toEqual(['anthropic', 'gemini', 'openai']);
    expect(Object.values(dto).every((v) => v === true)).toBe(true);
    const json = JSON.stringify(dto);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain('API_KEY');
  });

  it('defaults to process.env', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', SENTINEL);
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    try {
      expect(getServiceAvailability()).toEqual({ gemini: false, openai: false, anthropic: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('assertServiceKeyAvailable', () => {
  it.each(PROVIDERS)('throws a sanitized API_KEY_MISSING config error for %s without its key in every fixture mode', (provider) => {
    const otherKey = provider === 'gemini' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY';
    for (const extra of FIXTURE_ENVS) {
      let caught: unknown;
      try {
        assertServiceKeyAvailable(provider, { ...extra, [otherKey]: SENTINEL });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ProviderCallError);
      expect((caught as ProviderCallError).info).toEqual({ provider, status: null, kind: 'config', providerErrorCode: 'API_KEY_MISSING' });
      expect((caught as Error).message).not.toContain(SENTINEL);
      expect(JSON.stringify((caught as ProviderCallError).info)).not.toContain(SENTINEL);
    }
  });

  it('throws for whitespace-only keys', () => {
    expect(() => assertServiceKeyAvailable('openai', { OPENAI_API_KEY: '  ' })).toThrow(ProviderCallError);
  });

  it('returns without logging when the key exists', () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      expect(assertServiceKeyAvailable('openai', { OPENAI_API_KEY: SENTINEL })).toBeUndefined();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

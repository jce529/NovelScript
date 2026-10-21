import { beforeEach, describe, expect, it, vi } from 'vitest';

const SENTINEL = 'sk-sentinel-availability-DO-NOT-LEAK';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), from: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => {
      mocks.from(table);
      return { select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) };
    },
  }),
}));

import { getServiceAvailabilityAction } from '@/app/studio/settings/ai-providers/model-availability-actions';

describe('getServiceAvailabilityAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'session-owner' } }, error: null });
    mocks.profile.mockResolvedValue({ data: { role: 'writer', deleted_at: null }, error: null });
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', SENTINEL);
    vi.stubEnv('ANTHROPIC_API_KEY', '');
  });

  it('returns three booleans for an active writer', async () => {
    const result = await getServiceAvailabilityAction();
    expect(result).toEqual({ ok: true, availability: { gemini: false, openai: true, anthropic: false } });
    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
    expect(JSON.stringify(result)).not.toContain('API_KEY');
  });

  it.each([
    ['unauthenticated', () => mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })],
    ['auth error', () => mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'jwt' } })],
    ['auth throws', () => mocks.getUser.mockRejectedValue(new Error('network'))],
    ['deleted account', () => mocks.profile.mockResolvedValue({ data: { role: 'writer', deleted_at: '2026-10-01' }, error: null })],
    ['reader', () => mocks.profile.mockResolvedValue({ data: { role: 'reader', deleted_at: null }, error: null })],
    ['missing profile', () => mocks.profile.mockResolvedValue({ data: null, error: null })],
    ['profile query error', () => mocks.profile.mockResolvedValue({ data: null, error: { message: 'boom' } })],
    ['profile query throws', () => mocks.profile.mockRejectedValue(new Error('boom'))],
  ] as const)('returns only ok:false for %s', async (_label, arrange) => {
    arrange();
    const result = await getServiceAvailabilityAction();
    expect(result).toEqual({ ok: false });
    expect(JSON.stringify(result)).not.toContain(SENTINEL);
  });

  it('ignores any client-supplied arguments', async () => {
    const call = getServiceAvailabilityAction as unknown as (...args: unknown[]) => ReturnType<typeof getServiceAvailabilityAction>;
    const result = await call({ gemini: true, openai: false, anthropic: true }, 'attacker-owner', { GEMINI_API_KEY: 'x' });
    expect(result).toEqual({ ok: true, availability: { gemini: false, openai: true, anthropic: false } });
    expect(getServiceAvailabilityAction.length).toBe(0);
  });

  it('gives the same DTO for fixture=development modes and off with the same real env', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AI_PROVIDER_FIXTURE', 'unavailable');
    const withFixture = await getServiceAvailabilityAction();
    vi.stubEnv('AI_PROVIDER_FIXTURE', 'off');
    const withoutFixture = await getServiceAvailabilityAction();
    expect(withFixture).toEqual(withoutFixture);
    expect(withFixture).toEqual({ ok: true, availability: { gemini: false, openai: true, anthropic: false } });
  });
});

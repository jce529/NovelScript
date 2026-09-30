import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), profile: vi.fn(), register: vi.fn(), recheck: vi.fn(), remove: vi.fn(),
  save: vi.fn(), loadModels: vi.fn(), revalidate: vi.fn(), redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }) }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ rpc: vi.fn() })) }));
vi.mock('@/lib/ai/providers/byok', () => ({ registerByokKey: mocks.register, recheckByokKey: mocks.recheck, deleteByokKey: mocks.remove }));
vi.mock('@/lib/ai/providers/byok-models', () => ({ loadConnectedByokModels: mocks.loadModels }));
vi.mock('@/lib/ai/providers/settings', () => ({ setDefaultProviderModel: mocks.save }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { deleteByokKeyAction, recheckByokKeyAction, registerByokKeyAction, saveDefaultAction } from '@/app/studio/settings/ai-providers/actions';

const fd = (values: Record<string, string>) => { const form = new FormData(); for (const [key, value] of Object.entries(values)) form.set(key, value); return form; };
const owner = 'session-owner';

describe('BYOK settings server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: owner } } });
    mocks.profile.mockResolvedValue({ data: { role: 'writer', deleted_at: null } });
    mocks.register.mockResolvedValue({ ok: true, message: 'Registered', modelCount: 2, secret_id: 'secret' });
    mocks.recheck.mockResolvedValue({ ok: false, reason: 'invalid', message: 'safe' });
    mocks.remove.mockResolvedValue({ ok: true, message: 'Deleted', surprise: 'hidden' });
    mocks.loadModels.mockResolvedValue({ openai: ['gpt-4o-mini'] });
    mocks.save.mockResolvedValue({ ok: true });
  });
  it('rejectsUnauthenticatedRegistration', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await registerByokKeyAction({ ok: false }, fd({ provider: 'openai', apiKey: 'sentinel' })).catch(() => undefined);
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it('rejectsInactiveOrNonWriterRegistration', async () => {
    for (const profile of [{ role: 'writer', deleted_at: 'now' }, { role: 'reader', deleted_at: null }]) {
      mocks.profile.mockResolvedValueOnce({ data: profile });
      await registerByokKeyAction({ ok: false }, fd({ provider: 'openai', apiKey: 'secret' })).catch(() => undefined);
    }
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it('rejectsInvalidRegistrationProvider', async () => {
    await registerByokKeyAction({ ok: false }, fd({ provider: 'other', apiKey: 'secret' }));
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it('registersForSessionOwnerOnly', async () => {
    await registerByokKeyAction({ ok: false }, fd({ provider: 'openai', apiKey: 'sentinel-key', ownerId: 'attacker' }));
    expect(mocks.register).toHaveBeenCalledWith(expect.anything(), owner, 'openai', 'sentinel-key');
  });
  it('returnsSanitizedRegistrationResult', async () => {
    const result = await registerByokKeyAction({ ok: false }, fd({ provider: 'openai', apiKey: 'sentinel-key' }));
    expect(JSON.stringify(result)).not.toContain('sentinel-key');
    expect(result).not.toHaveProperty('secret_id');
    expect(mocks.revalidate).toHaveBeenCalledWith('/studio/settings/ai-providers');
  });
  it('rechecksOnlyAsAuthorizedWriter', async () => {
    mocks.profile.mockResolvedValueOnce({ data: { role: 'reader', deleted_at: null } });
    await recheckByokKeyAction({ ok: false }, fd({ provider: 'openai' })).catch(() => undefined);
    await recheckByokKeyAction({ ok: false }, fd({ provider: 'bogus' }));
    expect(mocks.recheck).not.toHaveBeenCalled();
    await recheckByokKeyAction({ ok: false }, fd({ provider: 'openai', ownerId: 'attacker' }));
    expect(mocks.recheck).toHaveBeenCalledWith(expect.anything(), owner, 'openai');
  });
  it('revalidatesWhenRecheckMarksKeyFailed', async () => {
    await recheckByokKeyAction({ ok: false }, fd({ provider: 'openai' }));
    expect(mocks.revalidate).toHaveBeenCalledWith('/studio/settings/ai-providers');
  });
  it('deletesOnlyAsAuthorizedWriter', async () => {
    mocks.profile.mockResolvedValueOnce({ data: { role: 'reader', deleted_at: null } });
    await deleteByokKeyAction({ ok: false }, fd({ provider: 'openai' })).catch(() => undefined);
    await deleteByokKeyAction({ ok: false }, fd({ provider: 'bad' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await deleteByokKeyAction({ ok: false }, fd({ provider: 'gemini', ownerId: 'attacker' }));
    expect(mocks.remove).toHaveBeenCalledWith(expect.anything(), owner, 'gemini');
  });
  it('returnsSanitizedDeleteResultAndRevalidates', async () => {
    const result = await deleteByokKeyAction({ ok: false }, fd({ provider: 'openai' }));
    expect(result).toEqual({ ok: true, message: 'Deleted' });
    expect(mocks.revalidate).toHaveBeenCalledWith('/studio/settings/ai-providers');
  });
  it('rejectsMalformedDefaultSelection', async () => {
    await saveDefaultAction(fd({ providerModel: 'openai:gpt-4o-mini:byok:extra' })).catch(() => undefined);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith('/studio/settings/ai-providers?error=1');
  });
  it('savesLegacyAndByokSelections', async () => {
    for (const [value, expected] of [['openai:gpt-4o-mini', { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' }], ['openai:gpt-4o-mini:byok', { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }]] as const) {
      mocks.redirect.mockImplementationOnce((url: string) => { throw new Error(`REDIRECT:${url}`); });
      await saveDefaultAction(fd({ providerModel: value })).catch(() => undefined);
      expect(mocks.save).toHaveBeenLastCalledWith(expect.anything(), owner, expected, { openai: ['gpt-4o-mini'] });
    }
    expect(mocks.redirect).toHaveBeenLastCalledWith('/studio/settings/ai-providers?saved=1');
  });
});

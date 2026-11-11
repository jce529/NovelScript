import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  profile: vi.fn(),
  softDelete: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ origin: 'http://localhost:3100' }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signOut: mocks.signOut,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      getUser: mocks.getUser,
      updateUser: mocks.updateUser,
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/auth/account', async () => ({
  ...(await vi.importActual<typeof import('@/lib/auth/account')>('@/lib/auth/account')),
  softDeleteAccount: mocks.softDelete,
}));

import {
  requestPasswordResetAction,
  signInWithPasswordAction,
  signUpWithPasswordAction,
  updatePasswordAction,
} from '@/lib/auth/password-actions';

function form(values: Record<string, string>) {
  const fd = new FormData();
  Object.entries(values).forEach(([k, v]) => fd.set(k, v));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ data: { deleted_at: null } });
  mocks.softDelete.mockResolvedValue(undefined);
});

describe('signInWithPasswordAction', () => {
  it('redirects to the safe next path on success', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await expect(
      signInWithPasswordAction({}, form({ email: 'A@b.co', password: 'pw123456', next: '/works' })),
    ).rejects.toThrow('REDIRECT:/works');
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw123456' });
  });

  it('rejects an open-redirect next', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    await expect(
      signInWithPasswordAction({}, form({ email: 'a@b.co', password: 'pw123456', next: '//evil.com' })),
    ).rejects.toThrow('REDIRECT:/');
  });

  it('returns a Korean message for wrong password and unconfirmed email', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: 'invalid_credentials' } });
    expect((await signInWithPasswordAction({}, form({ email: 'a@b.co', password: 'x' }))).error).toMatch(/올바르지/);
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { code: 'email_not_confirmed' } });
    expect((await signInWithPasswordAction({}, form({ email: 'a@b.co', password: 'x' }))).error).toMatch(/인증/);
  });

  it('signs out and finishes deletion for a soft-deleted account', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mocks.profile.mockResolvedValue({ data: { deleted_at: '2026-01-01' } });
    await expect(
      signInWithPasswordAction({}, form({ email: 'a@b.co', password: 'pw123456' })),
    ).rejects.toThrow('REDIRECT:/login?error=account_deleted');
    expect(mocks.softDelete).toHaveBeenCalledWith({}, 'u1');
    expect(mocks.signOut).toHaveBeenCalled();
  });
});

describe('signUpWithPasswordAction', () => {
  const valid = { email: 'new@b.co', password: 'pw123456', confirm: 'pw123456' };

  it('validates before calling Supabase', async () => {
    expect((await signUpWithPasswordAction({}, form({ ...valid, confirm: 'nope' }))).error).toMatch(/일치/);
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it('sends a confirmation mail with the callback redirect', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    const state = await signUpWithPasswordAction({}, form(valid));
    expect(state.notice).toMatch(/인증 메일/);
    expect(mocks.signUp.mock.calls[0][0].options.emailRedirectTo).toBe('http://localhost:3100/auth/callback');
  });

  it('reports a duplicate (including social) email', async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    expect((await signUpWithPasswordAction({}, form(valid))).error).toMatch(/이미 가입/);
  });
});

describe('password reset', () => {
  it('does not reveal whether the email exists', async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    const state = await requestPasswordResetAction({}, form({ email: 'x@y.co' }));
    expect(state.notice).toBeDefined();
    expect(mocks.resetPasswordForEmail.mock.calls[0][1].redirectTo).toContain('next=%2Fauth%2Freset-password');
  });

  it('requires a session to update the password', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect((await updatePasswordAction({}, form({ password: 'pw123456', confirm: 'pw123456' }))).error).toMatch(/만료/);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('updates the password and redirects home', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mocks.updateUser.mockResolvedValue({ error: null });
    await expect(updatePasswordAction({}, form({ password: 'pw123456', confirm: 'pw123456' }))).rejects.toThrow('REDIRECT:/');
  });
});

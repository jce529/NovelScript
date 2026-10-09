import { describe, expect, it, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const mocks = vi.hoisted(() => ({
  deleteAction: vi.fn(),
  exchange: vi.fn(),
  signOut: vi.fn(),
  profile: vi.fn(),
  softDelete: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/account/actions', () => ({ deleteAccountAction: mocks.deleteAction }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: mocks.exchange, signOut: mocks.signOut },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ marker: 'admin' }) }));
vi.mock('@/lib/auth/account', async () => ({
  ...(await vi.importActual<typeof import('@/lib/auth/account')>('@/lib/auth/account')),
  softDeleteAccount: mocks.softDelete,
}));

type MockProps = { children?: React.ReactNode; render?: React.ReactNode; initialFocus?: unknown; [key: string]: unknown };
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogTrigger: ({ children, render }: MockProps) => render ?? children,
  DialogContent: ({ children, initialFocus }: MockProps) => React.createElement('div', { 'data-initial-focus': String(!!initialFocus) }, children),
  DialogDescription: ({ children }: MockProps) => React.createElement('p', null, children),
  DialogFooter: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogHeader: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogTitle: ({ children }: MockProps) => React.createElement('h3', null, children),
  DialogClose: ({ children, render }: MockProps) => render ?? children,
}));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: MockProps) => React.createElement('button', props, children) }));

import { DeleteAccountButton } from '@/app/account/DeleteAccountButton';
import { GET } from '@/app/auth/callback/route';

beforeEach(() => vi.clearAllMocks());

describe('DeleteAccountButton', () => {
  it('asks for confirmation before deleting and never calls the action on render', () => {
    const html = renderToStaticMarkup(React.createElement(DeleteAccountButton, { isWriter: true }));
    expect(html).toContain('계정 탈퇴하기');
    expect(html).toContain('정말 탈퇴할까요?');
    expect(html).toContain('탈퇴하면 되돌릴 수 없어요.');
    expect(html).toContain('등록한 AI API 키');
    expect(html).toContain('data-initial-focus="true"');
    expect(html).toContain('>취소<');
    expect(html).toContain('>탈퇴하기<');
    expect(mocks.deleteAction).not.toHaveBeenCalled();
  });

  it('omits the API key notice for readers', () => {
    const html = renderToStaticMarkup(React.createElement(DeleteAccountButton, { isWriter: false }));
    expect(html).not.toContain('AI API 키');
  });
});

describe('auth callback for deleted accounts', () => {
  const request = () => new Request('http://localhost:3000/auth/callback?code=abc');

  it('finishes a legacy half-deleted account, drops the session and returns to /login', async () => {
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mocks.profile.mockResolvedValue({ data: { deleted_at: '2026-10-09T00:00:00Z' } });
    mocks.softDelete.mockResolvedValue(undefined);

    const response = await GET(request());

    expect(mocks.softDelete).toHaveBeenCalledWith({ marker: 'admin' }, 'u1');
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?error=account_deleted');
  });

  it('still signs the session out when finishing the deletion fails', async () => {
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    mocks.profile.mockResolvedValue({ data: { deleted_at: '2026-10-09T00:00:00Z' } });
    mocks.softDelete.mockRejectedValue(new Error('boom'));

    const response = await GET(request());

    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toContain('/login?error=account_deleted');
  });

  it('lets an active account through to its destination', async () => {
    mocks.exchange.mockResolvedValue({ data: { user: { id: 'u2', email: 'a@b.c', app_metadata: {}, identities: [] } }, error: null });
    mocks.profile.mockResolvedValue({ data: { deleted_at: null } });

    const response = await GET(request());

    expect(mocks.softDelete).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(response.headers.get('location')).not.toContain('error=account_deleted');
  });
});

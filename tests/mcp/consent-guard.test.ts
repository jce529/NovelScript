import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { allowedOAuthRedirectHost } from '@/lib/auth/redirect';

const createClient = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn((url: string) => { throw Object.assign(new Error('redirect'), { digest: 'NEXT_REDIRECT', url }); }));
vi.mock('@/lib/supabase/server', () => ({ createClient }));
vi.mock('next/navigation', () => ({ redirect }));

import { approveConsent, denyConsent } from '@/app/oauth/consent/actions';

const ID = 'request-id';
const USER = 'writer-id';
const CLIENT = 'client-id';

function fixture(overrides: { host?: string; role?: string; user?: string | null; deletedAt?: string | null; detailsError?: boolean; revoked?: string[] } = {}) {
  const details = { authorization_id: ID, redirect_uri: overrides.host ?? 'https://claude.ai/api/mcp/auth_callback', client: { id: CLIENT, name: 'Claude' }, user: { id: USER } };
  const getAuthorizationDetails = vi.fn().mockResolvedValue(overrides.user === null
    ? { data: null, error: Error('AuthSessionMissingError') }
    : { data: overrides.detailsError ? null : details, error: overrides.detailsError ? Error('expired') : null });
  const getUser = vi.fn().mockResolvedValue({ data: { user: overrides.user === null ? null : { id: overrides.user ?? USER } }, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: { role: overrides.role ?? 'writer', deleted_at: overrides.deletedAt ?? null }, error: null });
  const rpc = vi.fn().mockResolvedValue({ data: overrides.revoked ?? [], error: null });
  const revokeGrant = vi.fn().mockResolvedValue({ error: null });
  const approveAuthorization = vi.fn().mockResolvedValue({ data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=opaque' }, error: null });
  const denyAuthorization = vi.fn().mockResolvedValue({ data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?error=access_denied' }, error: null });
  createClient.mockResolvedValue({
    auth: { oauth: { getAuthorizationDetails, revokeGrant, approveAuthorization, denyAuthorization }, getUser },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
    rpc,
  });
  return { getAuthorizationDetails, getUser, maybeSingle, rpc, revokeGrant, approveAuthorization, denyAuthorization };
}

beforeEach(() => { vi.clearAllMocks(); });

describe('OAuth consent server guard', () => {
  it.each(['claude.ai', 'claude.com', 'localhost', '127.0.0.1'])('accepts the exact host %s', host => {
    expect(allowedOAuthRedirectHost(`${host === 'localhost' || host === '127.0.0.1' ? 'http' : 'https'}://${host}/callback`)).toBe(host);
  });

  it.each([
    'https://evilclaude.ai/callback', 'https://claude.ai.evil.com/callback',
    'https://claude.ai@evil.com/callback', 'https://evil@claude.ai/callback',
    'https://sub.claude.com/callback', 'javascript:alert(1)', 'http://claude.ai/callback',
  ])('rejects spoofed or unsafe redirect URI %s', uri => {
    expect(allowedOAuthRedirectHost(uri)).toBeNull();
  });

  it('rejects missing or expired IDs before reading the user or writing a grant', async () => {
    const mock = fixture({ detailsError: true });
    expect(await approveConsent(ID)).toEqual({ ok: false });
    expect(mock.getUser).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(await denyConsent('')).toEqual({ ok: false });
    expect(mock.denyAuthorization).not.toHaveBeenCalled();
  });

  it.each([
    { user: null }, { user: 'another-user' }, { deletedAt: '2026-01-01T00:00:00Z' },
    { role: 'reader' }, { host: 'https://claude.ai.evil.com/callback' },
  ])('refuses approval when account or request is unsafe: %j', async overrides => {
    const mock = fixture(overrides);
    expect(await approveConsent(ID)).toEqual({ ok: false });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.approveAuthorization).not.toHaveBeenCalled();
  });

  it('records both scopes, revokes each replaced grant, and then approves', async () => {
    const mock = fixture({ revoked: ['old-a', 'old-b'] });
    await expect(approveConsent(ID)).rejects.toMatchObject({ digest: 'NEXT_REDIRECT' });
    expect(mock.rpc).toHaveBeenCalledWith('mcp_connect', {
      p_client_id: CLIENT, p_client_name: 'Claude', p_redirect_host: 'claude.ai',
      p_scopes: ['read', 'propose_draft'],
    });
    expect(mock.revokeGrant).toHaveBeenCalledTimes(2);
    expect(mock.revokeGrant).toHaveBeenCalledWith({ clientId: 'old-a' });
    expect(mock.revokeGrant).toHaveBeenCalledWith({ clientId: 'old-b' });
    expect(mock.approveAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
    expect(mock.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.revokeGrant.mock.invocationCallOrder[0]);
    expect(mock.revokeGrant.mock.invocationCallOrder[1]).toBeLessThan(mock.approveAuthorization.mock.invocationCallOrder[0]);
  });

  it('continues approval when revoking an old OAuth grant fails', async () => {
    const mock = fixture({ revoked: ['old-a'] });
    mock.revokeGrant.mockResolvedValueOnce({ error: Error('unavailable') });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(approveConsent(ID)).rejects.toMatchObject({ digest: 'NEXT_REDIRECT' });
      expect(mock.approveAuthorization).toHaveBeenCalledOnce();
      expect(warning).toHaveBeenCalledWith('Previous OAuth grant revocation failed');
    } finally {
      warning.mockRestore();
    }
  });

  it('allows denial for a reader only after server checks, without creating a grant', async () => {
    const mock = fixture({ role: 'reader' });
    await expect(denyConsent(ID)).rejects.toMatchObject({ digest: 'NEXT_REDIRECT' });
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.denyAuthorization).toHaveBeenCalledWith(ID, { skipBrowserRedirect: true });
  });

  it('does not approve when the returned OAuth redirect changes host', async () => {
    const mock = fixture();
    mock.approveAuthorization.mockResolvedValue({ data: { redirect_url: 'https://evil.com/callback?code=opaque' }, error: null });
    expect(await approveConsent(ID)).toEqual({ ok: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(mock.rpc).toHaveBeenCalledWith('mcp_disconnect', { p_client_id: CLIENT });
  });

  it('does not approve or deny during a GET render', async () => {
    const mock = fixture();
    const { default: ConsentPage } = await import('@/app/oauth/consent/page');
    const tree = await ConsentPage({ searchParams: Promise.resolve({ authorization_id: ID }) });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('연결 요청 출처:');
    expect(html).toContain('claude.ai');
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.approveAuthorization).not.toHaveBeenCalled();
    expect(mock.denyAuthorization).not.toHaveBeenCalled();
  });

  it('renders login without looking up authorization details for an anonymous visitor', async () => {
    const mock = fixture({ user: null, host: 'https://evil.com/callback' });
    const { default: ConsentPage } = await import('@/app/oauth/consent/page');
    const html = renderToStaticMarkup(await ConsentPage({ searchParams: Promise.resolve({ authorization_id: ID }) }));
    expect(html).toContain('로그인이 필요해요');
    expect(html).toContain('로그인하고 계속');
    expect(html).toContain('연결 요청을 승인하려면 NovelScript에 먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아와요.');
    const loginHref = html.match(/href="([^"]+)"/)?.[1];
    expect(loginHref).toBeDefined();
    const loginUrl = new URL(loginHref!, 'https://novelscript.test');
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('next')).toBe(`/oauth/consent?authorization_id=${ID}`);
    expect(html).not.toContain('Claude');
    expect(html).not.toContain('연결 요청 출처:');
    expect(html).not.toContain('안전하지 않은 연결 요청이에요');
    expect(mock.getUser).toHaveBeenCalledOnce();
    expect(mock.getAuthorizationDetails).not.toHaveBeenCalled();
    expect(mock.approveAuthorization).not.toHaveBeenCalled();
  });

  it('renders the missing-request state when authorization details fail for a signed-in user', async () => {
    const mock = fixture({ detailsError: true });
    const { default: ConsentPage } = await import('@/app/oauth/consent/page');
    const html = renderToStaticMarkup(await ConsentPage({ searchParams: Promise.resolve({ authorization_id: ID }) }));
    expect(html).toContain('연결 요청을 찾을 수 없어요');
    expect(html).not.toContain('로그인이 필요해요');
    expect(mock.getUser).toHaveBeenCalledOnce();
    expect(mock.getAuthorizationDetails).toHaveBeenCalledExactlyOnceWith(ID);
    expect(mock.maybeSingle).not.toHaveBeenCalled();
  });

  it('renders the reader state before the unsafe-host state without denying on GET', async () => {
    const mock = fixture({ role: 'reader', host: 'https://evil.com/callback' });
    const { default: ConsentPage } = await import('@/app/oauth/consent/page');
    const html = renderToStaticMarkup(await ConsentPage({ searchParams: Promise.resolve({ authorization_id: ID }) }));
    expect(html).toContain('작가 계정만 연결할 수 있어요');
    expect(html).not.toContain('안전하지 않은 연결 요청이에요');
    expect(mock.denyAuthorization).not.toHaveBeenCalled();
  });
});

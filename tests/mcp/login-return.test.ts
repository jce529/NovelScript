import { describe, expect, it, vi } from 'vitest';
import { safeReturnPath } from '@/lib/auth/redirect';

const createClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient }));

describe('OAuth login return path', () => {
  it('preserves an origin-relative consent path and ordinary internal paths', () => {
    expect(safeReturnPath('/oauth/consent?authorization_id=abc-123')).toBe('/oauth/consent?authorization_id=abc-123');
    expect(safeReturnPath('/studio/settings')).toBe('/studio/settings');
  });

  it('uses the validated next after a successful social callback and keeps the default home route', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: { user: { id: 'owner', email: 'writer@example.test' } }, error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { deleted_at: null } });
    createClient.mockResolvedValue({ auth: { exchangeCodeForSession }, from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })) });
    const { GET } = await import('@/app/auth/callback/route');
    const good = new URL('https://novelscript.example/auth/callback?code=one');
    good.searchParams.set('next', '/oauth/consent?authorization_id=abc-123');
    expect((await GET(new Request(good))).headers.get('location')).toBe('https://novelscript.example/oauth/consent?authorization_id=abc-123');
    const bad = new URL('https://novelscript.example/auth/callback?code=two');
    bad.searchParams.set('next', '//evil.com');
    expect((await GET(new Request(bad))).headers.get('location')).toBe('https://novelscript.example/');
    expect((await GET(new Request('https://novelscript.example/auth/callback?code=three'))).headers.get('location')).toBe('https://novelscript.example/');
    expect(exchangeCodeForSession).toHaveBeenCalledTimes(3);
  });

  it('defaults an absent or malformed next to home', () => {
    for (const value of [null, '', 'studio', '%2Fstudio', '%', '/%ZZ']) {
      expect(safeReturnPath(value)).toBe('/');
    }
  });

  it('rejects external, protocol-relative, authority, slash and backslash escapes', () => {
    for (const value of [
      'https://evil.com', 'http://evil.com', '//evil.com', '/\\evil.com',
      '/@evil.com', '/path@evil.com', '/foo//evil.com',
      '/%2f%2fevil.com', '/%252f%252fevil.com', '/%5cevil.com',
      '/%255cevil.com', '/%252525252f%252525252fevil.com',
      '/%40evil.com', '/%0aevil.com', '/\u0000evil.com',
    ]) expect(safeReturnPath(value)).toBe('/');
  });
});

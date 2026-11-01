/** Accept only an origin-relative return path supplied through the login flow. */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value) return '/';

  let candidate = value;
  for (let depth = 0; depth < 16; depth += 1) {
    if (!candidate.startsWith('/') || candidate.startsWith('//') ||
        candidate.includes('//') || /[\\@\u0000-\u001f\u007f]/.test(candidate)) return '/';
    if (!candidate.includes('%')) break;
    if (depth === 15) return '/';
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) break;
      candidate = decoded;
    } catch {
      return '/';
    }
  }

  if (!candidate.startsWith('/') || candidate.startsWith('//') ||
      candidate.includes('//') || /[\\@\u0000-\u001f\u007f]/.test(candidate)) return '/';
  try {
    const parsed = new URL(value, 'https://novelscript.invalid');
    return parsed.origin === 'https://novelscript.invalid' ? value : '/';
  } catch {
    return '/';
  }
}

const OAUTH_REDIRECT_HOSTS = new Set(['claude.ai', 'claude.com', 'localhost', '127.0.0.1']);

/** A registered OAuth redirect must use an exact trusted hostname. */
export function allowedOAuthRedirectHost(uri: string): string | null {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password || !OAUTH_REDIRECT_HOSTS.has(parsed.hostname)) return null;
    const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) return null;
    return parsed.hostname;
  } catch {
    return null;
  }
}

export function oauthRedirectHostLabel(uri: string): string {
  try {
    const host = new URL(uri).hostname;
    return host ? host.slice(0, 253) : '확인할 수 없는 주소';
  } catch {
    return '확인할 수 없는 주소';
  }
}

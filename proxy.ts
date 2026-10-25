import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  await supabase.auth.getClaims();

  return response;
}

export const config = {
  // api/payments/toss/webhook is excluded: Toss calls it without a session cookie;
  // it authenticates payment status by a secret-key Toss lookup (05-04).
  // Exactly /mcp and /.well-known/oauth-protected-resource/mcp (optional trailing slash) are
  // excluded: MCP clients send an OAuth bearer (no cookies) and lib/mcp/auth.ts verifies it
  // per call (12-03). Sub-paths and look-alikes (/mcp/x, /mcpx, ...-evil) stay covered.
  // /oauth/consent stays covered so the writer's browser session cookie keeps refreshing.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/payments/toss/webhook$|mcp/?$|\\.well-known/oauth-protected-resource/mcp/?$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

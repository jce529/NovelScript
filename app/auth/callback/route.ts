import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { needsEmailCompletion } from '@/lib/auth/email-guard';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (needsEmailCompletion(data.user)) {
        return NextResponse.redirect(`${origin}/auth/complete-email`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

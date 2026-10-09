import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { needsEmailCompletion } from '@/lib/auth/email-guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAccountActive, softDeleteAccount } from '@/lib/auth/account';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // BUG-01: 예전 방식으로 deleted_at만 찍힌 채 auth가 남은 계정이면, 여기서 탈퇴를 마무리
      // (멱등)하고 세션을 버린다. 다음 로그인부터는 새 계정으로 가입된다.
      const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', data.user.id).maybeSingle();
      if (profile && !isAccountActive(profile)) {
        await softDeleteAccount(createAdminClient(), data.user.id).catch(() => {});
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=account_deleted`);
      }
      if (needsEmailCompletion(data.user)) {
        return NextResponse.redirect(`${origin}/auth/complete-email`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}

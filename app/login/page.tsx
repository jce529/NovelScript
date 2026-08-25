'use client';

import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const supabase = createClient();

  const handleLogin = async (provider: 'google' | 'kakao') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">NovelScript 로그인</h1>
      <button onClick={() => handleLogin('google')} className="rounded border px-4 py-2">
        Google로 계속하기
      </button>
      <button onClick={() => handleLogin('kakao')} className="rounded bg-yellow-300 px-4 py-2">
        카카오로 계속하기
      </button>
    </main>
  );
}

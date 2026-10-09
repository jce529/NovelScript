'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const supabase = createClient();
  const accountDeleted = useSearchParams().get('error') === 'account_deleted';

  const handleLogin = async (provider: 'google' | 'kakao') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">NovelScript 로그인</h1>
      {accountDeleted && (
        <p role="alert" className="text-sm text-destructive">
          이전에 탈퇴한 계정이에요. 탈퇴 처리를 마무리했으니 다시 로그인하면 새 계정으로 시작해요.
        </p>
      )}
      <button onClick={() => handleLogin('google')} className="rounded border px-4 py-2">
        Google로 계속하기
      </button>
      <button onClick={() => handleLogin('kakao')} className="rounded bg-yellow-300 px-4 py-2">
        카카오로 계속하기
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

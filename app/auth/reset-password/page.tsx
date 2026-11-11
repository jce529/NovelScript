import { redirect } from 'next/navigation';
import { ResetPasswordForm } from '@/components/auth/EmailAuthForms';
import { createClient } from '@/lib/supabase/server';

export default async function ResetPasswordPage() {
  // 재설정 메일 링크는 /auth/callback에서 세션으로 바뀐 뒤 여기로 온다.
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/auth/forgot-password');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">새 비밀번호 설정</h1>
      <ResetPasswordForm />
    </main>
  );
}

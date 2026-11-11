import { ForgotPasswordForm } from '@/components/auth/EmailAuthForms';

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">비밀번호 찾기</h1>
      <ForgotPasswordForm />
    </main>
  );
}

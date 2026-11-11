import { SignUpForm } from '@/components/auth/EmailAuthForms';
import { safeReturnPath } from '@/lib/auth/redirect';

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">이메일로 가입</h1>
      <SignUpForm next={safeReturnPath(next)} />
    </main>
  );
}

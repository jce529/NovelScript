import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAccountActive } from '@/lib/auth/account';
import { deleteAccountAction } from './actions';
import { SiteHeader } from '@/components/layout/site-header';
import { listByokKeys } from '@/lib/ai/providers/byok';
import { BYOK_COPY, PROVIDER_LABEL } from '@/lib/ai/providers/byok-copy';
import type { ProviderId } from '@/lib/ai/providers/types';

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, pen_name, pen_name_bio, deleted_at')
    .eq('id', user.id)
    .single();

  // D-08: a soft-deleted account must be treated as logged out on its very next
  // request, even if its access token JWT has not yet expired (see lib/auth/account.ts).
  if (!profile || !isAccountActive(profile)) {
    await supabase.auth.signOut();
    redirect('/login');
  }

  const byokKeys = profile.role === 'writer' ? await listByokKeys(supabase, user.id) : [];

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md p-4 md:p-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">계정 설정</h1>
      <div>
        <p className="text-sm text-gray-500">이메일</p>
        <p>{user.email}</p>
      </div>
      {profile?.role === 'writer' ? (
        <div>
          <p className="text-sm text-gray-500">필명</p>
          <p>{profile.pen_name}</p>
        </div>
      ) : (
        <a href="/write/start" className="underline">글쓰기 시작하기</a>
      )}
      {profile.role === 'writer' && (
        <section aria-labelledby="byok-summary-heading" className="rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <h2 id="byok-summary-heading" className="text-sm font-medium">{BYOK_COPY.sectionHeading}</h2>
            <Link href="/studio/settings/ai-providers" className="text-sm underline">관리하기</Link>
          </div>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {(['openai', 'anthropic', 'gemini'] as ProviderId[]).map((providerId) => {
              const key = byokKeys.find((item) => item.provider === providerId);
              return (
                <li key={providerId} className="flex items-center justify-between">
                  <span>{PROVIDER_LABEL[providerId]}</span>
                  <span className={key?.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                    {key ? `${key.status === 'connected' ? '연결됨' : '확인 필요'} · •••• ${key.maskedHint}` : '등록 안 됨'}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <form action={deleteAccountAction}>
        <button type="submit" className="text-red-600 underline">계정 탈퇴하기</button>
      </form>
      </main>
    </>
  );
}

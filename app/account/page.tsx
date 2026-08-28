import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isAccountActive } from '@/lib/auth/account';
import { deleteAccountAction } from './actions';

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

  return (
    <main className="mx-auto max-w-md p-8 flex flex-col gap-6">
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
      <form action={deleteAccountAction}>
        <button type="submit" className="text-red-600 underline">계정 탈퇴하기</button>
      </form>
    </main>
  );
}

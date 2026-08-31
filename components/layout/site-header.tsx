import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { AccountPanel } from '@/components/layout/account-panel';

export async function SiteHeader() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let displayName = '독자';
  let isWriter = false;
  let balance = 0;

  if (user) {
    const [{ data: profile }, { data: wallet }] = await Promise.all([
      supabase.from('profiles').select('role, pen_name').eq('id', user.id).maybeSingle(),
      supabase.from('wallets').select('balance').eq('id', user.id).maybeSingle(),
    ]);
    isWriter = profile?.role === 'writer';
    displayName = (isWriter && profile?.pen_name) ? profile.pen_name : (user.email?.split('@')[0] ?? '독자');
    balance = Number(wallet?.balance ?? 0);
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <Link href="/" className="text-lg font-semibold">NovelScript</Link>
      {user ? (
        <AccountPanel displayName={displayName} isWriter={isWriter} balance={balance} />
      ) : (
        <Link href="/login" className="text-sm font-medium hover:underline">로그인</Link>
      )}
    </header>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { isAccountActive } from '@/lib/auth/account';
import { allowedOAuthRedirectHost, oauthRedirectHostLabel } from '@/lib/auth/redirect';
import { createClient } from '@/lib/supabase/server';
import { ConsentForm, FocusHeading } from './ConsentForm';

type ConsentDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string };
  user: { id: string };
};

function StateCard({ title, children, warning = false }: { title: string; children: React.ReactNode; warning?: boolean }) {
  return <section className={`flex w-full max-w-md flex-col gap-4 rounded-lg border bg-card p-4 sm:p-6 ${warning ? 'border-destructive/40' : 'border-border'}`}>
    <FocusHeading className={warning ? 'text-destructive' : ''}>{title}</FocusHeading>
    {children}
  </section>;
}

function HomeLink() {
  return <Link href="/" className={buttonVariants({ variant: 'outline', className: 'min-h-11 self-start px-5 font-semibold' })}>NovelScript 홈으로</Link>;
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const authorizationId = (await searchParams).authorization_id;
  let details: ConsentDetails | null = null;
  let approvedUrl: string | null = null;
  const supabase = await createClient();

  const shell = (card: React.ReactNode) => <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-8 sm:gap-12">
    <div className="text-lg font-semibold">NovelScript</div>
    {card}
  </main>;

  if (!authorizationId || authorizationId.length > 512) return shell(<StateCard title="연결 요청을 찾을 수 없어요">
    <p className="text-sm text-muted-foreground break-keep">요청이 만료됐거나 이미 처리됐어요. Claude로 돌아가 커넥터 연결을 처음부터 다시 시도해 주세요.</p>
    <HomeLink />
  </StateCard>);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const next = `/oauth/consent?${new URLSearchParams({ authorization_id: authorizationId })}`;
    const loginHref = `/login?${new URLSearchParams({ next })}`;
    return shell(<StateCard title="로그인이 필요해요">
      <p className="text-sm text-muted-foreground break-keep">연결 요청을 승인하려면 NovelScript에 먼저 로그인해 주세요. 로그인하면 이 화면으로 돌아와요.</p>
      <Link href={loginHref} className={buttonVariants({ className: 'min-h-11 self-start px-5 font-semibold' })}>로그인하고 계속</Link>
    </StateCard>);
  }

  try {
    const result = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
    if (!result.error && result.data) {
      if ('authorization_id' in result.data && result.data.authorization_id === authorizationId) details = result.data;
      else if ('redirect_url' in result.data) approvedUrl = result.data.redirect_url;
    }
  } catch {
    // The same expired-request state covers a failed lookup.
  }

  if (!details && !approvedUrl) return shell(<StateCard title="연결 요청을 찾을 수 없어요">
    <p className="text-sm text-muted-foreground break-keep">요청이 만료됐거나 이미 처리됐어요. Claude로 돌아가 커넥터 연결을 처음부터 다시 시도해 주세요.</p>
    <HomeLink />
  </StateCard>);

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role, pen_name, deleted_at').eq('id', user.id).maybeSingle();
  if (profileError || !profile || !isAccountActive(profile)) redirect('/login');

  if (profile.role !== 'writer') return shell(<StateCard title="작가 계정만 연결할 수 있어요">
    <p className="text-sm text-muted-foreground break-keep">AI 커넥터는 작가 계정에서만 사용할 수 있어요. 작가로 활성화한 뒤 다시 연결해 주세요. 지금은 연결이 만들어지지 않았어요.</p>
    <Link href="/write/start" className={buttonVariants({ className: 'min-h-11 self-start px-5 font-semibold' })}>작가로 활성화하기</Link>
    {details ? <ConsentForm authorizationId={authorizationId!} readerOnly /> : <HomeLink />}
  </StateCard>);

  if (approvedUrl) {
    if (allowedOAuthRedirectHost(approvedUrl)) redirect(approvedUrl);
    return shell(<StateCard title="안전하지 않은 연결 요청이에요" warning>
      <p className="text-sm text-muted-foreground break-keep">이 요청의 연결 대상(<strong className="font-semibold break-all">{oauthRedirectHostLabel(approvedUrl)}</strong>)은 NovelScript가 허용하지 않아요. 연결하지 않았어요. 직접 만든 앱이 아니라면 이 요청을 무시해 주세요.</p>
      <HomeLink />
    </StateCard>);
  }

  if (!details || details.user.id !== user.id) return shell(<StateCard title="연결 요청을 찾을 수 없어요">
    <p className="text-sm text-muted-foreground break-keep">요청이 만료됐거나 이미 처리됐어요. Claude로 돌아가 커넥터 연결을 처음부터 다시 시도해 주세요.</p>
    <HomeLink />
  </StateCard>);

  const host = allowedOAuthRedirectHost(details.redirect_uri);
  if (!host) return shell(<StateCard title="안전하지 않은 연결 요청이에요" warning>
    <p className="text-sm text-muted-foreground break-keep">이 요청의 연결 대상(<strong className="font-semibold break-all">{oauthRedirectHostLabel(details.redirect_uri)}</strong>)은 NovelScript가 허용하지 않아요. 연결하지 않았어요. 직접 만든 앱이 아니라면 이 요청을 무시해 주세요.</p>
    <HomeLink />
  </StateCard>);

  const clientName = [...details.client.name].slice(0, 60).join('');
  return shell(<section className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:p-6">
    <FocusHeading><span className="inline-block max-w-full align-bottom line-clamp-2 break-all">{clientName}</span>에서 NovelScript 계정 연결을 요청했어요</FocusHeading>
    <p className="text-sm break-keep"><strong className="font-semibold">{profile.pen_name}</strong> 님 계정으로 연결돼요</p>
    <div className="flex flex-col gap-3 rounded-md bg-muted p-4">
      <h2 className="text-lg font-semibold">이 연결로 할 수 있는 일</h2>
      <ul className="flex flex-col gap-3">
        <li className="flex items-start gap-3 text-sm"><ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" /><span><strong className="font-semibold">읽기</strong><br />내 작품과 설정집을 읽어요.</span></li>
        <li className="flex items-start gap-3 text-sm"><ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" /><span><strong className="font-semibold">초안 제안 저장</strong><br />AI가 만든 글을 제안된 초안으로 저장해요. 내가 스튜디오에서 수락해야 본문에 반영돼요.</span></li>
      </ul>
    </div>
    <p className="text-xs text-muted-foreground break-keep">내 계정이 아닌 다른 사람의 데이터와 결제·지갑 정보에는 접근하지 않아요.</p>
    <p className="text-xs text-muted-foreground break-keep">언제든 스튜디오 &gt; 설정 &gt; AI 커넥터에서 연결을 해제할 수 있어요. 해제하면 다음 호출부터 차단돼요.</p>
    <p className="text-xs text-muted-foreground break-keep">연결 요청 출처: <strong className="text-lg font-semibold text-foreground break-all">{host}</strong></p>
    <ConsentForm authorizationId={authorizationId!} />
  </section>);
}

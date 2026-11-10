import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { checkWriteAccess } from '@/lib/auth/write-access';
import { listInboxProposals } from '@/lib/proposals/queries';
import { ProposalInbox } from '@/components/proposals/inbox';
import { firstParam, parseInboxKind } from '@/components/proposals/inbox-model';
import { parseQueueFilter } from '@/components/proposals/review-model';

/**
 * Phase 14 (14-11) global review inbox: `/studio/review?status=&kind=&work=&chapter=`. Proposals
 * of every owned work in one list; detail and decisions stay on the per-work routes.
 */
export default async function ReviewInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const filter = parseQueueFilter(query.status);
  const kind = parseInboxKind(query.kind);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [result, access] = await Promise.all([
    listInboxProposals(supabase, user.id, {
      filter, kind, workId: firstParam(query.work), chapterId: firstParam(query.chapter),
    }),
    checkWriteAccess(supabase, user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Link href="/studio" className="inline-flex min-h-11 items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3" /> 스튜디오
        </Link>
        <h1 className="text-2xl font-semibold leading-tight">AI 검토 대기</h1>
        <p className="break-keep text-sm text-muted-foreground">연결된 AI가 보낸 초안과 설정집 제안이 모든 작품에서 모여요. 내가 수락한 부분만 작품에 반영돼요.</p>
      </div>
      <ProposalInbox
        filter={filter}
        kind={kind}
        scope={result.ok ? result.scope : { workId: null, chapterId: null }}
        pendingTotal={result.ok ? result.pendingTotal : 0}
        works={result.ok ? result.works : []}
        proposals={result.ok ? result.proposals : []}
        // eslint-disable-next-line react-hooks/purity -- request-time server render; labels are relative to this request
        now={Date.now()}
        loadError={!result.ok}
        suspended={!access.ok && access.code === 'write_suspended'}
      />
    </div>
  );
}

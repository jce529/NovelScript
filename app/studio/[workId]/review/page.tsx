import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { checkWriteAccess } from '@/lib/auth/write-access';
import { listWorkProposals } from '@/lib/proposals/queries';
import { ProposalQueue } from '@/components/proposals/proposal-queue';
import { parseQueueFilter } from '@/components/proposals/review-model';

/** Phase 14 (MCP-06) work review queue: `/studio/[workId]/review?status=pending|done|all`. */
export default async function ReviewQueuePage({
  params,
  searchParams,
}: {
  params: Promise<{ workId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { workId } = await params;
  const query = await searchParams;
  const filter = parseQueueFilter(query.status);
  const notice = query.notice === 'rejected' ? 'rejected' : null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [result, access] = await Promise.all([
    listWorkProposals(supabase, user.id, workId, filter),
    checkWriteAccess(supabase, user.id),
  ]);
  if (!result.ok && result.reason === 'not_found') notFound();

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        {result.ok && (
          <Link href={`/studio/${workId}`} className="inline-flex min-h-11 items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft aria-hidden className="size-3" /> <span className="break-all">{result.work.title}</span>
          </Link>
        )}
        <h1 className="text-2xl font-semibold leading-tight">리뷰 큐</h1>
        <p className="break-keep text-sm text-muted-foreground">연결된 AI가 보낸 초안과 설정집 제안이에요. 내가 수락한 부분만 작품에 반영돼요.</p>
      </div>
      <ProposalQueue
        workId={workId}
        filter={filter}
        pendingCount={result.ok ? result.pendingCount : 0}
        proposals={result.ok ? result.proposals : []}
        // eslint-disable-next-line react-hooks/purity -- request-time server render; labels are relative to this request
        now={Date.now()}
        loadError={!result.ok}
        suspended={!access.ok && access.code === 'write_suspended'}
        notice={notice}
      />
    </div>
  );
}

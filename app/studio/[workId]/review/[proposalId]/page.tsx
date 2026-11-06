import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getProposalDetail } from '@/lib/proposals/queries';
import { ProposalDetailView } from '@/components/proposals/proposal-detail';
import { formatArrival, queueHref } from '@/components/proposals/review-model';

/** Phase 14 (MCP-06/07) proposal review detail: `/studio/[workId]/review/[proposalId]`. */
export default async function ProposalReviewPage({
  params,
}: {
  params: Promise<{ workId: string; proposalId: string }>;
}) {
  const { workId, proposalId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Always the server's current state (pending / accepted / rejected / expired ...).
  const result = await getProposalDetail(supabase, user.id, workId, proposalId);
  if (!result.ok && result.reason === 'not_found') notFound();
  if (!result.ok) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Link href={queueHref(workId, 'pending')} className="inline-flex min-h-11 items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden className="size-3" /> 리뷰 큐로 돌아가기
        </Link>
        <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">제안을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- request-time server render; label is relative to this request
  const arrivalLabel = formatArrival(result.detail.createdAt, Date.now());
  return <ProposalDetailView key={result.detail.id} detail={result.detail} arrivalLabel={arrivalLabel} />;
}

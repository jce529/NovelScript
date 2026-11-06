import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { listChapters } from '@/lib/chapters/actions';
import { getWorkKbNodes } from '@/lib/kb/actions';
import { buildWorkHomeState } from '@/lib/works/work-home';
import { getReviewPanelStateAction, type ReviewPanelState } from '@/lib/moderation/actions';
import { ReviewRequestPanel } from '@/components/moderation/review-request';
import { WorkHomeContent } from '@/components/studio/work-home-content';

export default async function WorkHomePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const work = user ? await getWork(supabase, { ownerId: user.id, workId }) : null;
  if (!work || !user) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">작품을 찾을 수 없어요</h1>
        <Link href="/studio" className="inline-flex min-h-11 items-center rounded-md text-primary underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          ← 작품 목록
        </Link>
      </div>
    );
  }

  let chapters;
  let kbNodes;
  let reviewState: ReviewPanelState | null;
  try {
    [chapters, kbNodes, reviewState] = await Promise.all([
      listChapters(supabase, { ownerId: user.id, workId }),
      getWorkKbNodes(supabase, { ownerId: user.id, workId }),
      getReviewPanelStateAction(workId, null).catch(() => null),
    ]);
  } catch {
    return <p role="alert">작품 정보를 불러오지 못했어요. 새로고침해 주세요.</p>;
  }

  const target = reviewState?.target;
  const showReviewPanel = target?.ok && (target.state.blinded || target.state.latestRequest?.status === 'open');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {showReviewPanel && reviewState && (
        <ReviewRequestPanel workId={workId} chapterId={null} initialState={reviewState} />
      )}
      <WorkHomeContent workId={workId} title={work.title} synopsis={work.synopsis} state={buildWorkHomeState(chapters, kbNodes)} />
    </div>
  );
}

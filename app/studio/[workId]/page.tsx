import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getWork } from '@/lib/works/actions';
import { getReviewPanelStateAction } from '@/lib/moderation/actions';
import { ReviewRequestPanel } from '@/components/moderation/review-request';

export default async function WorkHomePage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const work = user ? await getWork(supabase, { ownerId: user.id, workId }) : null;
  const reviewState = work ? await getReviewPanelStateAction(workId, null) : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{work?.title}</h1>
      {reviewState && <ReviewRequestPanel workId={workId} chapterId={null} initialState={reviewState} />}
      <p className="text-muted-foreground">{work?.synopsis || ''}</p>
      <Link href={`/studio/${workId}/chapters`} className="underline w-fit">회차 목록으로 이동</Link>
      {/* 18-11: world-tree entry links only; settings and the wizard live on /studio/{id}/world. */}
      {work && (
        <nav aria-label="세계관" className="flex flex-wrap gap-3">
          <Link href={`/studio/${workId}/world`} className="underline w-fit">세계관 설정</Link>
          <Link href={`/studio/${workId}/world#world-branching`} className="underline w-fit">이 세계관에서 가지 치기</Link>
        </nav>
      )}
    </div>
  );
}

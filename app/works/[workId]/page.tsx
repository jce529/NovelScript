import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Settings2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getPublicWork } from '@/lib/works/actions';
import { listPublicChapters } from '@/lib/chapters/actions';
import { getSubscriptionState } from '@/lib/reader/subscriptions';
import { getBookmarkState } from '@/lib/reader/bookmarks';
import { getReadingProgress } from '@/lib/reader/progress';
import { getLikeState, getLikeCount } from '@/lib/reader/likes';
import { WorkHeaderActions } from '@/components/reader/work-header-actions';
import { LikeButton } from '@/components/reader/like-button';
import { ReportDialog } from '@/components/reader/report-dialog';
import { submitReportAction } from '@/app/works/[workId]/actions';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default async function WorkDetailPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const supabase = await createClient();
  const [{ data: { user } }, work] = await Promise.all([
    supabase.auth.getUser(),
    getPublicWork(supabase, { workId }),
  ]);
  if (!work) notFound();

  const [subscribed, bookmarked, chapters, progress, liked, likeCount] = await Promise.all([
    user ? getSubscriptionState(supabase, { workId, userId: user.id }) : Promise.resolve(false),
    user ? getBookmarkState(supabase, { workId, userId: user.id }) : Promise.resolve(false),
    listPublicChapters(supabase, { workId }),
    user ? getReadingProgress(supabase, { workId, userId: user.id }) : Promise.resolve(null),
    user ? getLikeState(supabase, { workId, userId: user.id }) : Promise.resolve(false),
    getLikeCount(supabase, { workId }),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex h-11 items-center justify-between">
        <Link href="/" aria-label="뒤로가기" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
          <ArrowLeft className="size-4" />
        </Link>
        <WorkHeaderActions workId={workId} initialSubscribed={subscribed} initialBookmarked={bookmarked} loggedIn={Boolean(user)} />
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{work.title}</h1>
        {work.genre && <span className="text-sm text-muted-foreground">{work.genre}</span>}
      </div>

      <Tabs defaultValue="intro">
        <TabsList>
          <TabsTrigger value="intro">소개</TabsTrigger>
          <TabsTrigger value="settings">작품설정</TabsTrigger>
          <TabsTrigger value="chapters">회차</TabsTrigger>
        </TabsList>

        <TabsContent value="intro" className="flex flex-col gap-4 pt-4">
          <p className="text-sm text-foreground">{work.synopsis || <span className="text-muted-foreground">아직 작품 소개가 없어요.</span>}</p>
          <div className="flex items-center gap-2">
            <LikeButton workId={workId} initialLiked={liked} initialCount={likeCount} loggedIn={Boolean(user)} />
            <ReportDialog workId={workId} chapterId={null} loggedIn={Boolean(user)} onSubmit={submitReportAction} />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="flex flex-col items-center gap-2 py-16 text-center">
          <Settings2 className="size-6 text-muted-foreground" />
          <h3 className="text-xl font-semibold">작품 설정 준비중</h3>
          <p className="text-muted-foreground">곧 다양한 작품 설정 기능을 만나보실 수 있어요.</p>
        </TabsContent>

        <TabsContent value="chapters" className="flex flex-col gap-4 pt-4">
          <a
            href={chapters.length === 0 ? undefined : `/works/${workId}/chapters/${progress ? progress.chapterId : chapters[0].id}`}
            className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium ${chapters.length === 0 ? 'pointer-events-none bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground'}`}
          >
            {progress ? `이어보기 · ${(chapters.findIndex((c) => c.id === progress.chapterId) + 1) || 1}화부터` : '읽기 시작'}
          </a>
          {chapters.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <h3 className="text-3xl font-semibold">아직 공개된 회차가 없어요</h3>
              <p className="text-muted-foreground">작가가 회차를 준비하고 있어요.</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <a href={`/works/${workId}/chapters/${chapter.id}`} className="flex h-11 items-center gap-2 px-1 text-sm">
                    <span>{chapter.orderIndex + 1}화 {chapter.title}</span>
                    {chapter.locked && <Lock className="size-3 text-muted-foreground" aria-label="유료 회차" />}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}

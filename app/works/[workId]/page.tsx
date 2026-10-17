import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen, EyeOff, Search, Settings2 } from 'lucide-react';
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
import { SiteHeader } from '@/components/layout/site-header';
import { WorkChapterList } from '@/components/reader/work-chapter-list';
import { getWorkReadingStats, getWorkViewCount, resolveResumeChapter } from '@/lib/reader/work-detail';
import { BLINDED_VIEWER_TITLE, BLINDED_WORK_NOTE } from '@/lib/moderation/user-actions';

export default async function WorkDetailPage({ params }: { params: Promise<{ workId: string }> }) {
  const { workId } = await params;
  const supabase = await createClient();
  const [{ data: { user } }, work] = await Promise.all([
    supabase.auth.getUser(),
    getPublicWork(supabase, { workId }),
  ]);
  if (!work) notFound();

  // D-12/D-13: a work-wide blind shows a direct-entry notice with no synopsis, TOC or reader actions.
  if (work.blinded) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          <div className="flex h-11 items-center">
            <Link href="/" aria-label="뒤로가기" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
              <ArrowLeft className="size-4" />
            </Link>
          </div>
          <h1 className="text-xl font-semibold">{work.title}</h1>
          <div role="status" className="flex flex-col items-center gap-2 py-16 text-center">
            <EyeOff className="size-6 text-muted-foreground" aria-hidden />
            <h3 className="text-xl font-semibold">{BLINDED_VIEWER_TITLE}</h3>
            {work.blindReason && <p className="text-muted-foreground">{work.blindReason}</p>}
            <p className="text-sm text-muted-foreground">{BLINDED_WORK_NOTE}</p>
          </div>
        </main>
      </>
    );
  }


  const [subscribed, bookmarked, chapters, progress, liked, likeCount, viewCount] = await Promise.all([
    user ? getSubscriptionState(supabase, { workId, userId: user.id }) : Promise.resolve(false),
    user ? getBookmarkState(supabase, { workId, userId: user.id }) : Promise.resolve(false),
    listPublicChapters(supabase, { workId }),
    user ? getReadingProgress(supabase, { workId, userId: user.id }) : Promise.resolve(null),
    user ? getLikeState(supabase, { workId, userId: user.id }) : Promise.resolve(false),
    getLikeCount(supabase, { workId }),
    getWorkViewCount(supabase, { workId }),
  ]);
  const stats = getWorkReadingStats();
  const resume = resolveResumeChapter(chapters, progress);

  return (
    <>
      {/* Desktop keeps the global header; mobile uses the compact action row below. */}
      <div className="hidden md:block"><SiteHeader /></div>
      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        {/* Fixed top area: report lives here once, outside the tabs, so it stays on every tab. */}
        <div className="flex h-11 items-center justify-between">
          <Link href="/" aria-label="뒤로가기" className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-1">
            <div role="group" aria-label="신고" className="flex items-center">
              <ReportDialog workId={workId} chapterId={null} loggedIn={Boolean(user)} onSubmit={submitReportAction} />
              <span className="hidden text-xs text-muted-foreground md:inline">불일치·표절 신고</span>
            </div>
            <WorkHeaderActions workId={workId} initialSubscribed={subscribed} initialBookmarked={bookmarked} loggedIn={Boolean(user)} />
            <button type="button" disabled aria-label="검색 (준비 중)" className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground md:hidden">
              <Search className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{work.title}</h1>
          {work.genre && <span className="text-sm text-muted-foreground">{work.genre}</span>}
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1"><dt>조회</dt><dd>{viewCount.toLocaleString('ko-KR')}</dd></div>
            <div className="flex gap-1"><dt>좋아요</dt><dd>{likeCount.toLocaleString('ko-KR')}</dd></div>
            <div>{stats.continuationRate === null ? '연독률 집계 중' : `연독률 ${stats.continuationRate}%`}</div>
            <div>{stats.completionRate === null ? '완독률 집계 중' : `완독률 ${stats.completionRate}%`}</div>
          </dl>
        </div>

        <Tabs defaultValue="intro">
          <TabsList>
            <TabsTrigger value="intro">소개</TabsTrigger>
            <TabsTrigger value="chapters">회차</TabsTrigger>
            <TabsTrigger value="lore">세계관</TabsTrigger>
            <TabsTrigger value="reviews">리뷰</TabsTrigger>
          </TabsList>

          <TabsContent value="intro" className="flex flex-col gap-4 pt-4">
            <p className="text-sm text-foreground">{work.synopsis || <span className="text-muted-foreground">아직 작품 소개가 없어요.</span>}</p>
            <div className="flex items-center gap-2">
              <LikeButton workId={workId} initialLiked={liked} initialCount={likeCount} loggedIn={Boolean(user)} />
            </div>
          </TabsContent>

          <TabsContent value="chapters" className="flex flex-col gap-4 pt-4">
            <a
              href={resume ? `/works/${workId}/chapters/${resume.chapterId}` : undefined}
              className={`inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium ${resume ? 'bg-primary text-primary-foreground' : 'pointer-events-none bg-muted text-muted-foreground'}`}
            >
              {resume?.resumed ? `이어보기 · ${resume.orderIndex + 1}화부터` : '읽기 시작'}
            </a>
            <WorkChapterList workId={workId} chapters={chapters} />
          </TabsContent>

          {/* Phase 18 fills the lore slot; keep the value stable. */}
          <TabsContent value="lore" className="flex flex-col items-center gap-2 py-16 text-center">
            <Settings2 className="size-6 text-muted-foreground" />
            <h3 className="text-xl font-semibold">세계관 준비 중</h3>
            <p className="text-muted-foreground">곧 작품의 세계관을 만나보실 수 있어요.</p>
          </TabsContent>

          <TabsContent value="reviews" className="flex flex-col items-center gap-2 py-16 text-center">
            <BookOpen className="size-6 text-muted-foreground" />
            <h3 className="text-xl font-semibold">리뷰 준비 중</h3>
            <p className="text-muted-foreground">곧 독자 리뷰를 만나보실 수 있어요.</p>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

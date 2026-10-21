import { createClient } from '@/lib/supabase/server';
import { listFeed, FEED_PAGE_SIZE, type FeedSortMode, type FeedSortBasis } from '@/lib/discovery/actions';
import { listRecentlyRead } from '@/lib/reader/progress';
import { FeedCard } from '@/components/reader/feed-card';
import { FeedFilters } from '@/components/reader/feed-filters';
import { HorizontalSlider } from '@/components/reader/horizontal-slider';
import { RecentlyReadSection } from '@/components/reader/recently-read-section';
import { Separator } from '@/components/ui/separator';
import { SiteHeader } from '@/components/layout/site-header';

const VALID_BASES: FeedSortBasis[] = ['trending', 'views', 'likes', 'ctr'];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; sortMode?: string; sortBasis?: string }>;
}) {
  const { genre, sortMode: sortModeParam, sortBasis: sortBasisParam } = await searchParams;
  const sortMode: FeedSortMode = sortModeParam === 'latest' ? 'latest' : 'popular';
  const sortBasis: FeedSortBasis = VALID_BASES.includes(sortBasisParam as FeedSortBasis)
    ? (sortBasisParam as FeedSortBasis) : 'trending';

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [allWorks, recentlyRead] = await Promise.all([
    listFeed(supabase, { genre: genre ?? null, sortMode, sortBasis }),
    user ? listRecentlyRead(supabase, { userId: user.id, limit: 10 }) : Promise.resolve([]),
  ]);
  // No "더보기": there is no list route yet, so the home shows the first page only.
  const works = allWorks.slice(0, FEED_PAGE_SIZE);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 py-8">
        <RecentlyReadSection loggedIn={Boolean(user)} items={recentlyRead} />
        <Separator className="mt-8" />
        <section id="weekly-ranking" className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Weekly Ranking</span>
          <h2 className="text-xl font-semibold">주간 랭킹</h2>
        </section>

        <FeedFilters genre={genre ?? '전체'} sortMode={sortMode} sortBasis={sortBasis} />

        {works.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <h2 className="text-3xl font-semibold">아직 등록된 작품이 없어요</h2>
            <p className="text-muted-foreground">곧 새로운 이야기가 찾아올게요.</p>
          </div>
        ) : (
          <HorizontalSlider label="주간 랭킹 목록">
            {works.map((work) => (
              <div key={work.id} className="w-40 shrink-0 snap-start sm:w-44">
                <FeedCard work={work} />
              </div>
            ))}
          </HorizontalSlider>
        )}

        <section id="rookie-quota" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">루키 쿼터존</h2>
          <div className="rounded-lg border border-dashed border-border bg-secondary p-6 text-center text-sm text-muted-foreground">
            루키 쿼터존은 준비 중이에요. 곧 새로운 작가들의 작품을 소개할게요.
          </div>
        </section>

        <section id="hall-of-fame" className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">명예의 전당</h2>
          <div className="rounded-lg border border-dashed border-border bg-secondary p-6 text-center text-sm text-muted-foreground">
            명예의 전당은 준비 중이에요. 독자 리뷰가 쌓이면 이곳에서 만나볼 수 있어요.
          </div>
        </section>
      </main>
    </>
  );
}

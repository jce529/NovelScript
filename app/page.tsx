import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { listFeed, FEED_PAGE_SIZE, type FeedSortMode, type FeedSortBasis } from '@/lib/discovery/actions';
import { listRecentlyRead } from '@/lib/reader/progress';
import { FeedCard } from '@/components/reader/feed-card';
import { FeedFilters } from '@/components/reader/feed-filters';
import { PromoBanner } from '@/components/reader/promo-banner';
import { RecentlyReadSection } from '@/components/reader/recently-read-section';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SiteHeader } from '@/components/layout/site-header';

const VALID_BASES: FeedSortBasis[] = ['trending', 'views', 'likes', 'ctr'];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; sortMode?: string; sortBasis?: string; limit?: string }>;
}) {
  const { genre, sortMode: sortModeParam, sortBasis: sortBasisParam, limit: limitParam } = await searchParams;
  const sortMode: FeedSortMode = sortModeParam === 'latest' ? 'latest' : 'popular';
  const sortBasis: FeedSortBasis = VALID_BASES.includes(sortBasisParam as FeedSortBasis)
    ? (sortBasisParam as FeedSortBasis) : 'trending';
  // "더보기" grows the visible feed in FEED_PAGE_SIZE steps via ?limit=.
  const requestedLimit = Number.parseInt(limitParam ?? '', 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > FEED_PAGE_SIZE
    ? Math.ceil(requestedLimit / FEED_PAGE_SIZE) * FEED_PAGE_SIZE
    : FEED_PAGE_SIZE;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [allWorks, recentlyRead] = await Promise.all([
    listFeed(supabase, { genre: genre ?? null, sortMode, sortBasis }),
    user ? listRecentlyRead(supabase, { userId: user.id, limit: 10 }) : Promise.resolve([]),
  ]);
  const works = allWorks.slice(0, limit);

  const moreParams = new URLSearchParams();
  if (genre) moreParams.set('genre', genre);
  if (sortModeParam) moreParams.set('sortMode', sortModeParam);
  if (sortBasisParam) moreParams.set('sortBasis', sortBasisParam);
  moreParams.set('limit', String(limit + FEED_PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <PromoBanner />
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
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {works.map((work) => <FeedCard key={work.id} work={work} />)}
          </div>
          {allWorks.length > works.length && (
            <div className="flex justify-center">
              <Link href={`/?${moreParams.toString()}`} scroll={false} className={buttonVariants({ variant: 'outline' })}>
                더보기
              </Link>
            </div>
          )}
        </>
      )}
      </main>
    </>
  );
}

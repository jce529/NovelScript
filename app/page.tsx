import { createClient } from '@/lib/supabase/server';
import { listFeed, type FeedSortMode, type FeedSortBasis } from '@/lib/discovery/actions';
import { listRecentlyRead } from '@/lib/reader/progress';
import { FeedCard } from '@/components/reader/feed-card';
import { FeedFilters } from '@/components/reader/feed-filters';
import { PromoBanner } from '@/components/reader/promo-banner';
import { RecentlyReadSection } from '@/components/reader/recently-read-section';
import { Separator } from '@/components/ui/separator';

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
  const [works, recentlyRead] = await Promise.all([
    listFeed(supabase, { genre: genre ?? null, sortMode, sortBasis }),
    user ? listRecentlyRead(supabase, { userId: user.id, limit: 10 }) : Promise.resolve([]),
  ]);

  return (
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {works.map((work) => <FeedCard key={work.id} work={work} />)}
        </div>
      )}
    </main>
  );
}

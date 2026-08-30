import Link from 'next/link';
import type { RecentlyReadItem } from '@/lib/reader/progress';

/** D-15(b). Renders null entirely when logged out — no guest reading history exists
 * per D-14, so there is nothing to show (not the same as the "no history yet" empty
 * state, which only applies to a logged-in reader). */
export function RecentlyReadSection({ loggedIn, items }: { loggedIn: boolean; items: RecentlyReadItem[] }) {
  if (!loggedIn) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">최근 읽은 작품</h2>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <h3 className="text-3xl font-semibold">아직 읽은 작품이 없어요</h3>
          <p className="text-muted-foreground">관심 있는 작품을 찾아 첫 화를 읽어보세요.</p>
          <a href="#weekly-ranking" className="mt-2 inline-flex h-8 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">작품 둘러보기</a>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {items.map((item) => (
            <Link key={item.workId} href={`/works/${item.workId}`} className="flex w-32 shrink-0 flex-col gap-1">
              <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
                {item.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.coverImageUrl} alt={item.workTitle} loading="lazy" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <span className="line-clamp-1 text-sm">{item.workTitle}</span>
              <span className="text-xs text-muted-foreground">{item.chapterOrderIndex + 1}화 읽는 중</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

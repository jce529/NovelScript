import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Eye, Heart, Flame } from 'lucide-react';
import { formatKoreanCount } from '@/lib/format/korean-count';
import type { FeedWork } from '@/lib/discovery/actions';

export function FeedCard({ work }: { work: FeedWork }) {
  return (
    <Link
      href={`/works/${work.id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-secondary p-2 transition-colors hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
        {work.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={work.coverImageUrl} alt={work.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">표지 없음</div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground">{work.title}</h3>
        {work.synopsis && <p className="line-clamp-2 text-xs text-muted-foreground">{work.synopsis}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {work.genre && <Badge variant="secondary">{work.genre}</Badge>}
          <Tooltip>
            <TooltipTrigger
              render={
                <Badge variant="secondary" className="gap-1">
                  <Flame className="text-primary" />
                  인기 {work.trendingScore}
                </Badge>
              }
            />
            <TooltipContent>조회수·좋아요·다음화 이동률을 종합한 점수예요</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Eye className="size-3" />{formatKoreanCount(work.viewCount)}</span>
          <span className="flex items-center gap-1"><Heart className="size-3" />{formatKoreanCount(work.likeCount)}</span>
        </div>
      </div>
    </Link>
  );
}

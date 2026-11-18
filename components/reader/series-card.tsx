import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface SeriesCardWork {
  id: string;
  title: string;
  coverImageUrl: string | null;
  authorName: string | null;
  genre: string | null;
  publishedChapterCount: number;
}

export interface SeriesCardProps {
  work: SeriesCardWork;
  href?: string;
  badge?: 'new' | 'completed' | null;
  priceLabel?: string | null;
  overlay?: ReactNode;
  corner?: ReactNode;
  footer?: ReactNode;
  size?: 'default' | 'compact';
  priority?: boolean;
}

const focusRingClass =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function SeriesCard({
  work,
  href,
  badge = null,
  priceLabel = null,
  overlay,
  corner,
  footer,
  size = 'default',
  priority = false,
}: SeriesCardProps) {
  const targetHref = href ?? `/works/${work.id}`;
  const authorDisplay = work.authorName?.trim() ? work.authorName.trim() : '작가';
  const hasOverlay = overlay !== undefined && overlay !== null && overlay !== false;
  const hasCorner = corner !== undefined && corner !== null && corner !== false;
  const hasFooter = footer !== undefined && footer !== null && footer !== false;
  const isCompact = size === 'compact';

  return (
    <Link
      href={targetHref}
      data-slot="series-card"
      data-size={size}
      className={cn(
        'group flex min-w-0 flex-col rounded-lg transition-colors motion-reduce:transition-none active:opacity-80',
        focusRingClass,
        isCompact
          ? 'gap-1 border-0 bg-transparent p-0'
          : 'gap-1 border-0 bg-transparent p-0 sm:gap-2 sm:border sm:border-border sm:bg-secondary sm:p-2 sm:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]',
      )}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-muted">
        {work.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={work.coverImageUrl}
            alt={work.title}
            loading={priority ? 'eager' : 'lazy'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs leading-[1.5] font-normal text-muted-foreground">
            표지 없음
          </div>
        )}

        {hasOverlay ? (
          <div data-slot="series-card-overlay" className="absolute top-0 left-0 z-10">
            {overlay}
          </div>
        ) : badge === 'completed' || badge === 'new' ? (
          <span
            data-slot="series-card-badge"
            data-badge={badge}
            className={cn(
              'absolute top-2 left-2 z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-[1.2] font-semibold',
              badge === 'completed'
                ? 'bg-foreground text-background'
                : 'bg-primary text-primary-foreground',
            )}
          >
            {badge === 'completed' ? '완결' : 'NEW'}
          </span>
        ) : null}

        {hasCorner ? (
          <div data-slot="series-card-corner" className="absolute top-2 right-2 z-10">
            {corner}
          </div>
        ) : null}
      </div>

      <div className={cn('flex min-w-0 flex-col', isCompact ? 'gap-1' : 'gap-1 sm:gap-2')}>
        <h3
          className={cn(
            'line-clamp-2 leading-[1.2] font-semibold text-foreground',
            isCompact ? 'text-xs' : 'text-xs sm:text-sm',
          )}
        >
          {work.title}
        </h3>

        <p
          data-slot="series-card-author"
          className={cn(
            'truncate leading-[1.5] font-normal text-muted-foreground',
            isCompact ? 'text-[11px]' : 'text-[11px] sm:text-xs',
          )}
        >
          {authorDisplay}
        </p>

        {isCompact ? (
          <p
            data-slot="series-card-meta"
            className="truncate text-[11px] leading-[1.5] font-normal text-muted-foreground"
          >
            {work.genre
              ? `${work.genre} · ${work.publishedChapterCount}화`
              : `${work.publishedChapterCount}화`}
          </p>
        ) : (
          <div
            data-slot="series-card-meta"
            className="flex min-w-0 items-center gap-1 truncate text-[11px] leading-[1.5] text-muted-foreground sm:flex-wrap sm:gap-2 sm:text-xs"
          >
            {work.genre ? (
              <Badge
                variant="secondary"
                className="max-sm:h-auto max-sm:rounded-none max-sm:bg-transparent max-sm:p-0 max-sm:text-[11px] max-sm:font-normal max-sm:text-muted-foreground sm:text-xs sm:font-normal"
              >
                {work.genre}
              </Badge>
            ) : null}
            {work.genre ? (
              <span aria-hidden="true" className="text-[11px] text-muted-foreground sm:hidden">
                ·
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className="max-sm:h-auto max-sm:rounded-none max-sm:bg-transparent max-sm:p-0 max-sm:text-[11px] max-sm:font-normal max-sm:text-muted-foreground sm:text-xs sm:font-normal"
            >
              {`${work.publishedChapterCount}화`}
            </Badge>
          </div>
        )}

        {priceLabel ? (
          <p
            data-slot="series-card-price"
            className={cn(
              'truncate leading-[1.5] font-semibold',
              isCompact ? 'text-[11px]' : 'text-[11px] sm:text-xs',
              priceLabel === '무료' ? 'text-muted-foreground' : 'text-primary',
            )}
          >
            {priceLabel}
          </p>
        ) : null}

        {hasFooter ? (
          <div data-slot="series-card-footer" className="min-w-0">
            {footer}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

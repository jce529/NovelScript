import Link from 'next/link';
import { Inbox } from 'lucide-react';
import {
  INBOX_PATH, countBadgeText, headerLinkAriaLabel, headerLinkShowsBadge,
} from './inbox-model';

/**
 * Studio header entry (A) to the global review inbox. Always rendered inside the studio; a count
 * failure (null) or 0 simply omits the number, it never hides the link or blocks the studio.
 * Below `sm` only the icon and number show; the name stays available to screen readers.
 */
export function HeaderReviewLink({ count }: { count: number | null }) {
  return (
    <Link
      href={INBOX_PATH}
      aria-label={headerLinkAriaLabel(count)}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Inbox aria-hidden className="size-4" />
      <span className="max-sm:sr-only">AI 검토 대기</span>
      {headerLinkShowsBadge(count) && (
        <span aria-hidden className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
          {countBadgeText(count)}
        </span>
      )}
    </Link>
  );
}

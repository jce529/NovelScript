import type { InboxKind, ProposalFilter } from '@/lib/proposals/queries';

/**
 * Phase 14 (14-11) global review inbox: URL <-> state helpers and labels. The URL is the whole
 * state (`status`, `kind`, `work`, `chapter`), so every tab and chip is a plain link.
 */
export const INBOX_PATH = '/studio/review';
export const INBOX_KINDS: InboxKind[] = ['all', 'draft', 'kb'];

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  all: '전체',
  draft: '초안',
  kb: '설정집',
};

export function parseInboxKind(value: string | string[] | undefined): InboxKind {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'draft' || raw === 'kb' ? raw : 'all';
}

export function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export interface InboxQuery {
  status?: ProposalFilter;
  kind?: InboxKind;
  workId?: string | null;
  chapterId?: string | null;
}

/** Defaults (pending / all / no scope) are left out so shared links stay short. */
export function inboxHref({ status = 'pending', kind = 'all', workId = null, chapterId = null }: InboxQuery = {}): string {
  const params = new URLSearchParams();
  if (status !== 'pending') params.set('status', status);
  if (kind !== 'all') params.set('kind', kind);
  if (workId) params.set('work', workId);
  if (workId && chapterId) params.set('chapter', chapterId);
  const query = params.toString();
  return query ? `${INBOX_PATH}?${query}` : INBOX_PATH;
}

const isShown = (count: number | null | undefined): count is number => typeof count === 'number' && Number.isInteger(count) && count > 0;

export const countBadgeText = (count: number) => (count > 99 ? '99+' : String(count));

/** Header entry (A): always present so the history stays reachable; the number only when > 0. */
export const headerLinkAriaLabel = (count: number | null | undefined) => (isShown(count) ? `AI 검토 대기 ${count}건` : 'AI 검토 이력');
export const headerLinkShowsBadge = isShown;

/** Chapter tree entry (B): a sibling link next to the chapter link. */
export const chapterBadgeAriaLabel = (title: string, count: number) => `${title}에 온 AI 초안 ${count}건 검토`;
export const chapterInboxHref = (workId: string, chapterId: string) => inboxHref({ workId, chapterId });

export function inboxResultStatus(count: number): string {
  return count === 0 ? '조건에 맞는 제안이 없어요.' : `${count}건`;
}

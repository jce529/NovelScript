/** Client-safe reader header navigation constants and route classification (READ-01, LIST-01). */
import { GENRES } from '@/lib/works/genres';

export type ReaderMainTab = 'free' | 'paid' | 'ranking' | 'library';
export type ReaderSeriesSubKey = 'all' | 'new' | 'popular' | 'completed';

export interface ReaderSubItem {
  key: string;
  label: string;
  /** null = destination does not exist yet; rendered as a disabled "준비 중" item. */
  href: string | null;
  sub?: ReaderSeriesSubKey;
}

export interface ReaderMainTabDef {
  key: ReaderMainTab;
  label: string;
  href: string | null;
}

export const READER_MAIN_TABS: readonly ReaderMainTabDef[] = [
  { key: 'free', label: '무료연재', href: '/series/free' },
  { key: 'paid', label: '유료연재', href: '/series/paid' },
  { key: 'ranking', label: '랭킹', href: null },
  { key: 'library', label: '내서재', href: null },
] as const;

const LIST_SUB = (kind: 'free' | 'paid'): ReaderSubItem[] => [
  { key: `${kind}-all`, label: '전체', href: `/series/${kind}`, sub: 'all' },
  { key: `${kind}-new`, label: '신작', href: `/series/${kind}?sub=new`, sub: 'new' },
  { key: `${kind}-popular`, label: '인기', href: `/series/${kind}?sub=popular`, sub: 'popular' },
  { key: `${kind}-completed`, label: '완결', href: `/series/${kind}?sub=completed`, sub: 'completed' },
];

/** Connected destinations for Phase 21 series lists and home weekly-ranking anchor; unimplemented tabs stay null. */
export const READER_SUB_ROWS: Readonly<Record<ReaderMainTab, readonly ReaderSubItem[]>> = {
  free: LIST_SUB('free'),
  paid: LIST_SUB('paid'),
  ranking: [
    { key: 'weekly', label: '주간 랭킹', href: '/#weekly-ranking' },
    { key: 'rookie', label: '루키 쿼터존', href: null },
    { key: 'hall', label: '명예의 전당', href: null },
    { key: 'ranking-completed', label: '완결작', href: null },
  ],
  library: [
    { key: 'continue', label: '이어 읽기', href: null },
    { key: 'favorites', label: '선호작', href: null },
    { key: 'alerts', label: '알림 구독', href: null },
    { key: 'owned', label: '소장함', href: null },
  ],
};

export type HeaderVariant = 'reader' | 'viewer' | 'compact';

const COMPACT_PREFIXES = ['/studio', '/admin', '/account', '/write', '/start'];

function normalizePath(pathname: string | null | undefined): string {
  return (pathname ?? '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** reader: home, work detail, series list, and reader discovery routes (two-tier header). viewer: chapter viewer. compact: one-line header. */
export function getHeaderVariant(pathname: string | null | undefined): HeaderVariant {
  const path = normalizePath(pathname);
  if (COMPACT_PREFIXES.some((p) => matchesPrefix(path, p))) return 'compact';
  if (/^\/works\/[^/]+\/chapters\/[^/]+$/.test(path)) return 'viewer';
  if (
    path === '/' ||
    /^\/works\/[^/]+$/.test(path) ||
    path === '/series/free' ||
    path === '/series/paid' ||
    matchesPrefix(path, '/search') ||
    matchesPrefix(path, '/author')
  ) {
    return 'reader';
  }
  return 'compact';
}

/**
 * Derives the active main tab from pathname:
 * - `/search` and `/author/[id]` (`/author` subtree): `null` (hide sub row, all main tabs inactive)
 * - `/series/free`, `/series/paid`: `'free'`, `'paid'`
 * - All other reader routes (`/`, `/works/[id]`, etc.): `'free'` fallback
 */
export function getActiveMainTab(pathname: string | null | undefined): ReaderMainTab | null {
  const path = normalizePath(pathname);
  if (matchesPrefix(path, '/search') || matchesPrefix(path, '/author')) {
    return null;
  }
  if (matchesPrefix(path, '/series/paid')) {
    return 'paid';
  }
  if (matchesPrefix(path, '/series/free')) {
    return 'free';
  }
  return 'free';
}

export function getMainTabHref(tab: ReaderMainTab): string | null {
  const found = READER_MAIN_TABS.find((t) => t.key === tab);
  return found?.href ?? null;
}

export function getActiveSubKey(subParam: string | null | undefined): ReaderSeriesSubKey {
  if (subParam === 'new' || subParam === 'popular' || subParam === 'completed') {
    return subParam;
  }
  return 'all';
}

/**
 * Builds the href for a sub-row item, preserving a valid `genre` query parameter
 * while removing `sort` and `page` (UI-SPEC §1 & §10).
 */
export function buildSubRowHref(
  item: ReaderSubItem,
  searchParams?: URLSearchParams | Pick<URLSearchParams, 'get'> | string | null,
): string | null {
  if (!item.href) return null;
  if (!item.sub) return item.href;

  let rawGenre: string | null = null;
  if (typeof searchParams === 'string') {
    rawGenre = new URLSearchParams(searchParams).get('genre');
  } else if (searchParams && typeof searchParams.get === 'function') {
    rawGenre = searchParams.get('genre');
  }

  const validGenre =
    rawGenre && (GENRES as readonly string[]).includes(rawGenre) ? rawGenre : null;

  const basePath = item.href.split('?')[0];
  const params = new URLSearchParams();
  if (item.sub !== 'all') {
    params.set('sub', item.sub);
  }
  if (validGenre) {
    params.set('genre', validGenre);
  }

  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function getSubRow(tab: ReaderMainTab): readonly ReaderSubItem[] {
  return READER_SUB_ROWS[tab];
}

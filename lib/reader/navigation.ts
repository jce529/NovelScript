/** Client-safe reader header navigation constants and route classification (READ-01). */

export type ReaderMainTab = 'free' | 'paid' | 'ranking' | 'library';

export interface ReaderSubItem {
  key: string;
  label: string;
  /** null = destination does not exist yet; rendered as a disabled "준비 중" item. */
  href: string | null;
}

export interface ReaderMainTabDef {
  key: ReaderMainTab;
  label: string;
}

export const READER_MAIN_TABS: readonly ReaderMainTabDef[] = [
  { key: 'free', label: '무료연재' },
  { key: 'paid', label: '유료연재' },
  { key: 'ranking', label: '랭킹' },
  { key: 'library', label: '내서재' },
] as const;

const LIST_SUB = (prefix: string): ReaderSubItem[] => [
  { key: `${prefix}-all`, label: '전체', href: null },
  { key: `${prefix}-new`, label: '신작', href: null },
  { key: `${prefix}-popular`, label: '인기', href: null },
  { key: `${prefix}-completed`, label: '완결', href: null },
];

/** Only anchors that exist on the home page are linked; the rest stay disabled until their phase lands. */
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

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** reader: home + work detail (two-tier header). viewer: chapter viewer (own chrome). compact: one-line header. */
export function getHeaderVariant(pathname: string | null | undefined): HeaderVariant {
  const path = (pathname ?? '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (COMPACT_PREFIXES.some((p) => matchesPrefix(path, p))) return 'compact';
  if (/^\/works\/[^/]+\/chapters\/[^/]+$/.test(path)) return 'viewer';
  if (path === '/' || /^\/works\/[^/]+$/.test(path)) return 'reader';
  return 'compact';
}

export function getSubRow(tab: ReaderMainTab): readonly ReaderSubItem[] {
  return READER_SUB_ROWS[tab];
}

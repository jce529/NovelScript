import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { IF_TITLE, ROOT_TITLE, ids, ownerTree, readerNormalTree, readerPrivateRootTree, readerRepublishedTree } from './fixtures';

// 18-11: reader lore slot, standalone world-tree page and studio entry points.
// Real browser 4-tab DOM integration and live RPCs are verified in 18-12.

const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  getWorldTree: vi.fn(),
  loadPopularity: vi.fn(),
  work: vi.fn(),
  refresh: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

const supabase = vi.hoisted(() => ({ marker: 'session-client' }));

vi.mock('next/navigation', () => ({
  notFound: m.notFound,
  redirect: m.redirect,
  useRouter: () => ({ refresh: m.refresh, push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/studio/x/world',
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    ...supabase,
    auth: { getUser: m.getUser },
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.is = () => Promise.resolve({ data: [] });
      return q;
    },
  }),
}));
vi.mock('@/lib/world-tree/queries', async (orig) => ({
  ...(await orig<typeof import('@/lib/world-tree/queries')>()),
  getWorldTree: m.getWorldTree,
}));
vi.mock('@/lib/world-tree/metric-adapter', async (orig) => ({
  ...(await orig<typeof import('@/lib/world-tree/metric-adapter')>()),
  loadWorldTreePopularity: m.loadPopularity,
}));
// Work detail page dependencies (03-08 shell), same doubles as tests/reader/work-detail-shell.
vi.mock('@/lib/works/actions', () => ({ getPublicWork: m.work, getWork: vi.fn() }));
vi.mock('@/lib/chapters/actions', () => ({ listPublicChapters: async () => [] }));
vi.mock('@/lib/reader/subscriptions', () => ({ getSubscriptionState: async () => false }));
vi.mock('@/lib/reader/bookmarks', () => ({ getBookmarkState: async () => false }));
vi.mock('@/lib/reader/progress', () => ({ getReadingProgress: async () => null }));
vi.mock('@/lib/reader/likes', () => ({ getLikeState: async () => false, getLikeCount: async () => 0 }));
vi.mock('@/lib/reader/work-detail', () => ({
  getWorkReadingStats: () => ({ continuationRate: null, completionRate: null }),
  getWorkViewCount: async () => 0,
  resolveResumeChapter: () => null,
}));
vi.mock('@/app/works/[workId]/actions', () => ({ submitReportAction: vi.fn() }));
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => React.createElement('header', { 'data-site-header': '1' }) }));
vi.mock('@/components/reader/work-header-actions', () => ({ WorkHeaderActions: () => null }));
vi.mock('@/components/reader/like-button', () => ({ LikeButton: () => null }));
vi.mock('@/components/reader/report-dialog', () => ({ ReportDialog: () => React.createElement('button', { 'data-report-dialog': '1' }) }));
vi.mock('@/components/reader/work-chapter-list', () => ({ WorkChapterList: () => null }));
vi.mock('@/app/studio/[workId]/world/actions', () => ({
  getReaderPreviewAction: vi.fn(),
  ensureWorldTreeAction: vi.fn(),
  getBranchEligibilityAction: vi.fn(),
  beginBranchAction: vi.fn(),
  getBranchDiffAction: vi.fn(),
  confirmBranchAction: vi.fn(),
  deleteBranchAction: vi.fn(),
  markBranchNoticeReadAction: vi.fn(),
}));

import WorkDetailPage from '@/app/works/[workId]/page';
import WorldTreePage from '@/app/works/[workId]/world-tree/page';
import { WorldTreeTab, loadReaderWorldTree } from '@/components/world-tree/world-tree-tab';

type El = { type?: unknown; props?: Record<string, unknown> } | null | undefined;

function walk(node: unknown, visit: (el: NonNullable<El>) => boolean): NonNullable<El> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = walk(child, visit);
      if (hit) return hit;
    }
    return null;
  }
  const el = node as NonNullable<El>;
  if (visit(el)) return el;
  return walk(el.props?.children, visit);
}
const findValue = (tree: unknown, value: string) => walk(tree, (el) => el.props?.value === value);
const findType = (tree: unknown, type: unknown) => walk(tree, (el) => el.type === type);

const ok = <P,>(mode: 'reader' | 'owner' | 'admin', projection: P) => ({ ok: true as const, status: 'ok' as const, mode, projection });
const note = { kind: 'feed-proxy-v1' as const, temporary: true as const, authorViewsExcludedSince: '2026-10-01T00:00:00Z', limitations: ['임시 점수예요.'] };
const scored = (scores: Record<string, number>) => ({ ok: true as const, scores, note });

const WID = ids.ifWork;
const work = { id: WID, title: IF_TITLE, synopsis: '줄거리', genre: '판타지', ownerId: ids.owner, blinded: false, blindReason: null };

const detail = (workId = WID) => WorkDetailPage({ params: Promise.resolve({ workId }) });
const tabHtml = async (workId = WID) => renderToStaticMarkup(await WorldTreeTab({ workId }));
const page = (workId = WID) => WorldTreePage({ params: Promise.resolve({ workId }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: 'reader-1' } }, error: null });
  m.work.mockResolvedValue(work);
  m.getWorldTree.mockResolvedValue(ok('reader', readerNormalTree));
  m.loadPopularity.mockResolvedValue(scored({ n0: 80, n1: 40, n2: 10 }));
});

describe('work detail lore slot (03-08 shell)', () => {
  it('renders WorldTreeTab inside the lore tab and keeps the other three tabs', async () => {
    const tree = await detail();
    const lore = findValue(tree, 'lore');
    expect(lore).not.toBeNull();
    const tab = findType(lore, WorldTreeTab);
    expect(tab?.props?.workId).toBe(WID);
    for (const value of ['intro', 'chapters', 'reviews']) expect(findValue(tree, value)).not.toBeNull();
    expect(JSON.stringify(lore?.props?.children ?? null)).not.toContain('세계관 준비 중');
  });

  it('keeps the single report outside the tabs', async () => {
    const tree = await detail();
    const tabs = walk(tree, (el) => el.props?.defaultValue === 'intro');
    expect(tabs).not.toBeNull();
    expect(walk(tabs, (el) => el.props?.workId === WID && 'onSubmit' in (el.props ?? {}))).toBeNull();
    expect(walk(tree, (el) => 'onSubmit' in (el.props ?? {}) && el.props?.chapterId === null)).not.toBeNull();
  });

  it('keeps the blinded branch: no tabs and no world tree', async () => {
    m.work.mockResolvedValue({ ...work, blinded: true, blindReason: '검토 중' });
    const tree = await detail();
    expect(findValue(tree, 'lore')).toBeNull();
    expect(findType(tree, WorldTreeTab)).toBeNull();
    expect(m.getWorldTree).not.toHaveBeenCalled();
  });

  it('a missing/unpublished work is notFound before any world-tree query', async () => {
    m.work.mockResolvedValue(null);
    await expect(detail()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.getWorldTree).not.toHaveBeenCalled();
  });
});

describe('WorldTreeTab', () => {
  it('assembles the reader projection with the single metric adapter and links to the large view', async () => {
    const html = await tabHtml();
    expect(m.getWorldTree).toHaveBeenCalledTimes(1);
    expect(m.getWorldTree).toHaveBeenCalledWith(expect.objectContaining({ marker: 'session-client' }), { workId: WID });
    expect(m.loadPopularity).toHaveBeenCalledWith(expect.objectContaining({ marker: 'session-client' }), readerNormalTree.nodes);
    expect(html).toContain(`${ROOT_TITLE} 세계수`);
    expect(html).toContain(`href="/works/${WID}/world-tree"`);
    expect(html).toContain('크게 보기');
    expect(html).toContain('산식은 임시안');
    expect(html).toContain('(임시 지수)');
  });

  it('a published child under an unpublished root shows the stub with no root id, title or link', async () => {
    m.getWorldTree.mockResolvedValue(ok('reader', readerPrivateRootTree));
    m.loadPopularity.mockResolvedValue(scored({ n1: 30 }));
    const html = await tabHtml();
    expect(html).toContain(`${IF_TITLE} 세계수`);
    expect(html).toContain('비공개된 본작 자리');
    expect(html).not.toContain(ROOT_TITLE);
    expect(html).not.toContain(ids.rootWork);
    expect(html).not.toContain(ids.rootBranch);
    expect(html).toContain(`/works/${ids.ifWork}`);
  });

  it('restores the normal fruit after the root republishes (re-fetch)', async () => {
    m.getWorldTree.mockResolvedValue(ok('reader', readerRepublishedTree));
    const html = await tabHtml();
    expect(html).toContain(ROOT_TITLE);
    expect(html).not.toContain('비공개된 본작 자리');
  });

  it('an owner/admin viewer on the reader surface gets the server reader projection, never the owner one', async () => {
    m.getUser.mockResolvedValue({ data: { user: { id: ids.owner } }, error: null });
    m.getWorldTree.mockImplementation(async (_s: unknown, input: { readerPreview?: boolean }) =>
      input.readerPreview ? ok('reader', readerPrivateRootTree) : ok('owner', ownerTree));
    const html = await tabHtml();
    expect(m.getWorldTree).toHaveBeenLastCalledWith(expect.anything(), { workId: WID, readerPreview: true });
    expect(html).not.toContain(ROOT_TITLE);
    expect(html).not.toContain(ids.rootWork);
    expect(html).toContain(`href="/studio/${WID}/world"`);
  });

  it('fails closed when the reader re-projection is not a reader projection', async () => {
    m.getWorldTree.mockResolvedValue(ok('owner', ownerTree));
    const html = await tabHtml();
    expect(html).not.toContain(ROOT_TITLE);
    expect(html).not.toContain(IF_TITLE);
    expect(html).toContain('세계수를 불러오지 못했어요. 다시 시도해 주세요.');
    expect(m.loadPopularity).not.toHaveBeenCalled();
  });

  it('passes loader errors to the tab error state with retry', async () => {
    m.getWorldTree.mockResolvedValue({ ok: false, code: 'rpc_failed', retryable: true, error: 'x' });
    const html = await tabHtml();
    expect(html).toContain('세계수를 불러오지 못했어요. 다시 시도해 주세요.');
    expect(html).toContain('다시 불러오기');
  });

  it('a metric adapter failure keeps the tree and notes the default fruit size', async () => {
    m.loadPopularity.mockResolvedValue({ ok: false, code: 'rpc_failed', retryable: true, error: 'x' });
    const html = await tabHtml();
    expect(html).toContain(`${ROOT_TITLE} 세계수`);
    expect(html).toContain('data-part="metric-failed"');
  });

  it('a thrown metric adapter is also a metric failure, not a page crash', async () => {
    m.loadPopularity.mockRejectedValue(new Error('boom'));
    const html = await tabHtml();
    expect(html).toContain('data-part="metric-failed"');
  });

  it('unavailable renders a neutral notice without titles', async () => {
    m.getWorldTree.mockResolvedValue({ ok: true, status: 'unavailable' });
    const html = await tabHtml();
    expect(html).toContain('세계수에 보일 작품이 없어요');
    expect(html).not.toContain(ROOT_TITLE);
  });
});

describe('loadReaderWorldTree', () => {
  it('rejects an invalid work id without calling the RPC', async () => {
    const result = await loadReaderWorldTree(supabase as never, 'not-a-uuid');
    expect(result.status).toBe('unavailable');
    expect(m.getWorldTree).not.toHaveBeenCalled();
  });
});

describe('/works/[workId]/world-tree standalone page', () => {
  it('renders the same reader projection with the site header and no large-view link', async () => {
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('data-site-header');
    expect(html).toContain(`${ROOT_TITLE} 세계수`);
    expect(html).toContain(`href="/works/${WID}"`);
    expect(html).not.toContain(`href="/works/${WID}/world-tree"`);
  });

  it('an unpublished/draft/blinded entry is notFound (same as the general unavailable)', async () => {
    m.getWorldTree.mockResolvedValue({ ok: true, status: 'unavailable' });
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('an invalid id is notFound without an RPC call', async () => {
    await expect(page('nope')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.getWorldTree).not.toHaveBeenCalled();
  });

  it('entering by a published child resolves the tree on the server and never leaks the private root', async () => {
    m.getWorldTree.mockResolvedValue(ok('reader', readerPrivateRootTree));
    const html = renderToStaticMarkup(await page(ids.ifWork));
    expect(m.getWorldTree).toHaveBeenCalledWith(expect.anything(), { workId: ids.ifWork });
    expect(html).not.toContain(ROOT_TITLE);
    expect(html).not.toContain(ids.rootWork);
  });

  it('a loader error shows the error state with retry instead of notFound', async () => {
    m.getWorldTree.mockResolvedValue({ ok: false, code: 'rpc_failed', retryable: true, error: 'x' });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('다시 불러오기');
  });
});

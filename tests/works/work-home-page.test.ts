import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildWorkHomeState } from '@/lib/works/work-home';
import { WorkHomeContent } from '@/components/studio/work-home-content';

const m = vi.hoisted(() => ({
  getUser: vi.fn(), getWork: vi.fn(), listChapters: vi.fn(), getWorkKbNodes: vi.fn(), reviewState: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: m.getUser } }) }));
vi.mock('@/lib/works/actions', () => ({ getWork: m.getWork }));
vi.mock('@/lib/chapters/actions', () => ({ listChapters: m.listChapters }));
vi.mock('@/lib/kb/actions', () => ({ getWorkKbNodes: m.getWorkKbNodes }));
vi.mock('@/lib/moderation/actions', () => ({ getReviewPanelStateAction: m.reviewState }));
vi.mock('@/components/moderation/review-request', () => ({
  ReviewRequestPanel: () => createElement('div', { 'data-review-panel': 'true' }),
}));

import WorkHomePage from '@/app/studio/[workId]/page';

const workId = 'work-1';
const ownedWork = { id: workId, title: '달빛 아래의 서재', synopsis: '짧은 소개' };
const settingNode = { node_type: 'file', category: 'setting' };
const normalReview = { target: { ok: true, state: { blinded: false, blindReason: null, latestRequest: null } }, writeDenied: null };
const renderPage = async () => renderToStaticMarkup(await WorkHomePage({ params: Promise.resolve({ workId }) }));
const renderContent = (chapters: { is_published: boolean }[], kbNodes: typeof settingNode[] = []) =>
  renderToStaticMarkup(createElement(WorkHomeContent, {
    workId, title: ownedWork.title, synopsis: ownedWork.synopsis, state: buildWorkHomeState(chapters, kbNodes),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
  m.getWork.mockResolvedValue(ownedWork);
  m.listChapters.mockResolvedValue([]);
  m.getWorkKbNodes.mockResolvedValue([]);
  m.reviewState.mockResolvedValue(normalReview);
});

describe('owned work home server boundary', () => {
  it('does not query chapters, KB, or review before ownership succeeds', async () => {
    m.getWork.mockResolvedValue(null);
    const html = await renderPage();
    expect(m.getWork).toHaveBeenCalledWith(expect.anything(), { ownerId: 'owner-1', workId });
    expect(m.listChapters).not.toHaveBeenCalled();
    expect(m.getWorkKbNodes).not.toHaveBeenCalled();
    expect(m.reviewState).not.toHaveBeenCalled();
    expect(html).toContain('작품을 찾을 수 없어요');
    expect(html).toContain('href="/studio"');
    expect(html).not.toContain(ownedWork.title);
  });

  it('does not query any work data for an anonymous visitor', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } });
    expect(await renderPage()).toContain('작품을 찾을 수 없어요');
    expect(m.getWork).not.toHaveBeenCalled();
    expect(m.listChapters).not.toHaveBeenCalled();
    expect(m.getWorkKbNodes).not.toHaveBeenCalled();
    expect(m.reviewState).not.toHaveBeenCalled();
  });

  it('passes only chapters and KB to the home projection; review failure leaves the home visible', async () => {
    m.listChapters.mockResolvedValue([{ is_published: false }]);
    m.getWorkKbNodes.mockResolvedValue([settingNode]);
    m.reviewState.mockRejectedValue(new Error('review unavailable'));
    const html = await renderPage();
    expect(m.listChapters).toHaveBeenCalledWith(expect.anything(), { ownerId: 'owner-1', workId });
    expect(m.getWorkKbNodes).toHaveBeenCalledWith(expect.anything(), { ownerId: 'owner-1', workId });
    expect(m.reviewState).toHaveBeenCalledWith(workId, null);
    expect(html).toContain('연재 시작 가이드');
    expect(html).not.toContain('data-review-panel');
    expect(html).not.toContain('작품 정보를 불러오지 못했어요');
  });

  it('keeps review UI only for blinded and open requests', async () => {
    expect(await renderPage()).not.toContain('data-review-panel');
    m.reviewState.mockResolvedValueOnce({ target: { ok: true, state: { blinded: true, blindReason: '검토 중', latestRequest: null } }, writeDenied: null });
    expect(await renderPage()).toContain('data-review-panel');
    m.reviewState.mockResolvedValueOnce({ target: { ok: true, state: { blinded: false, blindReason: null, latestRequest: { status: 'open' } } }, writeDenied: null });
    expect(await renderPage()).toContain('data-review-panel');
  });
});

describe('work home presentation', () => {
  it('shows the large first-serialization guide without counts for an empty work', () => {
    const html = renderContent([]);
    expect(html).toContain('연재 시작 가이드');
    expect(html).toContain('1 / 4 완료');
    expect(html).toContain('aria-valuenow="1"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="4"');
    expect(html).toContain('<ol');
    expect(html).toContain('href="/studio/work-1/world"');
    expect(html).toContain('세계관 보기');
    expect(html).not.toContain('<dl');
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
    expect(html).toContain('작업 화면 4개');
  });

  it('shows 2+1 mobile counts and the current guide step after a draft chapter', () => {
    const html = renderContent([{ is_published: false }], [settingNode]);
    expect(html).toContain('grid-cols-2');
    expect(html).toContain('col-span-2 lg:col-span-1');
    expect(html).toContain('lg:grid-cols-3');
    expect(html).toContain('3 / 4 완료');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('첫 회차 공개하기');
    expect(html).toContain('열기 →');
    expect(html).toContain('min-h-11 w-full');
    expect(html).toContain('rounded-full');
  });

  it('replaces the guide with four linked work screens when first publication is done', () => {
    const html = renderContent([{ is_published: true }], [settingNode]);
    expect(html).not.toContain('연재 시작 가이드');
    expect(html).not.toContain('<details');
    expect(html).toContain('<h2 id="work-home-shortcuts-heading"');
    for (const route of ['chapters', 'world', 'world/timeline', 'world#world-branching']) {
      expect(html).toContain(`href="/studio/${workId}/${route}"`);
    }
    expect(html.match(/class="group flex min-h-11/g)).toHaveLength(4);
    expect(html).toContain('grid-cols-1');
    expect(html).toContain('max-w-[960px]');
    expect(html).not.toContain('심사 요청');
  });

  it('omits the synopsis line when absent and wraps long titles', () => {
    const html = renderToStaticMarkup(createElement(WorkHomeContent, {
      workId, title: '가'.repeat(120), synopsis: null, state: buildWorkHomeState([], []),
    }));
    expect(html).toContain('break-words');
    expect(html).not.toContain('line-clamp-2');
  });
});

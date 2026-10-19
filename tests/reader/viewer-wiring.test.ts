import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { encodeViewerPreferences, DEFAULT_VIEWER_PREFERENCES } from '@/lib/reader/viewer-preferences';

const hoisted = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  user: { id: 'u1' } as { id: string } | null,
  chapter: null as unknown,
  toc: [] as unknown[],
  readingState: vi.fn(),
  subscription: vi.fn(),
  progressOptions: [] as Array<Record<string, unknown>>,
  toggle: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'ns_viewer' && hoisted.cookieValue ? { value: hoisted.cookieValue } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: hoisted.user } }) } }),
}));
vi.mock('@/lib/chapters/actions', () => ({
  getPublicChapter: async () => hoisted.chapter,
  listPublicChapters: async () => hoisted.toc,
}));
vi.mock('@/lib/works/actions', () => ({ getPublicWork: async () => ({ id: 'w1' }) }));
vi.mock('@/lib/reader/chapter-reading', () => ({ getChapterReadingState: hoisted.readingState }));
vi.mock('@/lib/reader/subscriptions', () => ({ getSubscriptionState: hoisted.subscription }));
vi.mock('@/app/works/[workId]/chapters/[chapterId]/actions', () => ({
  submitReportAction: vi.fn(),
  purchaseChapterAction: vi.fn(),
  trackChapterOpenAction: vi.fn(),
}));
vi.mock('@/app/works/[workId]/actions', () => ({ toggleSubscriptionAction: hoisted.toggle }));
vi.mock('@/components/payment/token-topup-provider', () => ({ useTokenTopup: () => ({ openTopup: () => {} }) }));
vi.mock('@/lib/access/actions',() => ({ UNAVAILABLE_CONTENT_MESSAGE: '볼 수 없는 회차예요.' }));
vi.mock('@/components/reader/use-reading-progress', () => ({
  useReadingProgress: (o: Record<string, unknown>) => {
    hoisted.progressOptions.push(o);
    return { sessionId: o.sessionId, restoring: false, flush: vi.fn() };
  },
}));

import ViewerPage, { viewport } from '@/app/works/[workId]/chapters/[chapterId]/page';
import { ViewerShell } from '@/components/reader/viewer-shell';

const item = (id: string, i: number) => ({ id, title: `T${i}`, orderIndex: i, accessState: 'readable', priceTier: null });
const baseChapter = {
  id: 'c2', workId: 'w1', title: 'Second', orderIndex: 1, content: 'SECRET-BODY', accessState: 'readable',
  entitled: false, blindScope: null, blindReason: null, priceTier: null,
};
const noopReport = async () => ({ ok: true });

function shellProps(over: Record<string, unknown> = {}) {
  return {
    workId: 'w1',
    chapter: baseChapter,
    prev: item('c1', 0),
    next: item('c3', 2),
    toc: [item('c1', 0), item('c2', 1), item('c3', 2)],
    loggedIn: true,
    onSubmitReport: noopReport,
    initialPreferences: DEFAULT_VIEWER_PREFERENCES,
    initialReadingState: null,
    initialSubscribed: false,
    ...over,
  } as unknown as Parameters<typeof ViewerShell>[0];
}
const html = (over?: Record<string, unknown>) => renderToStaticMarkup(createElement(ViewerShell, shellProps(over)));

beforeEach(() => {
  hoisted.cookieValue = undefined;
  hoisted.user = { id: 'u1' };
  hoisted.chapter = baseChapter;
  hoisted.toc = [item('c1', 0), item('c2', 1), item('c3', 2)];
  hoisted.readingState.mockReset().mockResolvedValue(null);
  hoisted.subscription.mockReset().mockResolvedValue(false);
  hoisted.toggle.mockReset();
  hoisted.progressOptions.length = 0;
});

async function pageElement() {
  const el = (await ViewerPage({ params: Promise.resolve({ workId: 'w1', chapterId: 'c2' }) })) as ReactElement<Record<string, unknown>>;
  expect(isValidElement(el)).toBe(true);
  return el;
}

describe('ViewerPage wiring', () => {
  it('decodes the ns_viewer cookie into initialPreferences', async () => {
    hoisted.cookieValue = encodeViewerPreferences({ ...DEFAULT_VIEWER_PREFERENCES, font: 'serif', mode: 'dark', fontSize: 24 });
    const el = await pageElement();
    expect(el.props.initialPreferences).toMatchObject({ font: 'serif', mode: 'dark', fontSize: 24 });
    expect(el.key).toBe('c2');
  });

  it('falls back to defaults without a cookie and exports viewportFit cover', async () => {
    const el = await pageElement();
    expect(el.props.initialPreferences).toEqual(DEFAULT_VIEWER_PREFERENCES);
    expect(viewport).toEqual({ viewportFit: 'cover' });
  });

  it('loads reading state only for a logged-in reader of a readable chapter', async () => {
    hoisted.readingState.mockResolvedValue({ scrollRatio: 0.4 });
    expect((await pageElement()).props.initialReadingState).toEqual({ scrollRatio: 0.4 });

    hoisted.readingState.mockClear();
    hoisted.user = null;
    expect((await pageElement()).props.initialReadingState).toBeNull();
    expect(hoisted.readingState).not.toHaveBeenCalled();

    hoisted.user = { id: 'u1' };
    hoisted.chapter = { ...baseChapter, accessState: 'purchase_required', content: null, priceTier: 3 };
    expect((await pageElement()).props.initialReadingState).toBeNull();
    expect(hoisted.readingState).not.toHaveBeenCalled();
  });

  it('reading-state failure falls back to null; subscription state is passed through', async () => {
    hoisted.readingState.mockRejectedValue(new Error('boom'));
    hoisted.subscription.mockResolvedValue(true);
    const el = await pageElement();
    expect(el.props.initialReadingState).toBeNull();
    expect(el.props.initialSubscribed).toBe(true);
  });

  it('keeps notFound for a wrong workId/chapterId pair', async () => {
    hoisted.chapter = { ...baseChapter, workId: 'other' };
    await expect(pageElement()).rejects.toThrow('NOT_FOUND');
  });

  it('passes prev/next from the TOC', async () => {
    const el = await pageElement();
    expect((el.props.prev as { id: string }).id).toBe('c1');
    expect((el.props.next as { id: string }).id).toBe('c3');
  });
});

describe('ViewerShell wiring', () => {
  it('applies the five preference variables and theme/font data attributes', () => {
    const out = html({ initialPreferences: { font: 'serif', mode: 'dark', fontSize: 24, padding: 32, lineHeight: 2.2 } });
    expect(out).toContain('--viewer-size:24px');
    expect(out).toContain('--viewer-lh:2.2');
    expect(out).toContain('--viewer-pad:32px');
    expect(out).toContain('data-viewer-font="serif"');
    expect(out).toContain('data-viewer-theme="dark"');
  });

  it('starts with hidden inert bars and a keyboard menu control', () => {
    const out = html();
    expect(out).toContain('읽기 메뉴 열기');
    expect(out).toContain('aria-hidden="true"');
    expect(out).toMatch(/<header[^>]*inert/);
    expect(out).toContain('-translate-y-full');
    expect(out).toContain('댓글 (준비 중)');
  });

  it('hands the hook the same session id, body ref, sentinel and readable gate', () => {
    html();
    const o = hoisted.progressOptions.at(-1)!;
    expect(o).toMatchObject({ chapterId: 'c2', workId: 'w1', readable: true, loggedIn: true });
    expect(typeof o.sessionId).toBe('string');
    expect(o.bodyRef).toBeDefined();
    expect(o.sentinelRef).toBeDefined();
    expect(o.initialState).toBeUndefined(); // waits for the open snapshot
  });

  it('prev/next links are scroll=false Links; first chapter disables prev', () => {
    const out = html({ prev: null });
    expect(out).not.toContain('href="/works/w1/chapters/c1"><');
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('href="/works/w1/chapters/c3"');
  });

  it('last chapter next is a button, not a link', () => {
    const out = html({ next: null });
    expect(out).not.toContain('href="/works/w1/chapters/c3"');
    expect(out).toMatch(/<button[^>]*>다음화<\/button>/);
  });

  it('blinded and purchase_required never render content and disable the controller', () => {
    for (const chapter of [
      { ...baseChapter, accessState: 'blinded', content: 'SECRET-BODY', blindReason: 'r' },
      { ...baseChapter, accessState: 'purchase_required', content: null, priceTier: 3 },
      { ...baseChapter, accessState: 'unavailable', content: null },
    ]) {
      const out = html({ chapter });
      expect(out).not.toContain('SECRET-BODY');
      expect(hoisted.progressOptions.at(-1)!.readable).toBe(false);
    }
    expect(html({ chapter: { ...baseChapter, accessState: 'purchase_required', content: null, priceTier: 3 } })).toContain('3 토큰으로 소장');
  });

  it('readable content renders and guests keep the controller off', () => {
    expect(html()).toContain('SECRET-BODY');
    html({ loggedIn: false });
    expect(hoisted.progressOptions.at(-1)!.loggedIn).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthorWork } from '@/lib/author/types';

const mocks = vi.hoisted(() => ({
  client: vi.fn(), user: vi.fn(), profile: vi.fn(), stats: vi.fn(), works: vi.fn(),
  state: vi.fn(), toggle: vi.fn(), revalidate: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.client }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/author/queries', async (original) => ({
  ...await original<typeof import('@/lib/author/queries')>(),
  getAuthorProfile: mocks.profile, getAuthorStats: mocks.stats, listAuthorWorks: mocks.works,
}));
vi.mock('@/lib/author/subscriptions', () => ({
  getAuthorSubscriptionState: mocks.state, toggleAuthorSubscription: mocks.toggle,
}));

import { AUTHOR_PAGE_SIZE } from '@/lib/author/queries';
import { buildAuthorPageHref, mergeAuthorWorks } from '@/components/author/author-page';
import { authorSubscriptionState, beginAuthorSubscription, settleAuthorSubscription } from '@/components/author/author-subscribe-button';
import { loadAuthorPageData, loadAuthorWorksAction, toggleAuthorSubscriptionAction } from '@/app/author/[authorId]/actions';

const authorId = '28000000-0000-4000-8000-000000000001';
const readerId = '28000000-0000-4000-8000-000000000002';
const profile = { authorId, penName: '달빛', penNameBio: null };
const stats = { workCount: 13, ongoingCount: 7, completedCount: 6, subscriberCount: 1 };
const work = (n: number) => ({ id: `28100000-0000-4000-8000-${String(n).padStart(12, '0')}` }) as AuthorWork;
const firstItems = Array.from({ length: AUTHOR_PAGE_SIZE }, (_, index) => work(index + 1));
const firstPage = { items: firstItems, totalCount: 13, nextOffset: 12 };
const client = { auth: { getUser: mocks.user } } as unknown as SupabaseClient;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue(client);
  mocks.user.mockResolvedValue({ data: { user: { id: readerId } }, error: null });
  mocks.profile.mockResolvedValue({ ok: true, profile });
  mocks.stats.mockResolvedValue({ ok: true, stats });
  mocks.works.mockResolvedValue({ ok: true, page: firstPage });
  mocks.state.mockResolvedValue({ ok: true, notify: false });
  mocks.toggle.mockResolvedValue({ ok: true, notify: false, subscriberCount: 0 });
});

describe('author page cross-layer contract (Node)', () => {
  it('restores a canonical filter URL while the page loader discards an incoming offset', async () => {
    const href = buildAuthorPageHref(authorId, { status: 'completed', sort: 'popular', offset: 36 });
    expect(href).toBe(`/author/${authorId}?status=completed&sort=popular`);
    const search = Object.fromEntries(new URL(href, 'https://example.test').searchParams);
    expect(await loadAuthorPageData(authorId, { ...search, offset: '36' }))
      .toMatchObject({ kind: 'ready', page: firstPage, notify: false });
    expect(mocks.works).toHaveBeenCalledWith(client, authorId,
      { status: 'completed', sort: 'popular', offset: 0 });
    expect(mocks.state).toHaveBeenCalledWith(client, authorId);
  });

  it('loads the final page publicly, merges an overlapping item once and has no next offset', async () => {
    const finalPage = { items: [work(12), work(13)], totalCount: 13, nextOffset: null };
    mocks.works.mockResolvedValueOnce({ ok: true, page: finalPage });
    expect(await loadAuthorWorksAction(authorId, { status: 'all', sort: 'popular', offset: '12' }))
      .toEqual({ ok: true, page: finalPage });
    expect(mocks.works).toHaveBeenCalledWith(client, authorId,
      { status: 'all', sort: 'popular', offset: 12 });
    expect(mocks.user).not.toHaveBeenCalled();
    const merged = mergeAuthorWorks(firstItems, finalPage.items);
    expect(merged.items.map(({ id }) => id)).toEqual([...firstItems, work(13)].map(({ id }) => id));
    expect(merged.firstAddedId).toBe(work(13).id);
    expect(merged.addedCount).toBe(1);
  });

  it('keeps notify=false as a subscription row while committing authoritative 1/0/1 counts', async () => {
    let state = authorSubscriptionState(false, 0);
    for (const [notify, count] of [[true, 1], [false, 0], [true, 1]] as const) {
      const pending = beginAuthorSubscription(state);
      expect(pending.pending).toBe(true);
      state = settleAuthorSubscription(pending, { ok: true, notify, subscriberCount: count });
      expect(state).toMatchObject({ notify, subscriberCount: count, pending: false, previous: null });
    }
    mocks.toggle.mockResolvedValueOnce({ ok: true, notify: false, subscriberCount: 0 });
    expect(await toggleAuthorSubscriptionAction(authorId)).toEqual({ ok: true, notify: false, subscriberCount: 0 });
    expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual([`/author/${authorId}`, '/library']);
  });

  it('fails closed when authentication lookup errors and keeps the public page readable', async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: readerId } }, error: { message: 'private auth detail' } });
    expect(await loadAuthorPageData(authorId, {}))
      .toMatchObject({ kind: 'ready', loggedIn: false, isSelf: false, notify: false });
    expect(mocks.state).not.toHaveBeenCalled();
    const denied = await toggleAuthorSubscriptionAction(authorId);
    expect(denied).toMatchObject({ ok: false, code: 'auth_required' });
    expect(JSON.stringify(denied)).not.toContain('private auth detail');
    expect(mocks.toggle).not.toHaveBeenCalled();
  });

  it('does not call the subscription API for self and maps a forbidden result to safe copy', async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: { id: authorId } }, error: null });
    expect(await toggleAuthorSubscriptionAction(authorId)).toMatchObject({ ok: false, code: 'unavailable' });
    expect(mocks.toggle).not.toHaveBeenCalled();
    mocks.toggle.mockResolvedValueOnce({ ok: false, code: 'write_forbidden', error: 'private SQL message' });
    const denied = await toggleAuthorSubscriptionAction(authorId);
    expect(denied).toMatchObject({ ok: false, code: 'write_forbidden' });
    expect(JSON.stringify(denied)).not.toContain('private SQL message');
    expect(mocks.revalidate).not.toHaveBeenCalled();
    const rolledBack = settleAuthorSubscription(beginAuthorSubscription(authorSubscriptionState(true, 1)), denied);
    expect(rolledBack).toMatchObject({ notify: true, subscriberCount: 1, pending: false });
  });
});

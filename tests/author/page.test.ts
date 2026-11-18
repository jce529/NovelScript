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

import { buildAuthorPageHref, mergeAuthorWorks, normalizeAuthorPageQuery } from '@/components/author/author-page';
import { beginAuthorSubscription, settleAuthorSubscription, authorSubscriptionState } from '@/components/author/author-subscribe-button';
import { loadAuthorPageData, loadAuthorWorksAction, toggleAuthorSubscriptionAction } from '@/app/author/[authorId]/actions';
import { getPublicWorkAuthor } from '@/lib/works/actions';
import { getActiveMainTab, getHeaderVariant } from '@/lib/reader/navigation';

const id = '28000000-0000-4000-8000-000000000001';
const other = '28000000-0000-4000-8000-000000000002';
const profile = { authorId: id, penName: '달빛', penNameBio: null };
const stats = { workCount: 1, ongoingCount: 1, completedCount: 0, subscriberCount: 9 };
const page = { items: [], totalCount: 1, nextOffset: null };
const client = { auth: { getUser: mocks.user } } as unknown as SupabaseClient;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue(client);
  mocks.user.mockResolvedValue({ data: { user: { id: other } }, error: null });
  mocks.profile.mockResolvedValue({ ok: true, profile });
  mocks.stats.mockResolvedValue({ ok: true, stats });
  mocks.works.mockResolvedValue({ ok: true, page });
  mocks.state.mockResolvedValue({ ok: true, notify: false });
  mocks.toggle.mockResolvedValue({ ok: true, notify: true, subscriberCount: 10 });
});

describe('author URL and list state (Node, no rendering)', () => {
  it('normalizes status, sort and offset without coercing arrays or unsafe numbers', () => {
    expect(normalizeAuthorPageQuery({ status: 'completed', sort: 'popular', offset: '12' }))
      .toEqual({ status: 'completed', sort: 'popular', offset: 12 });
    for (const offset of [-1, '1.5', Infinity, '9007199254740992', ['12']]) {
      expect(normalizeAuthorPageQuery({ status: ['ongoing'], sort: 'bad', offset }))
        .toEqual({ status: 'all', sort: 'updated', offset: 0 });
    }
  });
  it('resets pagination on filter changes and produces canonical share URLs', () => {
    expect(buildAuthorPageHref(id, { status: 'completed', sort: 'new', offset: 24 }))
      .toBe(`/author/${id}?status=completed&sort=new`);
    expect(buildAuthorPageHref(id, { status: 'bad', sort: ['popular'] })).toBe(`/author/${id}`);
  });
  it('appends each new work once while retaining order and the first new focus target', () => {
    const work = (id: string) => ({ id } as AuthorWork);
    const first = [work('a'), work('b')];
    const result = mergeAuthorWorks(first, [work('b'), work('c'), work('c'), work('d')]);
    expect(result.items.map((w) => w.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.firstAddedId).toBe('c');
    expect(result.addedCount).toBe(2);
    expect(first).toHaveLength(2);
    expect(mergeAuthorWorks(first, [work('a')]).firstAddedId).toBeNull();
  });
  it('uses the reader header with no active main tab for author URLs', () => {
    expect(getHeaderVariant(`/author/${id}`)).toBe('reader');
    expect(getActiveMainTab(`/author/${id}`)).toBeNull();
  });
});

describe('optimistic subscription state', () => {
  it('treats retained notify=false as unsubscribed and prevents duplicate pending toggles', () => {
    const before = authorSubscriptionState(false, 9);
    const pending = beginAuthorSubscription(before);
    expect(pending).toMatchObject({ notify: true, subscriberCount: 10, pending: true });
    expect(beginAuthorSubscription(pending)).toBe(pending);
    expect(before.notify).toBe(false);
  });
  it('decrements without negative counts and commits authoritative server values', () => {
    const pending = beginAuthorSubscription(authorSubscriptionState(true, 0));
    expect(pending.subscriberCount).toBe(0);
    expect(settleAuthorSubscription(pending, { ok: true, notify: false, subscriberCount: 18 }))
      .toMatchObject({ notify: false, subscriberCount: 18, pending: false, error: null });
  });
  it.each(['write_suspended', 'write_forbidden', 'unavailable'] as const)('rolls back both values for %s', (code) => {
    const result = settleAuthorSubscription(beginAuthorSubscription(authorSubscriptionState(false, 9)),
      { ok: false, code, error: 'private database details' });
    expect(result).toMatchObject({ notify: false, subscriberCount: 9, pending: false });
    expect(result.error).not.toContain('private');
    expect(result.error).toBe(code === 'unavailable'
      ? '구독 설정을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요'
      : '계정이 정지되어 알림 구독을 바꿀 수 없어요. 문의가 필요하면 고객센터를 이용해 주세요');
  });
  it('restores an enabled subscription after failure and permits retry', () => {
    const failed = settleAuthorSubscription(beginAuthorSubscription(authorSubscriptionState(true, 9)),
      { ok: false, code: 'unavailable', error: '' });
    expect(failed).toMatchObject({ notify: true, subscriberCount: 9 });
    expect(beginAuthorSubscription(failed)).toMatchObject({ notify: false, subscriberCount: 8, error: null });
  });
  it('returns login guidance when the session expires', () => {
    const failed = settleAuthorSubscription(beginAuthorSubscription(authorSubscriptionState(false, 9)),
      { ok: false, code: 'auth_required', error: '' });
    expect(failed).toMatchObject({ notify: false, subscriberCount: 9, loginRequired: true, error: null });
  });
});

describe('public author page data', () => {
  it('rejects invalid UUIDs before creating a client', async () => {
    expect(await loadAuthorPageData('bad', {})).toEqual({ kind: 'not_found' });
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it('allows anonymous public reads without reading subscription state', async () => {
    mocks.user.mockResolvedValue({ data: { user: null }, error: null });
    expect(await loadAuthorPageData(id, {})).toMatchObject({ kind: 'ready', loggedIn: false, isSelf: false, notify: false });
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.works).toHaveBeenCalledWith(client, id, { status: 'all', sort: 'updated', offset: 0 });
  });
  it('identifies self without reading or toggling a subscription', async () => {
    mocks.user.mockResolvedValue({ data: { user: { id } }, error: null });
    expect(await loadAuthorPageData(id, {})).toMatchObject({ kind: 'ready', isSelf: true });
    expect(mocks.state).not.toHaveBeenCalled();
  });
  it('maps the public API not_found result to the shared missing-author branch', async () => {
    mocks.profile.mockResolvedValue({ ok: false, code: 'not_found', error: '' });
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'not_found' });
  });
  it('uses the persisted notify value for a logged-in reader', async () => {
    mocks.state.mockResolvedValue({ ok: true, notify: true });
    expect(await loadAuthorPageData(id, {})).toMatchObject({ kind: 'ready', loggedIn: true, isSelf: false, notify: true });
    expect(mocks.state).toHaveBeenCalledWith(client, id);
  });
  it('distinguishes a missing stats response from an unavailable one', async () => {
    mocks.stats.mockResolvedValueOnce({ ok: false, code: 'not_found', error: '' });
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'not_found' });
    mocks.stats.mockResolvedValueOnce({ ok: false, code: 'unavailable', error: 'secret' });
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'unavailable' });
  });
  it('defensively treats zero public works as not found', async () => {
    mocks.stats.mockResolvedValue({ ok: true, stats: { ...stats, workCount: 0 } });
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'not_found' });
  });
  it('keeps a filter with zero matches available and loads only the first twelve', async () => {
    mocks.works.mockResolvedValue({ ok: true, page: { ...page, totalCount: 0 } });
    expect(await loadAuthorPageData(id, { status: 'completed', offset: '999' })).toMatchObject({ kind: 'ready' });
    expect(mocks.works).toHaveBeenCalledWith(client, id, { status: 'completed', sort: 'updated', offset: 0 });
  });
  it('returns retry state for public query, subscription query or client failures', async () => {
    mocks.works.mockResolvedValueOnce({ ok: false, code: 'unavailable', error: 'secret' });
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'unavailable' });
    mocks.state.mockResolvedValueOnce({ ok: false, code: 'unavailable', error: 'secret' });
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'unavailable' });
    mocks.client.mockRejectedValueOnce(new Error('secret'));
    expect(await loadAuthorPageData(id, {})).toEqual({ kind: 'unavailable' });
  });
});

describe('author server actions', () => {
  it('requires a verified session and blocks self-subscription before the toggle API', async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await toggleAuthorSubscriptionAction(id)).toMatchObject({ ok: false, code: 'auth_required' });
    mocks.user.mockResolvedValueOnce({ data: { user: { id } }, error: null });
    expect(await toggleAuthorSubscriptionAction(id)).toMatchObject({ ok: false, code: 'unavailable' });
    expect(mocks.toggle).not.toHaveBeenCalled();
  });
  it('rejects malformed input before RPCs and returns safe exception results', async () => {
    expect(await toggleAuthorSubscriptionAction('bad')).toMatchObject({ ok: false, code: 'unavailable' });
    expect(mocks.client).not.toHaveBeenCalled();
    mocks.client.mockRejectedValueOnce(new Error('secret'));
    expect(await toggleAuthorSubscriptionAction(id)).toMatchObject({ ok: false, code: 'unavailable' });
  });
  it('returns notify and count on success and revalidates author and library paths', async () => {
    expect(await toggleAuthorSubscriptionAction(id)).toEqual({ ok: true, notify: true, subscriberCount: 10 });
    expect(mocks.toggle).toHaveBeenCalledWith(client, id);
    expect(mocks.revalidate).toHaveBeenCalledWith(`/author/${id}`);
    expect(mocks.revalidate).toHaveBeenCalledWith('/library');
  });
  it('never exposes private DB errors or revalidates failed writes', async () => {
    mocks.toggle.mockResolvedValue({ ok: false, code: 'write_suspended', error: 'secret' });
    const result = await toggleAuthorSubscriptionAction(id);
    expect(result).toMatchObject({ ok: false, code: 'write_suspended' });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('normalizes public pagination input without requiring a session', async () => {
    expect(await loadAuthorWorksAction(id, { status: 'ongoing', sort: 'popular', offset: '12' })).toEqual({ ok: true, page });
    expect(mocks.works).toHaveBeenCalledWith(client, id, { status: 'ongoing', sort: 'popular', offset: 12 });
    expect(mocks.user).not.toHaveBeenCalled();
    expect(await loadAuthorWorksAction('bad', {})).toMatchObject({ ok: false });
  });
  it('returns a safe retryable pagination failure on thrown and returned errors', async () => {
    mocks.works.mockRejectedValueOnce(new Error('secret'));
    expect(await loadAuthorWorksAction(id, {})).toEqual({ ok: false, code: 'unavailable', error: '작품을 더 불러오지 못했어요' });
    mocks.works.mockResolvedValueOnce({ ok: false, code: 'unavailable', error: 'secret' });
    expect(await loadAuthorWorksAction(id, {})).toEqual({ ok: false, code: 'unavailable', error: '작품을 더 불러오지 못했어요' });
  });
  it('does not roll back a committed write if cache invalidation throws', async () => {
    mocks.revalidate.mockImplementationOnce(() => { throw new Error('cache failure'); });
    expect(await toggleAuthorSubscriptionAction(id)).toEqual({ ok: true, notify: true, subscriberCount: 10 });
  });
});

describe('appended public work author DTO', () => {
  it('uses only the public author profile and profiles.id', async () => {
    expect(await getPublicWorkAuthor(client, { ownerId: id, blinded: false })).toEqual({ authorId: id, penName: '달빛' });
    expect(mocks.profile).toHaveBeenCalledWith(client, id);
  });
  it('omits unavailable author links and never queries blinded works', async () => {
    mocks.profile.mockResolvedValue({ ok: false, code: 'not_found', error: '' });
    expect(await getPublicWorkAuthor(client, { ownerId: id, blinded: false })).toEqual({ authorId: null, penName: null });
    mocks.profile.mockClear();
    expect(await getPublicWorkAuthor(client, { ownerId: id, blinded: true })).toEqual({ authorId: null, penName: null });
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});

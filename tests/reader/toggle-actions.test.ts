import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getUser: vi.fn(),
  toggleLike: vi.fn(),
  toggleBookmark: vi.fn(),
  toggleSubscription: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/reader/likes', () => ({ toggleLike: mocks.toggleLike }));
vi.mock('@/lib/reader/bookmarks', () => ({ toggleBookmark: mocks.toggleBookmark }));
vi.mock('@/lib/reader/subscriptions', () => ({ toggleSubscription: mocks.toggleSubscription }));
vi.mock('@/lib/reader/reports', () => ({ submitReport: vi.fn() }));

const actions = await import('../../app/works/[workId]/actions');

const cases = [
  ['like', actions.toggleLikeAction, mocks.toggleLike, 'liked'],
  ['bookmark', actions.toggleBookmarkAction, mocks.toggleBookmark, 'bookmarked'],
  ['subscription', actions.toggleSubscriptionAction, mocks.toggleSubscription, 'subscribed'],
] as const;

describe.each(cases)('%s action (BUG-02)', (_n, action, lib, key) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('refuses anonymous callers without touching the DB', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    expect(await action('w1')).toMatchObject({ ok: false });
    expect(lib).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('passes through the DB-returned state and revalidates on success', async () => {
    lib.mockResolvedValue({ [key]: false });
    expect(await action('w1')).toEqual({ ok: true, [key]: false });
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/works/w1');
  });

  it('returns ok:false and does not revalidate on a toggle error', async () => {
    lib.mockResolvedValue({ error: '실패' });
    expect(await action('w1')).toEqual({ ok: false, error: '실패' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('returns ok:false and does not revalidate on a denial', async () => {
    lib.mockResolvedValue({ [key]: true, denied: { error: '정지', code: 'write_suspended' } });
    expect(await action('w1')).toMatchObject({ ok: false, error: '정지' });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

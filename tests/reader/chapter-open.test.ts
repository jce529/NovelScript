import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  incrementChapterView: vi.fn(),
  upsertReadingProgress: vi.fn(),
  canView: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/reader/views', () => ({ incrementChapterView: mocks.incrementChapterView }));
vi.mock('@/lib/reader/progress', () => ({ upsertReadingProgress: mocks.upsertReadingProgress }));
vi.mock('@/lib/access/actions', () => ({ canView: mocks.canView, getChapterAccessState: vi.fn() }));
vi.mock('@/lib/commerce/actions', () => ({
  createPurchaseOrder: vi.fn(), payPurchaseOrder: vi.fn(),
  PURCHASE_BLINDED_MESSAGE: 'blinded', PURCHASE_UNAVAILABLE_MESSAGE: 'unavailable',
}));
vi.mock('@/lib/reader/reports', () => ({ submitReport: vi.fn() }));

const { trackChapterOpenAction } = await import('../../app/works/[workId]/chapters/[chapterId]/actions');
const { chapterVisitKey, visitOpenEffect } = await import('../../components/reader/view-tracker');

const WORK = '11111111-1111-4111-8111-111111111111';
const CHAPTER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';

const snapshot = {
  chapterId: CHAPTER, workId: WORK, scrollRatio: 0.4, maxScrollRatio: 0.4, activeMs: 1000,
  completedAt: null, sessionId: SESSION, sessionActiveMs: 0, lastSequence: 0,
};

const rpcNames = () => mocks.rpc.mock.calls.map((c) => c[0]);

describe('trackChapterOpenAction with a visit session (03-13 bootstrap)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'reader-1' } } });
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    mocks.incrementChapterView.mockResolvedValue(undefined);
    mocks.canView.mockResolvedValue(true);
  });

  it('opens via open_chapter_reading and returns the snapshot, without the legacy upsert', async () => {
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toEqual(snapshot);
    expect(mocks.rpc).toHaveBeenCalledWith('open_chapter_reading', { p_work_id: WORK, p_chapter_id: CHAPTER, p_session_id: SESSION });
    expect(mocks.upsertReadingProgress).not.toHaveBeenCalled();
    expect(mocks.incrementChapterView).toHaveBeenCalledWith(expect.anything(), { chapterId: CHAPTER, userId: 'reader-1' });
  });

  it('guest: view counted every visit, no reading state or pointer change', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toBeNull();
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toBeNull();
    expect(mocks.incrementChapterView).toHaveBeenCalledTimes(2);
    expect(mocks.incrementChapterView).toHaveBeenCalledWith(expect.anything(), { chapterId: CHAPTER, userId: null });
    expect(rpcNames()).not.toContain('open_chapter_reading');
    expect(mocks.upsertReadingProgress).not.toHaveBeenCalled();
  });

  it('locked: the view still counts but no open (pointer and state row untouched)', async () => {
    await expect(trackChapterOpenAction(WORK, CHAPTER, true, SESSION)).resolves.toBeNull();
    expect(mocks.incrementChapterView).toHaveBeenCalledTimes(1);
    expect(rpcNames()).not.toContain('open_chapter_reading');
    expect(mocks.upsertReadingProgress).not.toHaveBeenCalled();
  });

  it('forged locked=false cannot bypass the server: the RPC refusal yields null and no fallback write', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'chapter_not_readable' } });
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toBeNull();
    expect(mocks.upsertReadingProgress).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('suspended reader: write_access_denied yields null, the read is not blocked', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'write_access_denied' } });
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toBeNull();
    expect(mocks.upsertReadingProgress).not.toHaveBeenCalled();
  });

  it('a malformed session id never reaches the RPC', async () => {
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, 'not-a-uuid')).resolves.toBeNull();
    expect(rpcNames()).not.toContain('open_chapter_reading');
  });

  it('every failure is swallowed (view count, auth, RPC throw)', async () => {
    mocks.incrementChapterView.mockRejectedValue(new Error('down'));
    mocks.rpc.mockRejectedValue(new Error('socket'));
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toBeNull();
    mocks.getUser.mockRejectedValue(new Error('auth down'));
    await expect(trackChapterOpenAction(WORK, CHAPTER, false, SESSION)).resolves.toBeNull();
  });

  it('legacy 3-arg call keeps the canView + upsertReadingProgress branch', async () => {
    await expect(trackChapterOpenAction(WORK, CHAPTER, false)).resolves.toBeNull();
    expect(mocks.canView).toHaveBeenCalledWith(expect.anything(), WORK, CHAPTER);
    expect(mocks.upsertReadingProgress).toHaveBeenCalledWith(expect.anything(), { userId: 'reader-1', workId: WORK, chapterId: CHAPTER });
    expect(rpcNames()).not.toContain('open_chapter_reading');
  });

  it('legacy 3-arg call: server recheck still overrides a forged locked=false', async () => {
    mocks.canView.mockResolvedValue(false);
    await trackChapterOpenAction(WORK, CHAPTER, false);
    expect(mocks.upsertReadingProgress).not.toHaveBeenCalled();
  });
});

/** Mimics React's effect lifecycle: mount runs the effect; StrictMode runs cleanup then the
 * effect again with the same refs; a dependency change runs cleanup then the new effect. */
function effectHarness(onOpen: () => Promise<void>) {
  const guard = { current: null as string | null };
  let cleanup: (() => void) | undefined;
  const start = (fn: () => void) => fn();
  return {
    run(visitKey: string) {
      cleanup?.();
      cleanup = visitOpenEffect(guard, visitKey, onOpen, start);
    },
    unmount() { cleanup?.(); cleanup = undefined; },
  };
}

describe('ViewTracker visit effect', () => {
  it('StrictMode double effect for the same visitKey opens once', () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const h = effectHarness(onOpen);
    const key = chapterVisitKey({ chapterId: CHAPTER, sessionId: SESSION, readable: true });
    h.run(key);
    h.run(key); // StrictMode: cleanup + effect again
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a new chapter or a new visit session opens again', () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const h = effectHarness(onOpen);
    h.run(chapterVisitKey({ chapterId: CHAPTER, sessionId: SESSION, readable: true }));
    h.run(chapterVisitKey({ chapterId: WORK, sessionId: SESSION, readable: true }));
    h.run(chapterVisitKey({ chapterId: WORK, sessionId: '44444444-4444-4444-8444-444444444444', readable: true }));
    expect(onOpen).toHaveBeenCalledTimes(3);
  });

  it('unreadable -> readable after purchase is a new bootstrap', () => {
    const onOpen = vi.fn().mockResolvedValue(undefined);
    const h = effectHarness(onOpen);
    h.run(chapterVisitKey({ chapterId: CHAPTER, sessionId: SESSION, readable: false }));
    h.run(chapterVisitKey({ chapterId: CHAPTER, sessionId: SESSION, readable: false }));
    h.run(chapterVisitKey({ chapterId: CHAPTER, sessionId: SESSION, readable: true }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('a rejected onOpen never escapes the effect', async () => {
    const onOpen = vi.fn().mockRejectedValue(new Error('x'));
    const h = effectHarness(onOpen);
    expect(() => h.run('k')).not.toThrow();
    await Promise.resolve();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

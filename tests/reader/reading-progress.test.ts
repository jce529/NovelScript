import { describe, it, expect, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { upsertReadingProgress, getReadingProgress, listRecentlyRead } from '../../lib/reader/progress';
import {
  ChapterReadingError,
  completeChapterReading,
  openChapterReading,
  saveChapterReading,
  type ChapterReadingState,
  type ProgressRequest,
} from '../../lib/reader/chapter-reading';
import {
  IDLE_LIMIT_MS,
  SAVE_INTERVAL_MS,
  SENTINEL_DWELL_MS,
  computeScrollRatio,
  restoreScrollTop,
  type ScrollGeometry,
} from '../../lib/reader/scroll-progress';
import {
  COMPLETION_SCROLL_RATIO,
  END_SENTINEL_VISIBLE_MS,
  minimumReadingMs,
} from '../../lib/reader/completion';
import {
  createReadingProgressController,
  restoreWithRelease,
  type ProgressResult,
} from '../../components/reader/use-reading-progress';

describe('reading progress (D-14/D-15: one row per user+work, chapter-level granularity)', () => {
  const admin = adminClient();
  const users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createReader() {
    const reader = await createTestUser();
    users.push(reader.id);
    return reader;
  }

  async function createWorkWithChapters(chapterCount: number) {
    const owner = await createTestUser();
    users.push(owner.id);

    const { data: workId, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;

    const chapterIds: string[] = [];
    for (let i = 0; i < chapterCount; i++) {
      const { data: chapter, error: chErr } = await admin
        .from('chapters')
        .insert({ work_id: workId as string, title: `${i + 1}화`, order_index: i })
        .select('id')
        .single();
      if (chErr) throw chErr;
      await admin.from('chapters').update({ is_published: true }).eq('id', chapter!.id);
      chapterIds.push(chapter!.id as string);
    }

    return { workId: workId as string, chapterIds };
  }

  it('upsertReadingProgress creates a row readable by getReadingProgress', async () => {
    const reader = await createReader();
    const { workId, chapterIds } = await createWorkWithChapters(1);

    await upsertReadingProgress(admin, { userId: reader.id, workId, chapterId: chapterIds[0] });

    const progress = await getReadingProgress(admin, { userId: reader.id, workId });
    expect(progress).toEqual({ chapterId: chapterIds[0] });
  });

  it('upsertReadingProgress updates the existing row in place for the same user+work', async () => {
    const reader = await createReader();
    const { workId, chapterIds } = await createWorkWithChapters(2);

    await upsertReadingProgress(admin, { userId: reader.id, workId, chapterId: chapterIds[0] });
    await upsertReadingProgress(admin, { userId: reader.id, workId, chapterId: chapterIds[1] });

    const progress = await getReadingProgress(admin, { userId: reader.id, workId });
    expect(progress).toEqual({ chapterId: chapterIds[1] });

    const { data: rows } = await admin
      .from('reading_progress')
      .select('chapter_id')
      .eq('user_id', reader.id)
      .eq('work_id', workId);
    expect(rows).toHaveLength(1);
  });

  it('getReadingProgress returns null when there is no prior progress', async () => {
    const reader = await createReader();
    const { workId } = await createWorkWithChapters(1);

    const progress = await getReadingProgress(admin, { userId: reader.id, workId });
    expect(progress).toBeNull();
  });

  it('listRecentlyRead returns entries ordered by updatedAt descending with full shape', async () => {
    const reader = await createReader();
    const workA = await createWorkWithChapters(1);
    const workB = await createWorkWithChapters(1);

    await upsertReadingProgress(admin, { userId: reader.id, workId: workA.workId, chapterId: workA.chapterIds[0] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await upsertReadingProgress(admin, { userId: reader.id, workId: workB.workId, chapterId: workB.chapterIds[0] });

    const list = await listRecentlyRead(admin, { userId: reader.id, limit: 10 });

    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].workId).toBe(workB.workId);
    expect(list[1].workId).toBe(workA.workId);
    expect(list[0]).toEqual(
      expect.objectContaining({
        workId: workB.workId,
        workTitle: expect.any(String),
        coverImageUrl: null,
        chapterId: workB.chapterIds[0],
        chapterTitle: expect.any(String),
        chapterOrderIndex: 0,
        updatedAt: expect.any(String),
      })
    );
  });

  it('listRecentlyRead respects the limit parameter, returning the most recently updated', async () => {
    const reader = await createReader();
    const workA = await createWorkWithChapters(1);
    const workB = await createWorkWithChapters(1);
    const workC = await createWorkWithChapters(1);

    await upsertReadingProgress(admin, { userId: reader.id, workId: workA.workId, chapterId: workA.chapterIds[0] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await upsertReadingProgress(admin, { userId: reader.id, workId: workB.workId, chapterId: workB.chapterIds[0] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await upsertReadingProgress(admin, { userId: reader.id, workId: workC.workId, chapterId: workC.chapterIds[0] });

    const list = await listRecentlyRead(admin, { userId: reader.id, limit: 2 });

    expect(list).toHaveLength(2);
    expect(list[0].workId).toBe(workC.workId);
    expect(list[1].workId).toBe(workB.workId);
  });
});

describe('RDATA-01: chapter scroll progress save, restore, reverse-scroll max retention, and account gates', () => {
  const WORK_ID = '11111111-1111-4111-8111-111111111111';
  const CHAPTER_ID = '22222222-2222-4222-8222-222222222222';
  const SESSION_1 = '33333333-3333-4333-8333-333333333333';
  const SESSION_2 = '44444444-4444-4444-8444-444444444444';
  const GEOMETRY: ScrollGeometry = {
    scrollTop: 0,
    viewportHeight: 800,
    bodyTop: 200,
    bodyHeight: 3000,
  };

  function createHarness(opts: {
    sessionId?: string;
    minActiveMs?: number;
    onComplete?: (state: ChapterReadingState) => void;
    responder?: (req: ProgressRequest, meta: { keepalive: boolean }) => ProgressResult;
  } = {}) {
    let now = 0;
    let nextTimerId = 1;
    const timers = new Map<number, { fn: () => void; ms: number }>();
    const calls: Array<{ req: ProgressRequest; keepalive: boolean }> = [];

    const defaultResponder = (req: ProgressRequest): ProgressResult => ({
      ok: true,
      state: {
        chapterId: req.chapterId,
        workId: req.workId,
        scrollRatio: req.scrollRatio,
        maxScrollRatio: req.scrollRatio,
        activeMs: req.sessionActiveMs,
        completedAt: req.operation === 'complete' ? '2026-11-13T00:00:00.000Z' : null,
        sessionId: req.sessionId,
        sessionActiveMs: req.sessionActiveMs,
        lastSequence: req.sequence,
      },
    });

    const controller = createReadingProgressController({
      workId: WORK_ID,
      chapterId: CHAPTER_ID,
      sessionId: opts.sessionId ?? SESSION_1,
      minActiveMs: opts.minActiveMs,
      onComplete: opts.onComplete,
      clock: () => now,
      schedule: (fn, ms) => {
        const id = nextTimerId++;
        timers.set(id, { fn, ms });
        return id;
      },
      cancel: (handle) => {
        timers.delete(handle as number);
      },
      transport: async (req, meta) => {
        calls.push({ req, keepalive: meta.keepalive });
        return (opts.responder ?? defaultResponder)(req, meta);
      },
    });

    async function flushMicrotasks() {
      await Promise.resolve();
      await Promise.resolve();
    }

    async function advanceAndTick(ms: number) {
      now += ms;
      const activeTimers = [...timers.entries()];
      for (const [id, entry] of activeTimers) {
        timers.delete(id);
        entry.fn();
      }
      await flushMicrotasks();
    }

    return {
      controller,
      calls,
      setNow: (next: number) => {
        now = next;
      },
      getNow: () => now,
      flushMicrotasks,
      advanceAndTick,
    };
  }

  it('anonymous / unauthenticated viewer: RPC adapter rejects with authentication_required and controller sends zero saves', async () => {
    const rpcCalls: string[] = [];
    const anonFakeClient = {
      rpc: async (fn: string) => {
        rpcCalls.push(fn);
        return { data: null, error: { message: 'authentication_required' } };
      },
    } as unknown as SupabaseClient;

    await expect(
      openChapterReading(anonFakeClient, { workId: WORK_ID, chapterId: CHAPTER_ID, sessionId: SESSION_1 }),
    ).rejects.toMatchObject({ name: 'ChapterReadingError', code: 'authentication_required' });
    await expect(
      saveChapterReading(anonFakeClient, {
        workId: WORK_ID,
        chapterId: CHAPTER_ID,
        sessionId: SESSION_1,
        sequence: 1,
        scrollRatio: 0.4,
        sessionActiveMs: 5000,
        endVisibleMs: 0,
      }),
    ).rejects.toBeInstanceOf(ChapterReadingError);
    await expect(
      completeChapterReading(anonFakeClient, { workId: WORK_ID, chapterId: CHAPTER_ID, sessionId: SESSION_1 }),
    ).rejects.toMatchObject({ code: 'authentication_required' });
    expect(rpcCalls).toEqual(['open_chapter_reading', 'save_chapter_reading', 'complete_chapter']);

    // When the viewer is unauthenticated (bootstrapped with null), scrolling and exiting never call transport
    const h = createHarness();
    h.controller.bootstrap(null);
    h.controller.setRatio(0.5);
    await h.advanceAndTick(SAVE_INTERVAL_MS);
    h.controller.setVisible(false);
    h.controller.flush();
    h.controller.dispose();
    await h.flushMicrotasks();
    expect(h.calls).toHaveLength(0);
  });

  it('logged-in re-entry restores saved scrollRatio while preserving maxScrollRatio after reverse scroll', async () => {
    // Stateful in-memory DB row mirroring 0024 open_chapter_reading + save_chapter_reading
    let dbState: ChapterReadingState = {
      chapterId: CHAPTER_ID,
      workId: WORK_ID,
      scrollRatio: 0,
      maxScrollRatio: 0,
      activeMs: 0,
      completedAt: null,
      sessionId: SESSION_1,
      sessionActiveMs: 0,
      lastSequence: 0,
    };

    const applySave = (req: ProgressRequest): ProgressResult => {
      const prevSessionActive = dbState.sessionId === req.sessionId ? dbState.sessionActiveMs : 0;
      const deltaActive = Math.max(0, req.sessionActiveMs - prevSessionActive);
      dbState = {
        ...dbState,
        scrollRatio: req.scrollRatio,
        maxScrollRatio: Math.max(dbState.maxScrollRatio, req.scrollRatio),
        activeMs: dbState.activeMs + deltaActive,
        sessionId: req.sessionId,
        sessionActiveMs: req.sessionActiveMs,
        lastSequence: req.sequence,
      };
      return { ok: true, state: dbState };
    };

    // Visit 1: reader scrolls forward to 0.84, then reverse-scrolls up to 0.30 and exits
    const visit1 = createHarness({ sessionId: SESSION_1, responder: applySave });
    visit1.controller.bootstrap(dbState);
    visit1.controller.setRatio(0.84);
    await visit1.advanceAndTick(SAVE_INTERVAL_MS);
    expect(dbState.scrollRatio).toBeCloseTo(0.84, 5);
    expect(dbState.maxScrollRatio).toBeCloseTo(0.84, 5);

    visit1.controller.setRatio(0.3);
    visit1.controller.dispose();
    await visit1.flushMicrotasks();
    expect(dbState.scrollRatio).toBeCloseTo(0.3, 5);
    expect(dbState.maxScrollRatio).toBeCloseTo(0.84, 5);

    // Visit 2 (re-entry): open_chapter_reading resets per-session fields but keeps scrollRatio=0.30, maxScrollRatio=0.84
    const reopenedState: ChapterReadingState = {
      ...dbState,
      sessionId: SESSION_2,
      sessionActiveMs: 0,
      lastSequence: 0,
    };
    dbState = reopenedState;

    const visit2 = createHarness({ sessionId: SESSION_2, responder: applySave });
    visit2.controller.bootstrap(reopenedState);
    visit2.controller.beginRestore();
    let restoredTop = 0;
    let released = false;
    await restoreWithRelease({
      restore: async () => {
        restoredTop = restoreScrollTop(reopenedState.scrollRatio, GEOMETRY);
      },
      release: () => {
        visit2.controller.endRestore();
        released = true;
      },
      schedule: () => 1,
      cancel: () => {},
    });

    expect(released).toBe(true);
    expect(computeScrollRatio({ ...GEOMETRY, scrollTop: restoredTop })).toBeCloseTo(0.3, 5);
    expect(dbState.maxScrollRatio).toBeCloseTo(0.84, 5);
  });

  it('retries a failed sample with the same sequence and flushes with keepalive on exit', async () => {
    let shouldFail = true;
    const h = createHarness({
      responder: (req) => {
        if (shouldFail) return { ok: false, status: 503 };
        return {
          ok: true,
          state: {
            chapterId: req.chapterId,
            workId: req.workId,
            scrollRatio: req.scrollRatio,
            maxScrollRatio: req.scrollRatio,
            activeMs: req.sessionActiveMs,
            completedAt: null,
            sessionId: req.sessionId,
            sessionActiveMs: req.sessionActiveMs,
            lastSequence: req.sequence,
          },
        };
      },
    });

    h.controller.bootstrap({
      chapterId: CHAPTER_ID,
      workId: WORK_ID,
      scrollRatio: 0,
      maxScrollRatio: 0,
      activeMs: 0,
      completedAt: null,
      sessionId: SESSION_1,
      sessionActiveMs: 0,
      lastSequence: 0,
    });

    // Advance past idle cutoff so activeMs freezes at IDLE_LIMIT_MS (120,000 ms), then send sequence 1 which fails (503)
    h.controller.setRatio(0.45);
    await h.advanceAndTick(IDLE_LIMIT_MS + SAVE_INTERVAL_MS);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].req.sequence).toBe(1);
    expect(h.calls[0].keepalive).toBe(false);

    // Next interval with no new activity/scroll retries the exact failed request (sequence 1)
    shouldFail = false;
    await h.advanceAndTick(SAVE_INTERVAL_MS);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].req.sequence).toBe(1);
    expect(h.calls[1].req.scrollRatio).toBe(0.45);

    // Exit flush after scrolling to 0.72 immediately dispatches sequence 2 with keepalive: true
    h.controller.setRatio(0.72);
    h.controller.dispose();
    await h.flushMicrotasks();
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2].req.sequence).toBe(2);
    expect(h.calls[2].req.scrollRatio).toBe(0.72);
    expect(h.calls[2].keepalive).toBe(true);
  });

  it('distinguishes unverified account progress save from verified completion at the 5,000-char (125,000 ms) boundary', async () => {
    const minMs5k = minimumReadingMs(5000);
    expect(minMs5k).toBe(125_000);
    expect(COMPLETION_SCROLL_RATIO).toBe(0.98);
    expect(END_SENTINEL_VISIBLE_MS).toBe(1000);
    expect(SENTINEL_DWELL_MS).toBe(1000);

    // 1) Unverified account: progress is saved and restored, but server complete_chapter returns completedAt: null
    const unverifiedCompleted: ChapterReadingState[] = [];
    const unverified = createHarness({
      minActiveMs: minMs5k,
      onComplete: (s) => unverifiedCompleted.push(s),
      responder: (req) => ({
        ok: true,
        state: {
          chapterId: req.chapterId,
          workId: req.workId,
          scrollRatio: req.scrollRatio,
          maxScrollRatio: Math.max(0.98, req.scrollRatio),
          activeMs: req.sessionActiveMs,
          completedAt: null, // 0052/0053: user_is_verified(v_user) = false -> completed_at stays null
          sessionId: req.sessionId,
          sessionActiveMs: req.sessionActiveMs,
          lastSequence: req.sequence,
        },
      }),
    });

    unverified.controller.bootstrap({
      chapterId: CHAPTER_ID,
      workId: WORK_ID,
      scrollRatio: 0,
      maxScrollRatio: 0,
      activeMs: 0,
      completedAt: null,
      sessionId: SESSION_1,
      sessionActiveMs: 0,
      lastSequence: 0,
    });
    unverified.controller.setRatio(0.98);
    unverified.setNow(100_000);
    unverified.controller.activity();
    unverified.setNow(124_000);
    unverified.controller.setSentinel(true);
    // At 125,000 ms (sentinel visible 1,000 ms, ratio 0.98), client sends 'complete', server keeps completedAt null
    unverified.setNow(125_000);
    unverified.controller.flush();
    await unverified.flushMicrotasks();

    expect(unverified.calls).toHaveLength(1);
    expect(unverified.calls[0].req).toMatchObject({
      operation: 'complete',
      scrollRatio: 0.98,
      sessionActiveMs: 125_000,
      endVisibleMs: 1000,
    });
    expect(unverifiedCompleted).toHaveLength(0);

    // 2) Verified account: 124,999 ms is still 'save' (incomplete); 125,000 ms + ratio 0.98 + sentinel 1,000 ms completes
    const verifiedCompleted: ChapterReadingState[] = [];
    const verified = createHarness({
      minActiveMs: minMs5k,
      onComplete: (s) => verifiedCompleted.push(s),
    });

    verified.controller.bootstrap({
      chapterId: CHAPTER_ID,
      workId: WORK_ID,
      scrollRatio: 0,
      maxScrollRatio: 0,
      activeMs: 0,
      completedAt: null,
      sessionId: SESSION_2,
      sessionActiveMs: 0,
      lastSequence: 0,
    });
    verified.controller.setRatio(0.98);
    verified.setNow(100_000);
    verified.controller.activity();
    verified.setNow(123_999);
    verified.controller.setSentinel(true);

    // 124,999 ms -> sentinel visible 1,000 ms, but activeMs is 1 ms short of 125,000 ms
    verified.setNow(124_999);
    verified.controller.flush();
    await verified.flushMicrotasks();
    expect(verified.calls[0].req.operation).toBe('save');
    expect(verified.calls[0].req.sessionActiveMs).toBe(124_999);
    expect(verifiedCompleted).toHaveLength(0);

    // 125,000 ms -> meets all thresholds (0.98, 1,000 ms sentinel, 125,000 ms active) -> completes
    verified.setNow(125_000);
    verified.controller.flush();
    await verified.flushMicrotasks();
    expect(verified.calls[1].req).toMatchObject({
      operation: 'complete',
      scrollRatio: 0.98,
      sessionActiveMs: 125_000,
      endVisibleMs: 1001,
    });
    expect(verifiedCompleted).toHaveLength(1);
    expect(verifiedCompleted[0].completedAt).toBe('2026-11-13T00:00:00.000Z');
  });
});


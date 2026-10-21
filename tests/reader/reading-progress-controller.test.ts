import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReadingProgressController,
  createFetchTransport,
  restoreWithRelease,
  type ProgressTransport,
  type ProgressResult,
} from '../../components/reader/use-reading-progress';
import type { ChapterReadingState } from '../../lib/reader/chapter-reading';
import type { ProgressRequest } from '../../lib/reader/chapter-reading';

const WORK = '11111111-1111-4111-8111-111111111111';
const CHAPTER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';

const snapshot = (over: Partial<ChapterReadingState> = {}): ChapterReadingState => ({
  chapterId: CHAPTER, workId: WORK, scrollRatio: 0, maxScrollRatio: 0, activeMs: 0,
  completedAt: null, sessionId: SESSION, sessionActiveMs: 0, lastSequence: 0, ...over,
});

function harness(opts: { results?: ProgressResult[]; minActiveMs?: number; deferred?: boolean } = {}) {
  let now = 1_000_000;
  const timers = new Map<number, { at: number; fn: () => void }>();
  let nextId = 1;
  const calls: Array<{ req: ProgressRequest; keepalive: boolean }> = [];
  const resolvers: Array<(r: ProgressResult) => void> = [];
  const queue = [...(opts.results ?? [])];
  const transport: ProgressTransport = (req, o) => {
    calls.push({ req, keepalive: o.keepalive });
    if (opts.deferred) return new Promise<ProgressResult>((res) => resolvers.push(res));
    return Promise.resolve(queue.shift() ?? { ok: true, state: snapshot({ lastSequence: req.sequence }) });
  };
  const onComplete = vi.fn();
  const c = createReadingProgressController({
    workId: WORK, chapterId: CHAPTER, sessionId: SESSION, transport, onComplete,
    clock: () => now,
    schedule: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id; },
    cancel: (h) => { timers.delete(h as number); },
    minActiveMs: opts.minActiveMs ?? 30_000,
  });
  const advance = async (ms: number) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = Math.max(now, due[1].at);
      due[1].fn();
      await Promise.resolve(); await Promise.resolve();
    }
    now = target;
  };
  const flushMicro = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { c, calls, advance, flushMicro, resolvers, timers, onComplete, now: () => now };
}

describe('createReadingProgressController', () => {
  it('does not save before bootstrap, and counts visible time from session start', async () => {
    const h = harness();
    h.c.setRatio(0.4);
    await h.advance(6000);
    expect(h.calls).toHaveLength(0);
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].req.sessionActiveMs).toBeGreaterThanOrEqual(11_000);
    expect(h.calls[0].req.sequence).toBe(1);
  });

  it('bootstrap(null) disables saving but never throws', async () => {
    const h = harness();
    h.c.bootstrap(null);
    h.c.setRatio(0.9);
    await h.advance(20_000);
    h.c.flush();
    expect(h.calls).toHaveLength(0);
  });

  it('sends on the 5s trailing sample; same ratio under 1%p with no time growth is skipped but time growth is not', async () => {
    const h = harness();
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    expect(h.calls).toHaveLength(1);
    // nothing active-time-wise grows if idle: simulate idle beyond 120s window
    h.c.setRatio(0.5);
    await h.advance(5000);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].req.scrollRatio).toBe(0.5);
    expect(h.calls[1].req.sequence).toBe(2);
  });

  it('active time keeps being saved with no scroll change', async () => {
    const h = harness();
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    await h.advance(5000);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].req.sessionActiveMs).toBeGreaterThan(h.calls[0].req.sessionActiveMs);
  });

  it('hidden time is not counted and stops saving once nothing changes', async () => {
    const h = harness();
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    h.c.setVisible(false);
    await h.flushMicro();
    const afterHidden = h.calls.length;
    const lastActive = h.calls[h.calls.length - 1].req.sessionActiveMs;
    await h.advance(60_000);
    expect(h.calls).toHaveLength(afterHidden);
    h.c.setVisible(true);
    h.c.activity();
    await h.advance(5000);
    const resumed = h.calls[h.calls.length - 1].req.sessionActiveMs;
    expect(resumed - lastActive).toBeLessThan(10_000);
  });

  it('hidden flushes with keepalive and a larger sequence, even while another save is in flight', async () => {
    const h = harness({ deferred: true });
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].keepalive).toBe(false);
    h.c.setRatio(0.6);
    h.c.setVisible(false);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].keepalive).toBe(true);
    expect(h.calls[1].req.sequence).toBeGreaterThan(h.calls[0].req.sequence);
    expect(h.calls[1].req.scrollRatio).toBe(0.6);
  });

  it('keeps one in-flight and coalesces to the latest pending sample', async () => {
    const h = harness({ deferred: true });
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    h.c.setRatio(0.3);
    await h.advance(5000);
    h.c.setRatio(0.7);
    await h.advance(5000);
    expect(h.calls).toHaveLength(1);
    h.resolvers[0]({ ok: true, state: snapshot({ lastSequence: 1 }) });
    await h.flushMicro();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].req.scrollRatio).toBe(0.7);
    expect(h.calls[1].req.sequence).toBe(2);
  });

  it('retries a retryable failure with the SAME sequence and sample; a changed sample takes the next sequence', async () => {
    const h = harness({ results: [{ ok: false, status: 500 }] });
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    expect(h.calls).toHaveLength(1);
    await h.advance(5000);
    // fresh active time is also due, so a new sample supersedes the failed one
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].req.sequence).toBe(2);

    const h2 = harness({ results: [{ ok: false, status: 0 }] });
    h2.c.bootstrap(snapshot());
    h2.c.setRatio(0.5);
    h2.c.setVisible(false); // freezes active time, flushes seq 1
    await h2.flushMicro();
    // hidden flush dispatched seq 1 and failed
    expect(h2.calls).toHaveLength(1);
    await h2.advance(5000);
    expect(h2.calls).toHaveLength(2);
    expect(h2.calls[1].req).toEqual(h2.calls[0].req);
  });

  it('stops retrying after the maximum attempts and never throws into the reader', async () => {
    const h = harness({ results: Array.from({ length: 10 }, () => ({ ok: false as const, status: 503 })) });
    h.c.bootstrap(snapshot());
    h.c.setRatio(0.5);
    h.c.setVisible(false);
    await h.flushMicro();
    await h.advance(60_000);
    expect(h.calls.length).toBeLessThanOrEqual(1 + 3);
  });

  it('permanent errors (401/403/404) stop saving entirely', async () => {
    const h = harness({ results: [{ ok: false, status: 403 }] });
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    h.c.setRatio(0.8);
    await h.advance(20_000);
    h.c.flush();
    expect(h.calls).toHaveLength(1);
  });

  it('a throwing transport is swallowed', async () => {
    const throwing: ProgressTransport = () => Promise.reject(new Error('boom'));
    let now = 0;
    const c = createReadingProgressController({
      workId: WORK, chapterId: CHAPTER, sessionId: SESSION, transport: throwing,
      clock: () => now, schedule: () => 1, cancel: () => {},
    });
    c.bootstrap(snapshot());
    now = 6000;
    expect(() => c.flush()).not.toThrow();
    await Promise.resolve();
  });

  it('sequence continues after the snapshot lastSequence', async () => {
    const h = harness();
    h.c.bootstrap(snapshot({ lastSequence: 7 }));
    await h.advance(5000);
    expect(h.calls[0].req.sequence).toBe(8);
  });

  it('does not complete before 30s active and 1s sentinel; then sends one complete', async () => {
    const h = harness();
    h.c.bootstrap(snapshot());
    h.c.setRatio(1);
    h.c.setSentinel(true);
    await h.advance(5000);
    expect(h.calls.every((c) => c.req.operation === 'save')).toBe(true);
    h.c.setRatio(1);
    await h.advance(30_000);
    const completes = h.calls.filter((c) => c.req.operation === 'complete');
    expect(completes).toHaveLength(1);
    expect(completes[0].req.endVisibleMs).toBeGreaterThanOrEqual(1000);
  });

  it('sentinel leaving resets the dwell', async () => {
    const h = harness({ minActiveMs: 1000 });
    h.c.bootstrap(snapshot());
    h.c.setSentinel(true);
    await h.advance(500);
    h.c.setSentinel(false);
    await h.advance(4600);
    expect(h.calls.filter((c) => c.req.operation === 'complete')).toHaveLength(0);
  });

  it('records completion once and keeps saving other positions without another complete', async () => {
    const done = snapshot({ completedAt: '2026-10-17T00:00:00Z', lastSequence: 1 });
    const h = harness({ minActiveMs: 1000, results: [{ ok: true, state: done }] });
    h.c.bootstrap(snapshot());
    h.c.setSentinel(true);
    await h.advance(5000);
    expect(h.calls.filter((c) => c.req.operation === 'complete')).toHaveLength(1);
    expect(h.onComplete).toHaveBeenCalledTimes(1);
    h.c.setRatio(0.2);
    await h.advance(10_000);
    expect(h.calls.filter((c) => c.req.operation === 'complete')).toHaveLength(1);
    expect(h.calls.length).toBeGreaterThan(1);
  });

  it('already completed snapshots never produce a complete candidate', async () => {
    const h = harness({ minActiveMs: 1000 });
    h.c.bootstrap(snapshot({ completedAt: '2026-10-17T00:00:00Z' }));
    h.c.setSentinel(true);
    await h.advance(15_000);
    expect(h.calls.some((c) => c.req.operation === 'complete')).toBe(false);
  });

  it('restoring a saved ratio of 1 does not count as activity or end reached', async () => {
    const h = harness({ minActiveMs: 1000 });
    h.c.bootstrap(snapshot({ scrollRatio: 1, maxScrollRatio: 1 }));
    h.c.beginRestore();
    h.c.setRatio(1);
    h.c.setSentinel(true); // programmatic arrival at the end
    await h.advance(3000);
    h.c.endRestore();
    await h.advance(8000);
    expect(h.calls.some((c) => c.req.operation === 'complete')).toBe(false);
    // a real fresh dwell afterwards is allowed
    h.c.setSentinel(true);
    await h.advance(6000);
    expect(h.calls.some((c) => c.req.operation === 'complete')).toBe(true);
  });

  it('dispose flushes once with keepalive, clears timers and ignores later input', async () => {
    const h = harness();
    h.c.bootstrap(snapshot());
    h.c.setRatio(0.5);
    h.c.dispose();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].keepalive).toBe(true);
    expect(h.timers.size).toBe(0);
    h.c.setRatio(0.9);
    h.c.flush();
    await h.advance(20_000);
    expect(h.calls).toHaveLength(1);
  });

  it('payload is exactly the 8 DTO keys and well below 8KB', async () => {
    const h = harness();
    h.c.bootstrap(snapshot());
    await h.advance(5000);
    const req = h.calls[0].req;
    expect(Object.keys(req).sort()).toEqual(
      ['chapterId', 'endVisibleMs', 'operation', 'scrollRatio', 'sequence', 'sessionActiveMs', 'sessionId', 'workId'],
    );
    expect(JSON.stringify(req).length).toBeLessThan(8 * 1024);
    expect(Number.isInteger(req.sessionActiveMs)).toBe(true);
  });
});

describe('createFetchTransport', () => {
  const req: ProgressRequest = {
    operation: 'save', workId: WORK, chapterId: CHAPTER, sessionId: SESSION, sequence: 1,
    scrollRatio: 0.5, sessionActiveMs: 1000, endVisibleMs: 0,
  };
  it('POSTs JSON with keepalive and parses the state', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, state: snapshot() }), { status: 200 }));
    const t = createFetchTransport(fetchImpl as unknown as typeof fetch);
    const r = await t(req, { keepalive: true });
    expect(r.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/reader/progress');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(req);
  });
  it('maps HTTP errors and network errors to ok:false without throwing', async () => {
    const t1 = createFetchTransport((async () => new Response('{}', { status: 500 })) as unknown as typeof fetch);
    expect(await t1(req, { keepalive: false })).toEqual({ ok: false, status: 500 });
    const t2 = createFetchTransport((async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(await t2(req, { keepalive: false })).toEqual({ ok: false, status: 0 });
    const t3 = createFetchTransport((async () => new Response('not json', { status: 200 })) as unknown as typeof fetch);
    expect((await t3(req, { keepalive: false })).ok).toBe(false);
  });
});

describe('restoreWithRelease', () => {
  let timers: Array<{ ms: number; fn: () => void }>;
  beforeEach(() => { timers = []; });
  const sched = (fn: () => void, ms: number) => { timers.push({ ms, fn }); return timers.length; };

  it('releases after a successful restore', async () => {
    const release = vi.fn();
    await restoreWithRelease({ restore: async () => {}, release, schedule: sched, cancel: () => {}, timeoutMs: 1500 });
    expect(release).toHaveBeenCalled();
  });
  it('releases even when restore throws', async () => {
    const release = vi.fn();
    await restoreWithRelease({ restore: async () => { throw new Error('x'); }, release, schedule: sched, cancel: () => {}, timeoutMs: 1500 });
    expect(release).toHaveBeenCalled();
  });
  it('releases on timeout when restore never settles', async () => {
    const release = vi.fn();
    void restoreWithRelease({ restore: () => new Promise<void>(() => {}), release, schedule: sched, cancel: () => {}, timeoutMs: 1500 });
    expect(timers[0].ms).toBe(1500);
    timers[0].fn();
    expect(release).toHaveBeenCalled();
  });
});

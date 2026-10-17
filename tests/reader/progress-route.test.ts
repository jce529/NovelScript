import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidatePath: vi.fn(),
}));

// Only the Supabase factory is mocked: the real route and the real RPC adapter run.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

const { POST } = await import('../../app/api/reader/progress/route');

const WORK = '11111111-1111-4111-8111-111111111111';
const CHAPTER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://novel.example';

const snapshot = {
  chapterId: CHAPTER, workId: WORK, scrollRatio: 0.6, maxScrollRatio: 0.6, activeMs: 5000,
  completedAt: null, sessionId: SESSION, sessionActiveMs: 5000, lastSequence: 4,
};

const body = {
  operation: 'save', workId: WORK, chapterId: CHAPTER, sessionId: SESSION,
  sequence: 4, scrollRatio: 0.6, sessionActiveMs: 5000, endVisibleMs: 0,
};

function request(
  payload: unknown,
  { origin = ORIGIN, host = 'novel.example', contentType = 'application/json', forwardedHost }: {
    origin?: string | null; host?: string; contentType?: string; forwardedHost?: string;
  } = {},
) {
  const headers = new Headers({ host, 'content-type': contentType });
  if (origin) headers.set('origin', origin);
  if (forwardedHost) headers.set('x-forwarded-host', forwardedHost);
  return new Request(`${ORIGIN}/api/reader/progress`, {
    method: 'POST', headers, body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

async function expectJson(res: Response, status: number) {
  expect(res.status).toBe(status);
  expect(res.headers.get('cache-control')).toContain('no-store');
  return res.json();
}

describe('POST /api/reader/progress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'reader-1' } } });
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
  });

  it('401 for an anonymous caller, without any RPC', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const json = await expectJson(await POST(request(body)), 401);
    expect(json).toEqual({ ok: false, error: 'authentication_required' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('403 for a cross-origin or origin-less request', async () => {
    await expectJson(await POST(request(body, { origin: 'https://evil.example' })), 403);
    await expectJson(await POST(request(body, { origin: null })), 403);
    await expectJson(await POST(request(body, { origin: 'null' })), 403);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('accepts the forwarded host behind a proxy', async () => {
    await expectJson(await POST(request(body, { host: 'internal:3000', forwardedHost: 'novel.example' })), 200);
  });

  it('400 for malformed JSON, wrong content type or invalid fields', async () => {
    await expectJson(await POST(request('{not json')), 400);
    await expectJson(await POST(request(body, { contentType: 'text/plain' })), 400);
    await expectJson(await POST(request({ ...body, scrollRatio: 5 })), 400);
    await expectJson(await POST(request({ ...body, sequence: -1 })), 400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('400 for forged identity or result fields', async () => {
    await expectJson(await POST(request({ ...body, userId: 'someone-else' })), 400);
    await expectJson(await POST(request({ ...body, completedAt: '2026-01-01T00:00:00Z' })), 400);
    await expectJson(await POST(request({ ...body, charCount: 0 })), 400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('413 for a body over 8KB', async () => {
    const json = await expectJson(await POST(request({ ...body, pad: 'x'.repeat(9000) })), 413);
    expect(json).toEqual({ ok: false, error: 'payload_too_large' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('save calls only save_chapter_reading and returns the snapshot', async () => {
    const json = await expectJson(await POST(request(body)), 200);
    expect(json).toEqual({ ok: true, state: snapshot });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('save_chapter_reading', expect.objectContaining({ p_sequence: 4, p_session_id: SESSION }));
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('complete saves the same sample first, then calls complete_chapter', async () => {
    const done = { ...snapshot, completedAt: '2026-10-17T00:00:00Z' };
    mocks.rpc.mockImplementation(async (fn: string) => ({ data: fn === 'complete_chapter' ? done : snapshot, error: null }));
    const json = await expectJson(await POST(request({ ...body, operation: 'complete' })), 200);
    expect(json).toEqual({ ok: true, state: done });
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual(['save_chapter_reading', 'complete_chapter']);
    expect(mocks.rpc.mock.calls[1][1]).toEqual({ p_work_id: WORK, p_chapter_id: CHAPTER, p_session_id: SESSION });
  });

  it('complete with a stale sample still lets the server judge from stored state', async () => {
    // save ignores the stale sequence (unchanged snapshot); complete still runs on the stored row.
    const stored = { ...snapshot, lastSequence: 9 };
    mocks.rpc.mockResolvedValue({ data: stored, error: null });
    const json = await expectJson(await POST(request({ ...body, operation: 'complete', sequence: 2 })), 200);
    expect(json.state.lastSequence).toBe(9);
    expect(mocks.rpc.mock.calls.map((c) => c[0])).toEqual(['save_chapter_reading', 'complete_chapter']);
  });

  it('a duplicate sequence returns the unchanged snapshot (no time added)', async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot, error: null });
    const first = await expectJson(await POST(request(body)), 200);
    const second = await expectJson(await POST(request(body)), 200);
    expect(second.state.activeMs).toBe(first.state.activeMs);
  });

  it('does not call complete when save fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'chapter_not_readable' } });
    const json = await expectJson(await POST(request({ ...body, operation: 'complete' })), 403);
    expect(json).toEqual({ ok: false, error: 'chapter_not_readable' });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['authentication_required', 401],
    ['write_access_denied', 403],
    ['chapter_not_readable', 403],
    ['chapter_unavailable', 404],
    ['invalid_input', 400],
    ['active_time_exceeds_elapsed', 400],
  ])('maps DB code %s to %i', async (code, status) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await expectJson(await POST(request(body)), status)).toEqual({ ok: false, error: code });
  });

  it('500 without raw DB details for unknown failures', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'FATAL: password authentication failed for user "postgres" at 10.1.2.3', details: 'secret' } });
    const res = await POST(request(body));
    const text = await res.clone().text();
    expect(await expectJson(res, 500)).toEqual({ ok: false, error: 'internal_error' });
    expect(text).not.toContain('postgres');
    expect(text).not.toContain('10.1.2.3');

    mocks.rpc.mockRejectedValue(new Error('socket hang up sk_live_123'));
    const thrown = await POST(request(body));
    expect(await thrown.clone().text()).not.toContain('sk_live_123');
    await expectJson(thrown, 500);
  });

  it('500 when the auth lookup itself throws', async () => {
    mocks.getUser.mockRejectedValue(new Error('jwt secret leaked'));
    const res = await POST(request(body));
    expect(await res.clone().text()).not.toContain('secret');
    await expectJson(res, 500);
  });
});

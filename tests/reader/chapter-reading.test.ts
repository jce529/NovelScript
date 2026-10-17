import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ChapterReadingError,
  completeChapterReading,
  getChapterReadingState,
  openChapterReading,
  parseChapterReadingState,
  parseProgressRequest,
  PROGRESS_BODY_LIMIT_BYTES,
  saveChapterReading,
} from '../../lib/reader/chapter-reading';

const WORK = '11111111-1111-4111-8111-111111111111';
const CHAPTER = '22222222-2222-4222-8222-222222222222';
const SESSION = '33333333-3333-4333-8333-333333333333';

const snapshot = {
  chapterId: CHAPTER, workId: WORK, scrollRatio: 0.5, maxScrollRatio: 0.75, activeMs: 4000,
  completedAt: null, sessionId: SESSION, sessionActiveMs: 4000, lastSequence: 3,
};

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const validBody = {
  operation: 'save', workId: WORK, chapterId: CHAPTER, sessionId: SESSION,
  sequence: 4, scrollRatio: 0.6, sessionActiveMs: 5000, endVisibleMs: 0,
};

describe('parseChapterReadingState (RPC jsonb -> DTO)', () => {
  it('accepts the 0024 snapshot shape', () => {
    expect(parseChapterReadingState(snapshot)).toEqual(snapshot);
  });

  it('accepts the zero snapshot (never opened: sessionId null)', () => {
    expect(parseChapterReadingState({ ...snapshot, sessionId: null, lastSequence: 0 })).toMatchObject({ sessionId: null });
  });

  it('rejects malformed rows', () => {
    expect(parseChapterReadingState(null)).toBeNull();
    expect(parseChapterReadingState({ ...snapshot, scrollRatio: 2 })).toBeNull();
    expect(parseChapterReadingState({ ...snapshot, activeMs: -1 })).toBeNull();
    expect(parseChapterReadingState({ ...snapshot, chapterId: 'x' })).toBeNull();
  });
});

describe('parseProgressRequest (DTO validator)', () => {
  it('accepts a save and a complete DTO', () => {
    expect(parseProgressRequest(validBody)).toEqual({ ok: true, value: validBody });
    expect(parseProgressRequest({ ...validBody, operation: 'complete' })).toMatchObject({ ok: true });
  });

  it.each([
    ['unknown operation', { operation: 'delete' }],
    ['bad workId', { workId: 'not-a-uuid' }],
    ['bad chapterId', { chapterId: '' }],
    ['bad sessionId', { sessionId: 123 }],
    ['zero sequence', { sequence: 0 }],
    ['fractional sequence', { sequence: 1.5 }],
    ['unsafe sequence', { sequence: Number.MAX_SAFE_INTEGER + 1 }],
    ['ratio above 1', { scrollRatio: 1.01 }],
    ['negative ratio', { scrollRatio: -0.1 }],
    ['NaN ratio', { scrollRatio: Number.NaN }],
    ['string ratio', { scrollRatio: '0.5' }],
    ['negative active time', { sessionActiveMs: -1 }],
    ['fractional active time', { sessionActiveMs: 1.2 }],
    ['negative end time', { endVisibleMs: -5 }],
    ['end time beyond int4', { endVisibleMs: 2 ** 31 }],
  ])('rejects %s', (_name, patch) => {
    expect(parseProgressRequest({ ...validBody, ...patch })).toEqual({ ok: false });
  });

  it.each([['userId'], ['completedAt'], ['charCount'], ['activeMs']])('rejects a forged %s field', (key) => {
    expect(parseProgressRequest({ ...validBody, [key]: key === 'completedAt' ? '2026-01-01' : 1 })).toEqual({ ok: false });
  });

  it('rejects non-objects and missing fields', () => {
    expect(parseProgressRequest(null)).toEqual({ ok: false });
    expect(parseProgressRequest([validBody])).toEqual({ ok: false });
    const { sequence: _s, ...missing } = validBody;
    expect(parseProgressRequest(missing)).toEqual({ ok: false });
  });

  it('exposes the 8KB body limit', () => {
    expect(PROGRESS_BODY_LIMIT_BYTES).toBe(8 * 1024);
  });
});

describe('RPC adapters', () => {
  it('openChapterReading calls open_chapter_reading with the visit session', async () => {
    const { client, rpc } = rpcClient({ data: snapshot, error: null });
    await expect(openChapterReading(client, { workId: WORK, chapterId: CHAPTER, sessionId: SESSION })).resolves.toEqual(snapshot);
    expect(rpc).toHaveBeenCalledWith('open_chapter_reading', { p_work_id: WORK, p_chapter_id: CHAPTER, p_session_id: SESSION });
  });

  it('saveChapterReading maps the sample to save_chapter_reading params only', async () => {
    const { client, rpc } = rpcClient({ data: snapshot, error: null });
    await saveChapterReading(client, validBody);
    expect(rpc).toHaveBeenCalledWith('save_chapter_reading', {
      p_work_id: WORK, p_chapter_id: CHAPTER, p_session_id: SESSION, p_sequence: 4,
      p_scroll_ratio: 0.6, p_session_active_ms: 5000, p_end_visible_ms: 0,
    });
  });

  it('completeChapterReading calls complete_chapter with session only (no client completedAt)', async () => {
    const { client, rpc } = rpcClient({ data: { ...snapshot, completedAt: '2026-10-17T00:00:00Z' }, error: null });
    const state = await completeChapterReading(client, { workId: WORK, chapterId: CHAPTER, sessionId: SESSION });
    expect(state.completedAt).toBe('2026-10-17T00:00:00Z');
    expect(rpc).toHaveBeenCalledWith('complete_chapter', { p_work_id: WORK, p_chapter_id: CHAPTER, p_session_id: SESSION });
  });

  it('maps known DB codes and hides unknown DB messages', async () => {
    const known = rpcClient({ data: null, error: { message: 'chapter_not_readable', code: 'P0001' } });
    await expect(saveChapterReading(known.client, validBody)).rejects.toMatchObject({ code: 'chapter_not_readable' });

    const raw = rpcClient({ data: null, error: { message: 'connection to 10.0.0.1 failed password=hunter2' } });
    const err = await saveChapterReading(raw.client, validBody).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChapterReadingError);
    expect((err as ChapterReadingError).code).toBe('unknown');
    expect((err as Error).message).not.toContain('hunter2');
  });

  it('rejects a malformed RPC payload', async () => {
    const { client } = rpcClient({ data: { nope: true }, error: null });
    await expect(openChapterReading(client, { workId: WORK, chapterId: CHAPTER, sessionId: SESSION })).rejects.toMatchObject({ code: 'unknown' });
  });

  it('getChapterReadingState selects only the owner row', async () => {
    const calls: unknown[][] = [];
    const builder = {
      select: (...a: unknown[]) => { calls.push(['select', ...a]); return builder; },
      eq: (...a: unknown[]) => { calls.push(['eq', ...a]); return builder; },
      maybeSingle: async () => ({
        data: {
          chapter_id: CHAPTER, work_id: WORK, scroll_ratio: 0.5, max_scroll_ratio: 0.75, active_ms: 4000,
          completed_at: null, session_id: SESSION, session_active_ms: 4000, last_sequence: 3,
        },
        error: null,
      }),
    };
    const from = vi.fn(() => builder);
    const client = { from } as unknown as SupabaseClient;
    await expect(getChapterReadingState(client, { userId: 'u1', chapterId: CHAPTER })).resolves.toEqual(snapshot);
    expect(from).toHaveBeenCalledWith('chapter_reading_state');
    expect(calls).toContainEqual(['eq', 'user_id', 'u1']);
    expect(calls).toContainEqual(['eq', 'chapter_id', CHAPTER]);
  });
});

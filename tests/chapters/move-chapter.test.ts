import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { moveChapter } from '../../lib/chapters/actions';
import { MOVE_COPY } from '../../lib/kb/move-rules';
import { WRITE_SUSPENDED_MESSAGE } from '../../lib/auth/write-access';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORK = '33333333-3333-4333-8333-333333333333';
const WORK2 = '44444444-4444-4444-8444-444444444444';
const CHAPTER = '55555555-5555-4555-8555-555555555555';

type Row = Record<string, unknown>;
type Call = { op: string; table: string; columns?: string; payload?: Row; filters: [string, unknown][] };

function mockClient(config: { reason?: string; chapterFolder?: string | null; mutationError?: { message: string } } = {}) {
  const tables: Record<string, Row[]> = {
    works: [
      { id: WORK, owner_id: OWNER, deleted_at: null },
      { id: WORK2, owner_id: OTHER, deleted_at: null },
    ],
    chapters: [{
      id: CHAPTER, work_id: WORK, folder_id: config.chapterFolder === undefined ? 'arc1' : config.chapterFolder,
      is_published: true, order_index: 7, title: '3화', content: '본문', deleted_at: null,
    }],
    kb_nodes: [
      { id: 'root', work_id: WORK, parent_id: null, category: '회차', node_type: 'folder', deleted_at: null },
      { id: 'arc1', work_id: WORK, parent_id: 'root', category: '회차', node_type: 'folder', deleted_at: null },
      { id: 'arc2', work_id: WORK, parent_id: 'root', category: '회차', node_type: 'folder', deleted_at: null },
      { id: 'person', work_id: WORK, parent_id: null, category: '인물', node_type: 'folder', deleted_at: null },
      { id: 'other-arc', work_id: WORK2, parent_id: null, category: '회차', node_type: 'folder', deleted_at: null },
    ],
  };
  const calls: Call[] = [];
  const client = {
    async rpc(op: string) {
      calls.push({ op, table: '', filters: [] });
      if (op === 'get_write_access') return { data: { can_write: !config.reason, reason: config.reason ?? 'ok' }, error: null };
      return { data: null, error: { message: 'unexpected rpc' } };
    },
    from(table: string) {
      const call: Call = { op: 'read', table, filters: [] };
      calls.push(call);
      const execute = async (single = false) => {
        const result = (tables[table] ?? []).filter((r) => call.filters.every(([k, v]) => r[k] === v));
        if (call.op === 'update') {
          if (config.mutationError) return { data: null, error: config.mutationError };
          for (const r of result) Object.assign(r, call.payload);
        }
        const projected = result.map((r) => Object.fromEntries((call.columns ?? '*').split(',').map((k) => k.trim())
          .filter((k) => k in r).map((k) => [k, r[k]])));
        return { data: single ? projected[0] ?? null : projected, error: null };
      };
      const builder = {
        select(columns: string) { call.columns = columns; return builder; },
        update(payload: Row) { call.op = 'update'; call.payload = payload; return builder; },
        eq(k: string, v: unknown) { call.filters.push([k, v]); return builder; },
        is(k: string, v: unknown) { call.filters.push([k, v]); return builder; },
        maybeSingle() { return execute(true); },
        single() { return execute(true); },
        then(resolve: (value: unknown) => unknown, reject: (e: unknown) => unknown) { return execute().then(resolve, reject); },
      };
      return builder;
    },
  };
  return {
    client: client as unknown as SupabaseClient, tables, calls,
    chapter: () => tables.chapters[0], writes: () => calls.filter((c) => c.op === 'update'),
  };
}

const move = (mock: ReturnType<typeof mockClient>, targetFolderId: string | null, ownerId = OWNER, workId = WORK) =>
  moveChapter(mock.client, { ownerId, workId, chapterId: CHAPTER, targetFolderId });

describe('moveChapter (query-boundary contracts)', () => {
  it('moves into another 회차 folder, changing only folder_id (publish state and order untouched)', async () => {
    const mock = mockClient();
    const before = { ...mock.chapter() };
    expect(await move(mock, 'arc2')).toEqual({ ok: true, chapterId: CHAPTER });
    expect(mock.chapter()).toEqual({ ...before, folder_id: 'arc2' });
    expect(mock.writes()).toHaveLength(1);
    expect(mock.writes()[0].payload).toEqual({ folder_id: 'arc2' });
  });

  it('moving to the 회차 root (null or the root id) stores folder_id = null', async () => {
    for (const target of [null, 'root']) {
      const mock = mockClient();
      expect(await move(mock, target)).toEqual({ ok: true, chapterId: CHAPTER });
      expect(mock.chapter().folder_id).toBeNull();
    }
  });

  it('is a no-op success when the chapter is already there', async () => {
    const same = mockClient();
    expect(await move(same, 'arc1')).toEqual({ ok: true, chapterId: CHAPTER });
    expect(same.writes()).toEqual([]);
    // A chapter stored under the root id and one stored as null are both "at the root".
    for (const stored of [null, 'root']) {
      const atRoot = mockClient({ chapterFolder: stored });
      expect(await move(atRoot, null)).toEqual({ ok: true, chapterId: CHAPTER });
      expect(await move(atRoot, 'root')).toEqual({ ok: true, chapterId: CHAPTER });
      expect(atRoot.writes()).toEqual([]);
    }
  });

  it('checks write access first and writes nothing when denied', async () => {
    const mock = mockClient({ reason: 'suspended' });
    expect(await move(mock, 'arc2')).toMatchObject({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(mock.calls[0].op).toBe('get_write_access');
    expect(mock.writes()).toEqual([]);
  });

  it('rejects a work the caller does not own and a chapter of another work', async () => {
    const mock = mockClient();
    expect(await move(mock, 'arc2', OWNER, WORK2)).toEqual({ ok: false, error: '작품을 찾을 수 없어요.' });
    expect(await move(mock, 'arc2', OTHER, WORK)).toEqual({ ok: false, error: '작품을 찾을 수 없어요.' });
    expect(mock.writes()).toEqual([]);
  });

  it.each(['person', 'other-arc', 'missing'])('rejects a non-회차 or other-work target (%s)', async (target) => {
    const mock = mockClient();
    expect(await move(mock, target)).toEqual({ ok: false, error: MOVE_COPY.chapter_only });
    expect(mock.writes()).toEqual([]);
  });

  it('maps an unexpected DB error to Korean copy', async () => {
    const mock = mockClient({ mutationError: { message: 'boom' } });
    expect(await move(mock, 'arc2')).toEqual({ ok: false, error: MOVE_COPY.failed });
  });
});

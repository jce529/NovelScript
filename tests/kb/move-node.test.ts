import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { moveKbNode } from '../../lib/kb/actions';
import { MOVE_COPY } from '../../lib/kb/move-rules';
import { WRITE_SUSPENDED_MESSAGE } from '../../lib/auth/write-access';

type Row = {
  id: string; owner_id: string; work_id: string | null; scope: string; parent_id: string | null; name: string;
  category: string; node_type: string; is_locked: boolean; content: string | null; deleted_at: string | null;
};
type Call = { op: string; table?: string; columns?: string; payload?: Record<string, unknown>; filters: [string, unknown][] };
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORK = '33333333-3333-4333-8333-333333333333';
const WORK2 = '44444444-4444-4444-8444-444444444444';

const row = (id: string, parent_id: string | null, overrides: Partial<Row> = {}): Row => ({
  id, parent_id, owner_id: OWNER, work_id: WORK, scope: 'work', name: id, category: '인물', node_type: 'folder',
  is_locked: false, content: null, deleted_at: null, ...overrides,
});

const fixture = (): Row[] => [
  row('person', null, { name: '인물', is_locked: true }),
  row('main', 'person', { name: '주요' }),
  row('core', 'main', { name: '핵심' }),
  row('doc', 'core', { name: '라온', node_type: 'file', content: '본문' }),
  row('side', 'person', { name: '조연' }),
  row('place', null, { name: '장소', category: '장소', is_locked: true }),
  row('city', 'place', { name: '도시', category: '장소' }),
  row('custom', null, { name: '자료', category: 'custom' }),
  row('shared', null, { name: '공용', category: 'custom', scope: 'account_template', work_id: null }),
  row('shared2', null, { name: '공용2', category: 'custom', scope: 'account_template', work_id: null }),
  row('tpl', null, { name: 'template', category: 'template', is_locked: true }),
  row('other-work-folder', null, { name: '인물', work_id: WORK2, is_locked: true }),
  row('foreign', 'person', { owner_id: OTHER, name: '남의 폴더' }),
];

// Query-boundary double: applies eq/is filters and captures writes; implements only the sibling-name unique index.
function mockClient(initial: Row[], config: { reason?: string; mutationError?: { code?: string; message: string } } = {}) {
  const rows = structuredClone(initial);
  const calls: Call[] = [];
  const client = {
    async rpc(op: string, payload: Record<string, unknown>) {
      calls.push({ op, payload, filters: [] });
      if (op === 'get_write_access') return { data: { can_write: !config.reason, reason: config.reason ?? 'ok' }, error: null };
      return { data: null, error: { message: 'unexpected rpc' } };
    },
    from(table: string) {
      const call: Call = { op: 'read', table, filters: [] };
      calls.push(call);
      const execute = async (single = false) => {
        let result = rows.filter((r) => call.filters.every(([key, value]) => r[key as keyof Row] === value));
        if (call.op === 'update') {
          if (config.mutationError) return { data: null, error: config.mutationError };
          for (const r of result) {
            const next = { ...r, ...call.payload } as Row;
            const clash = rows.some((o) => o.id !== r.id && o.deleted_at === null && o.owner_id === next.owner_id &&
              o.work_id === next.work_id && o.parent_id === next.parent_id && o.name === next.name);
            if (clash) return { data: null, error: { code: '23505', message: 'kb_nodes_sibling_name_unique' } };
            Object.assign(r, call.payload);
          }
          result = [...result];
        }
        const projected = result.map((r) => Object.fromEntries((call.columns ?? '*').split(',').map((k) => k.trim())
          .filter((k) => k in r).map((k) => [k, r[k as keyof Row]])));
        return { data: single ? projected[0] ?? null : projected, error: null };
      };
      const builder = {
        select(columns: string) { call.columns = columns; return builder; },
        update(payload: Record<string, unknown>) { call.op = 'update'; call.payload = payload; return builder; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
        is(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
        maybeSingle() { return execute(true); },
        single() { return execute(true); },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return execute().then(resolve, reject); },
      };
      return builder;
    },
  };
  return {
    client: client as unknown as SupabaseClient, rows, calls,
    writes: () => calls.filter((c) => c.op === 'update'),
  };
}

const move = (mock: ReturnType<typeof mockClient>, nodeId: string, targetParentId: string | null, ownerId = OWNER) =>
  moveKbNode(mock.client, { ownerId, workId: WORK, nodeId, targetParentId });

describe('moveKbNode (query-boundary contracts)', () => {
  it('moves a document to another folder of the same category, changing only parent_id', async () => {
    const mock = mockClient(fixture());
    const before = mock.rows.find((r) => r.id === 'doc')!;
    expect(await move(mock, 'doc', 'side')).toEqual({ ok: true, nodeId: 'doc' });
    const after = mock.rows.find((r) => r.id === 'doc')!;
    expect(after).toEqual({ ...before, parent_id: 'side' });
    expect(mock.writes()).toHaveLength(1);
    expect(mock.writes()[0].payload).toEqual({ parent_id: 'side' });
    expect(mock.writes()[0].filters).toEqual(expect.arrayContaining([['id', 'doc'], ['owner_id', OWNER], ['deleted_at', null]]));
  });

  it('moves a folder (and implicitly its subtree) inside the account area', async () => {
    const mock = mockClient(fixture());
    expect(await move(mock, 'shared2', 'shared')).toEqual({ ok: true, nodeId: 'shared2' });
    expect(mock.rows.find((r) => r.id === 'shared2')!.parent_id).toBe('shared');
  });

  it('is a no-op success when the target is the current parent', async () => {
    const mock = mockClient(fixture());
    expect(await move(mock, 'doc', 'core')).toEqual({ ok: true, nodeId: 'doc' });
    expect(mock.writes()).toEqual([]);
  });

  it('checks write access first and writes nothing when denied', async () => {
    const mock = mockClient(fixture(), { reason: 'suspended' });
    const result = await move(mock, 'doc', 'side');
    expect(result).toMatchObject({ ok: false, code: 'write_suspended', error: WRITE_SUSPENDED_MESSAGE });
    expect(mock.calls[0].op).toBe('get_write_access');
    expect(mock.writes()).toEqual([]);
  });

  it('rejects another owner\'s node and another owner\'s target', async () => {
    const mock = mockClient(fixture());
    expect((await move(mock, 'doc', 'side', OTHER)).ok).toBe(false);
    expect(await move(mock, 'doc', 'foreign')).toEqual({ ok: false, error: MOVE_COPY.missing });
    expect(mock.writes()).toEqual([]);
  });

  it('rejects a work node that belongs to another work page', async () => {
    const mock = mockClient(fixture());
    const result = await moveKbNode(mock.client, { ownerId: OWNER, workId: WORK2, nodeId: 'doc', targetParentId: 'side' });
    expect(result.ok).toBe(false);
    expect(mock.writes()).toEqual([]);
  });

  it.each([
    ['person', 'side', MOVE_COPY.locked],
    ['main', 'main', MOVE_COPY.self],
    ['main', 'core', MOVE_COPY.descendant],
    ['doc', 'city', MOVE_COPY.other_category],
    ['custom', 'shared', MOVE_COPY.other_scope],
    ['doc', 'other-work-folder', MOVE_COPY.other_scope],
    ['tpl', 'custom', MOVE_COPY.excluded],
    ['side', 'doc', MOVE_COPY.not_folder],
  ])('rejects %s -> %s with Korean copy before writing', async (nodeId, target, message) => {
    const mock = mockClient(fixture());
    expect(await move(mock, nodeId, target)).toEqual({ ok: false, error: message });
    expect(mock.writes()).toEqual([]);
  });

  it('maps a sibling-name conflict to a Korean message naming the target and the node (no auto rename)', async () => {
    const rows = [...fixture(), row('dup', 'side', { name: '라온', node_type: 'file' })];
    const mock = mockClient(rows);
    expect(await move(mock, 'doc', 'side')).toEqual({
      ok: false, error: '‘조연’ 폴더에 같은 이름의 ‘라온’이 이미 있어요. 이름을 바꾼 뒤 옮겨 주세요.',
    });
    expect(mock.rows.find((r) => r.id === 'doc')!.parent_id).toBe('core');
  });

  it.each([
    ['locked_node_immutable', MOVE_COPY.locked],
    ['world_branch_confirmed_immutable', MOVE_COPY.branch_confirmed],
    ['world_branch_inherited_immutable', MOVE_COPY.branch_inherited],
    ['something else', MOVE_COPY.failed],
  ])('maps the DB guard %s to Korean copy', async (message, expected) => {
    const mock = mockClient(fixture(), { mutationError: { message } });
    expect(await move(mock, 'doc', 'side')).toEqual({ ok: false, error: expected });
  });
});

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as actions from '../../lib/kb/actions';

type Row = { id: string; owner_id: string; work_id: string | null; scope: string; parent_id: string | null; name: string; category: string; node_type: string; is_locked: boolean; content: string | null; deleted_at: string | null };
type DbError = { code: string; message: string };
type Call = { op: string; table?: string; columns?: string; payload?: Record<string, unknown>; filters: [string, unknown][] };
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WORK = '33333333-3333-4333-8333-333333333333';
const COLLISION = '이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.';
const LOCKED = '기본 템플릿은 수정·이름 변경·삭제·이동할 수 없어요. 사본을 만들어 수정해주세요.';
const row = (overrides: Partial<Row> = {}): Row => ({ id: 'source', owner_id: OWNER, work_id: WORK, scope: 'work', parent_id: 'person', name: '인물', category: 'template', node_type: 'file', is_locked: true, content: '# <% tp.file.title %>\r\n원문', deleted_at: null, ...overrides });
const root = row({ id: 'root', parent_id: null, name: 'template', node_type: 'folder', content: null });
const person = row({ id: 'person', parent_id: 'root', name: '인물', node_type: 'folder', content: null });
const place = row({ id: 'place', parent_id: 'root', name: '장소', node_type: 'folder', content: null });

// Query-boundary contract double: applies filters and captures writes, but implements no DB triggers.
function mockClient(initial: Row[], config: { reason?: string; mutationError?: DbError; readError?: DbError } = {}) {
  const rows = structuredClone(initial);
  const calls: Call[] = [];
  const client = {
    async rpc(op: string, payload: Record<string, unknown>) {
      calls.push({ op, payload, filters: [] });
      if (op === 'get_write_access') return { data: { can_write: !config.reason, reason: config.reason ?? 'ok' }, error: null };
      if (config.mutationError) return { data: null, error: config.mutationError };
      const found = rows.find(r => r.id === payload.p_node_id && r.owner_id === payload.p_owner_id && r.deleted_at === null);
      if (found) found.deleted_at = 'deleted';
      return { data: found?.id ?? null, error: null };
    },
    from(table: string) {
      const call: Call = { op: 'read', table, filters: [] };
      calls.push(call);
      const execute = async (single = false) => {
        if (call.op === 'read' && config.readError) return { data: null, error: config.readError };
        if (call.op !== 'read' && config.mutationError) return { data: null, error: config.mutationError };
        let result = rows.filter(r => call.filters.every(([key, value]) => r[key as keyof Row] === value));
        if (call.op === 'insert') { const inserted = row({ ...call.payload, id: 'copy-id' } as Partial<Row>); rows.push(inserted); result = [inserted]; }
        if (call.op === 'update') for (const r of result) Object.assign(r, call.payload);
        // Respect selected columns, so omitting is_locked from a read cannot silently pass.
        const projected = result.map(r => Object.fromEntries((call.columns ?? '*').split(',').map(k => k.trim()).filter(k => k in r).map(k => [k, r[k as keyof Row]])));
        return { data: single ? projected[0] ?? null : projected, error: null };
      };
      const builder = {
        select(columns: string) { call.columns = columns; return builder; },
        insert(payload: Record<string, unknown>) { call.op = 'insert'; call.payload = payload; return builder; },
        update(payload: Record<string, unknown>) { call.op = 'update'; call.payload = payload; return builder; },
        eq(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
        is(key: string, value: unknown) { call.filters.push([key, value]); return builder; },
        single() { return execute(true); },
        maybeSingle() { return execute(true); },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) { return execute().then(resolve, reject); },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, rows, writes: () => calls.filter(c => ['insert', 'update', 'soft_delete_kb_node'].includes(c.op)) };
}

const mutations = {
  save: (client: SupabaseClient) => actions.saveNodeContent(client, { ownerId: OWNER, nodeId: 'source', content: '변경' }),
  rename: (client: SupabaseClient) => actions.renameNode(client, { ownerId: OWNER, nodeId: 'source', name: '새 이름' }),
  delete: (client: SupabaseClient) => actions.deleteNode(client, { ownerId: OWNER, nodeId: 'source' }),
  move: (client: SupabaseClient) => actions.moveTemplateFile(client, { ownerId: OWNER, nodeId: 'source', targetCategoryFolderId: 'place' }),
};

describe('read-only default template actions (query-boundary contracts)', () => {
  for (const [name, mutate] of Object.entries(mutations)) {
    it.each(['work', 'account_template'])('rejects '+name+' of a locked %s default before writing', async scope => {
      const source = row({ scope, work_id: scope === 'work' ? WORK : null });
      const mock = mockClient([source, root, person, place]);
      expect(await mutate(mock.client)).toEqual({ ok: false, error: LOCKED });
      expect(mock.writes()).toEqual([]);
      expect(mock.rows[0]).toEqual(source);
      expect(mock.calls[0].op).toBe('get_write_access');
      expect(mock.calls[1].filters).toEqual(expect.arrayContaining([['owner_id', OWNER], ['deleted_at', null]]));
    });
    it.each([row({ owner_id: OTHER }), row({ deleted_at: 'deleted' })])('rejects '+name+' of inaccessible/deleted source without writing', async source => {
      const mock = mockClient([source, root, person, place]);
      expect((await mutate(mock.client)).ok).toBe(false);
      expect(mock.writes()).toEqual([]);
    });
    it('keeps '+name+' available on an unlocked custom template', async () => {
      const mock = mockClient([row({ is_locked: false, name: '내 양식' }), root, person, place]);
      expect(await mutate(mock.client)).toEqual({ ok: true, nodeId: 'source' });
      expect(mock.writes()).toHaveLength(1);
    });
    it('rejects '+name+' for a suspended user before reading a node', async () => {
      const mock = mockClient([row()], { reason: 'suspended' });
      expect(await mutate(mock.client)).toMatchObject({ ok: false, code: 'write_suspended' });
      expect(mock.calls).toHaveLength(1);
      expect(mock.writes()).toEqual([]);
    });
  }
  it.each(['locked_template_immutable', 'locked_node_immutable'])('maps save DB guard %s to the same copy guidance', async message => {
    const mock = mockClient([row({ is_locked: false })], { mutationError: { code: 'P0001', message } });
    expect(await mutations.save(mock.client)).toEqual({ ok: false, error: LOCKED });
  });
  it('retains the existing locked-folder rename error', async () => {
    const mock = mockClient([row({ category: '인물', node_type: 'folder' })], { mutationError: { code: 'P0001', message: 'locked_node_immutable' } });
    expect(await mutations.rename(mock.client)).toEqual({ ok: false, error: '기본 폴더는 이름을 바꾸거나 삭제할 수 없어요.' });
  });
  it.each(['save', 'rename', 'delete'] as const)('preserves ordinary document %s behavior', async name => {
    const mock = mockClient([row({ category: '인물', is_locked: false })]);
    expect(await mutations[name](mock.client)).toEqual({ ok: true, nodeId: 'source' });
    expect(mock.writes()).toHaveLength(1);
  });
});

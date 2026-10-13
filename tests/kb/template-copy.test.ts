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

const input = { ownerId: OWNER, workId: WORK, nodeId: 'source', name: '  인물 사본  ' };
describe('copyTemplateFile (query-boundary contracts; no DB trigger simulation)', () => {
  it.each(['work', 'account_template'])('copies raw content into the same %s parent with one unlocked insert', async scope => {
    const area = { scope, work_id: scope === 'work' ? WORK : null };
    const source = row(area);
    const mock = mockClient([source, { ...person, ...area }, { ...root, ...area }]);
    expect(await actions.copyTemplateFile(mock.client, input)).toEqual({ ok: true, nodeId: 'copy-id' });
    expect(mock.writes()).toHaveLength(1);
    expect(mock.writes()[0]).toMatchObject({ op: 'insert', payload: { owner_id: OWNER, work_id: source.work_id, scope, parent_id: 'person', category: 'template', node_type: 'file', is_locked: false, name: '인물 사본', content: source.content } });
    expect(mock.rows[0]).toEqual(source);
    expect(mock.calls[0].op).toBe('get_write_access');
    for (const call of mock.calls.filter(c => c.op === 'read')) expect(call.filters).toEqual(expect.arrayContaining([['owner_id', OWNER], ['deleted_at', null]]));
  });
  it.each(['', '# 내용에 placeholder 없음', '\uFEFF# <% tp.file.title %>\r\n원문'])('preserves original bytes even for %j', async content => {
    const mock = mockClient([row({ content, is_locked: false, name: '사용자 원본' }), person, root]);
    expect((await actions.copyTemplateFile(mock.client, input)).ok).toBe(true);
    expect(mock.writes()[0].payload?.content).toBe(content);
    expect(mock.rows[0].content).toBe(content);
  });
  it.each(['', '  ', '\t\n'])('rejects blank copy name %j without writing', async name => {
    const mock = mockClient([row(), person, root]);
    expect(await actions.copyTemplateFile(mock.client, { ...input, name })).toEqual({ ok: false, error: '이름을 입력해주세요.' });
    expect(mock.writes()).toEqual([]);
  });
  it('maps duplicate-name insert (23505) without retrying or revealing DB details', async () => {
    const mock = mockClient([row(), person, root], { mutationError: { code: '23505', message: 'raw unique index detail' } });
    expect(await actions.copyTemplateFile(mock.client, input)).toEqual({ ok: false, error: COLLISION });
    expect(mock.writes()).toHaveLength(1);
    expect(mock.rows).toHaveLength(3);
  });
  it.each([
    { owner_id: OTHER }, { deleted_at: 'deleted' }, { category: '인물' }, { node_type: 'folder' },
    { work_id: 'other-work' }, { scope: 'account_template', work_id: WORK },
    { scope: 'work', work_id: null }, { scope: 'unknown' }, { parent_id: null },
  ])('rejects invalid source %j without writes', async overrides => {
    const mock = mockClient([row(overrides), person, root]);
    expect((await actions.copyTemplateFile(mock.client, input)).ok).toBe(false);
    expect(mock.writes()).toEqual([]);
  });
  it.each([
    { owner_id: OTHER }, { deleted_at: 'deleted' }, { scope: 'account_template', work_id: null },
    { work_id: 'other-work' }, { name: '임의 폴더' }, { node_type: 'file' }, { category: 'custom' },
  ])('rejects invalid category parent %j', async overrides => {
    const mock = mockClient([row(), { ...person, ...overrides }, root]);
    expect((await actions.copyTemplateFile(mock.client, input)).ok).toBe(false);
    expect(mock.writes()).toEqual([]);
  });
  it.each([{ owner_id: OTHER }, { deleted_at: 'deleted' }, { work_id: 'other-work' }, { parent_id: 'another-root' }, { category: 'custom' }])('rejects invalid root %j', async overrides => {
    const mock = mockClient([row(), person, { ...root, ...overrides }]);
    expect((await actions.copyTemplateFile(mock.client, input)).ok).toBe(false);
    expect(mock.writes()).toEqual([]);
  });
  it.each(['suspended', 'permanent_suspension', 'forbidden'])('rejects write-access reason %s before any node lookup', async reason => {
    const mock = mockClient([row(), person, root], { reason });
    expect((await actions.copyTemplateFile(mock.client, input)).ok).toBe(false);
    expect(mock.calls).toHaveLength(1);
    expect(mock.writes()).toEqual([]);
  });
  it('fails closed on source query error', async () => {
    const mock = mockClient([row(), person, root], { readError: { code: '500', message: 'read failed' } });
    expect((await actions.copyTemplateFile(mock.client, input)).ok).toBe(false);
    expect(mock.writes()).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as actions from '../../lib/kb/actions';
import { buildSeedContent, readCanonicalSeed } from '../../lib/kb/templates';

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

// ---- Task 2: default selection policy + template name collisions (mock units; DB suites run in 02-13) ----
const RESERVED = '기본 템플릿 이름은 사용할 수 없어요. 다른 이름을 사용해주세요.';
const CUSTOM = '# 내 양식: <% tp.file.title %>';
const folder = (overrides: Partial<Row>) => row({ node_type: 'folder', content: null, is_locked: true, ...overrides });
const accountArea = { scope: 'account_template', work_id: null } as const;
const optionFixture = (): Row[] => [
  // A spoofed root for the same work id owned by someone else must never be read.
  folder({ id: 'spoof-root', owner_id: OTHER, parent_id: null, name: 'template' }),
  folder({ id: 'spoof-person', owner_id: OTHER, parent_id: 'spoof-root', name: '인물' }),
  row({ id: 'spoof-file', owner_id: OTHER, parent_id: 'spoof-person', name: '남의 양식', is_locked: false }),
  root, person, place,
  row({ id: 'work-default', parent_id: 'person', name: '인물', is_locked: true }),
  row({ id: 'work-custom', parent_id: 'person', name: '내캐릭터양식', is_locked: false, content: CUSTOM }),
  row({ id: 'work-copy', parent_id: 'person', name: '인물 사본', is_locked: false, content: '# 작품 사본' }),
  row({ id: 'work-place', parent_id: 'place', name: '장소 양식', is_locked: false }),
  folder({ id: 'acct-root', parent_id: null, name: 'template', ...accountArea }),
  folder({ id: 'acct-person', parent_id: 'acct-root', name: '인물', ...accountArea }),
  folder({ id: 'acct-place', parent_id: 'acct-root', name: '장소', ...accountArea }),
  row({ id: 'acct-default', parent_id: 'acct-person', name: '인물', is_locked: true, ...accountArea }),
  row({ id: 'acct-copy', parent_id: 'acct-person', name: '인물 사본', is_locked: false, content: '# 계정 사본', ...accountArea }),
  folder({ id: 'other-root', parent_id: null, name: 'template', work_id: 'other-work' }),
  folder({ id: 'other-place', parent_id: 'other-root', name: '장소', work_id: 'other-work' }),
  folder({ id: 'doc-folder', parent_id: null, name: '인물', category: '인물' }),
];

describe('default template selection (Reopen D-10, mock units)', () => {
  it('lists one canonical default and only unlocked, owner-scoped custom templates', async () => {
    const mock = mockClient(optionFixture());
    const options = await actions.listTemplateOptions(mock.client, { ownerId: OWNER, workId: WORK, category: '인물' });
    expect(options.filter(o => o.isDefault)).toEqual([
      { id: null, name: '기본 인물 템플릿', scope: 'canonical', content: await readCanonicalSeed('인물'), isDefault: true },
    ]);
    expect(options.filter(o => !o.isDefault).map(o => [o.scope, o.id, o.name, o.content])).toEqual([
      ['work', 'work-custom', '내캐릭터양식', CUSTOM],
      ['work', 'work-copy', '인물 사본', '# 작품 사본'],
      ['account_template', 'acct-copy', '인물 사본', '# 계정 사본'],
    ]);
    for (const call of mock.calls.filter(c => c.op === 'read')) expect(call.filters).toEqual(expect.arrayContaining([['owner_id', OWNER]]));
  });

  it('keeps the Phase 15 null contract: validateTargetTemplate(null) is the canonical default', async () => {
    const mock = mockClient(optionFixture());
    const resolved = await actions.validateTargetTemplate(mock.client, { ownerId: OWNER, workId: WORK, category: '인물', templateId: null });
    expect(resolved).toMatchObject({ ok: true, template: { id: null, scope: 'canonical', isDefault: true } });
    for (const id of ['work-default', 'acct-default', 'spoof-file', 'work-place']) {
      expect(await actions.validateTargetTemplate(mock.client, { ownerId: OWNER, workId: WORK, category: '인물', templateId: id })).toEqual({ ok: false });
    }
    expect(await actions.validateTargetTemplate(mock.client, { ownerId: OWNER, workId: WORK, category: '인물', templateId: 'acct-copy' }))
      .toMatchObject({ ok: true, template: { id: 'acct-copy', scope: 'account_template' } });
  });

  it('auto default uses the canonical seed even when an unlocked category-named file exists', async () => {
    const legacy = row({ id: 'legacy-edit', parent_id: 'person', name: '인물', is_locked: false, content: '# 예전 편집본' });
    const mock = mockClient([...optionFixture().filter(r => r.id !== 'work-default'), legacy]);
    const result = await actions.createNode(mock.client, { ownerId: OWNER, workId: WORK, parentId: 'doc-folder', category: '인물', nodeType: 'file', name: '아서' });
    expect(result).toEqual({ ok: true, nodeId: 'copy-id' });
    expect(mock.writes()[0].payload?.content).toBe(await buildSeedContent('인물', '아서', null));
  });

  it('explicit custom selection seeds the picked raw content with the title substituted', async () => {
    const mock = mockClient(optionFixture());
    await actions.createNode(mock.client, { ownerId: OWNER, workId: WORK, parentId: 'doc-folder', category: '인물', nodeType: 'file', name: '아서', templateOverrideContent: CUSTOM });
    expect(mock.writes()[0].payload?.content).toBe('# 내 양식: 아서');
  });
});

describe('template name collisions (0023 area unique index, mock units)', () => {
  it.each([
    ['23505', 'duplicate key value violates unique constraint "kb_nodes_template_area_name_unique"', COLLISION],
    ['P0001', 'template_name_reserved', RESERVED],
  ])('createNode template %s maps to friendly copy without nodeId', async (code, message, expected) => {
    const mock = mockClient(optionFixture(), { mutationError: { code, message } });
    const result = await actions.createNode(mock.client, { ownerId: OWNER, workId: WORK, parentId: 'place', category: 'template', nodeType: 'file', name: '인물 사본' });
    expect(result).toEqual({ ok: false, error: expected });
  });
  it('renameNode of a custom template maps 23505 to the template collision copy', async () => {
    const mock = mockClient(optionFixture(), { mutationError: { code: '23505', message: 'raw unique detail' } });
    const result = await actions.renameNode(mock.client, { ownerId: OWNER, nodeId: 'work-custom', name: '인물 사본' });
    expect(result).toEqual({ ok: false, error: COLLISION });
  });
  it('renameNode of an ordinary document keeps the generic collision copy', async () => {
    const mock = mockClient([row({ category: '인물', is_locked: false })], { mutationError: { code: '23505', message: 'raw' } });
    expect(await mutations.rename(mock.client)).toEqual({ ok: false, error: '이미 같은 이름의 파일/폴더가 있어요. 다른 이름을 사용해주세요.' });
  });
});

describe('custom template move (mock units)', () => {
  it('moves within the same area and preserves id and raw content', async () => {
    const mock = mockClient(optionFixture());
    expect(await actions.moveTemplateFile(mock.client, { ownerId: OWNER, nodeId: 'work-custom', targetCategoryFolderId: 'place' }))
      .toEqual({ ok: true, nodeId: 'work-custom' });
    expect(mock.rows.find(r => r.id === 'work-custom')).toMatchObject({ parent_id: 'place', content: CUSTOM });
  });
  it.each([
    ['other work', OWNER, 'other-place'],
    ['account area', OWNER, 'acct-place'],
    ['other owner', OTHER, 'place'],
  ])('rejects a move into %s without writing', async (_label, ownerId, target) => {
    const mock = mockClient(optionFixture());
    expect((await actions.moveTemplateFile(mock.client, { ownerId, nodeId: 'work-custom', targetCategoryFolderId: target })).ok).toBe(false);
    expect(mock.writes()).toEqual([]);
    expect(mock.rows.find(r => r.id === 'work-custom')).toMatchObject({ parent_id: 'person', content: CUSTOM });
  });
});

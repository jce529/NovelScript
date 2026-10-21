import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedTemplateFiles, readCanonicalSeed, KB_CATEGORIES } from '../../lib/kb/templates';

// Mock Supabase: every awaited query (or maybeSingle) consumes the next queued response in order.
type Response = { data?: unknown; error?: { message: string; code?: string } | null };
interface Call { table: string; op: 'select' | 'insert'; columns?: string; rows?: unknown; filters: [string, string, unknown][] }

function mockClient(responses: Response[]) {
  const calls: Call[] = [];
  const queue = [...responses];
  const next = () => {
    const response = queue.shift();
    if (!response) throw new Error('unexpected query (no queued response)');
    return Promise.resolve({ data: response.data ?? null, error: response.error ?? null });
  };
  const client = {
    from(table: string) {
      const call: Call = { table, op: 'select', filters: [] };
      calls.push(call);
      const builder = {
        select(columns: string) { if (call.op !== 'insert') call.columns = columns; return builder; },
        insert(rows: unknown) { call.op = 'insert'; call.rows = rows; return builder; },
        eq(column: string, value: unknown) { call.filters.push(['eq', column, value]); return builder; },
        is(column: string, value: unknown) { call.filters.push(['is', column, value]); return builder; },
        in(column: string, value: unknown) { call.filters.push(['in', column, value]); return builder; },
        maybeSingle: next,
        then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) { return next().then(resolve, reject); },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, remaining: () => queue.length };
}

const OWNER = 'owner-1';
const WORK = 'work-1';
const ROOT = 'root-1';
const params = { ownerId: OWNER, workId: WORK, scope: 'work' as const, templateRootId: ROOT };
const root = { id: ROOT, owner_id: OWNER, scope: 'work', work_id: WORK, parent_id: null, node_type: 'folder', category: 'template' };
const folders = KB_CATEGORIES.map((name) => ({ id: `folder-${name}`, name }));
const lockedDefaults = KB_CATEGORIES.map((name) => ({ parent_id: `folder-${name}`, name, is_locked: true }));
const canonical = (category: string) =>
  readFileSync(path.join(process.cwd(), 'docs', 'Template', `${category} 템플릿.md`), 'utf8').replaceAll('\r', '');

describe('readCanonicalSeed', () => {
  it.each(KB_CATEGORIES)('%s returns the repo original with CR removed (matches the 0022 SQL catalog)', async (category) => {
    const raw = await readCanonicalSeed(category);
    expect(raw).not.toContain('\r');
    expect(raw).toBe(canonical(category));
  });
});

describe('seedTemplateFiles (Reopen D-10: read-only defaults)', () => {
  it('seeds a new area with the 5 defaults locked and raw canonical content (placeholder kept)', async () => {
    const { client, calls } = mockClient([{ data: root }, { data: folders }, { data: [] }, { data: null }]);
    const result = await seedTemplateFiles(client, params);
    expect(result).toEqual({ created: [...KB_CATEGORIES], existing: [], blocked: [] });
    const insert = calls.find((call) => call.op === 'insert')!;
    const rows = insert.rows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row).toMatchObject({
        owner_id: OWNER, work_id: WORK, scope: 'work', node_type: 'file', category: 'template', is_locked: true,
      });
      expect(row.parent_id).toBe(`folder-${row.name}`);
      expect(row.content).toBe(canonical(row.name as string));
    }
    expect(rows.find((row) => row.name === '인물')!.content).toContain('<% tp.file.title %>');
  });

  it('re-validates the template root against the server session owner/scope before writing', async () => {
    const { client, calls } = mockClient([{ data: root }, { data: folders }, { data: [] }, { data: null }]);
    await seedTemplateFiles(client, params);
    const rootQuery = calls[0];
    expect(rootQuery.filters).toEqual(expect.arrayContaining([
      ['eq', 'id', ROOT], ['eq', 'owner_id', OWNER], ['is', 'deleted_at', null],
    ]));
    const folderQuery = calls[1];
    expect(folderQuery.filters).toEqual(expect.arrayContaining([['eq', 'owner_id', OWNER], ['eq', 'parent_id', ROOT]]));
  });

  it('is a no-write no-op on revisit when all 5 locked defaults exist', async () => {
    const { client, calls } = mockClient([{ data: root }, { data: folders }, { data: lockedDefaults }]);
    const result = await seedTemplateFiles(client, params);
    expect(result).toEqual({ created: [], existing: [...KB_CATEGORIES], blocked: [] });
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('custom-only folders get the missing defaults; user templates are never touched', async () => {
    const userFiles = [{ parent_id: 'folder-인물', name: '내 인물 양식', is_locked: false }];
    const { client, calls } = mockClient([{ data: root }, { data: folders }, { data: userFiles }, { data: null }]);
    const result = await seedTemplateFiles(client, params);
    expect(result.created).toEqual([...KB_CATEGORIES]);
    const rows = calls.find((call) => call.op === 'insert')!.rows as Array<{ name: string }>;
    expect(rows.map((row) => row.name)).not.toContain('내 인물 양식');
  });

  it('does not overwrite an unlocked file that holds a default name (left for the 0022 migration)', async () => {
    const files = [
      { parent_id: 'folder-인물', name: '인물', is_locked: false },
      ...lockedDefaults.filter((file) => file.name !== '인물' && file.name !== '사건'),
    ];
    const { client, calls } = mockClient([{ data: root }, { data: folders }, { data: files }, { data: null }]);
    const result = await seedTemplateFiles(client, params);
    expect(result).toEqual({ created: ['사건'], existing: ['장소', '세력', '아이템'], blocked: ['인물'] });
    const rows = calls.find((call) => call.op === 'insert')!.rows as Array<{ name: string }>;
    expect(rows.map((row) => row.name)).toEqual(['사건']);
  });

  it('fails clearly when a category folder is missing, without inserting anything', async () => {
    const { client, calls } = mockClient([{ data: root }, { data: folders.filter((f) => f.name !== '사건') }]);
    await expect(seedTemplateFiles(client, params)).rejects.toThrow('템플릿 카테고리 폴더가 없어요: 사건');
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('fails clearly when the root does not belong to the owner/scope', async () => {
    const { client, calls } = mockClient([{ data: { ...root, scope: 'account_template', work_id: null } }]);
    await expect(seedTemplateFiles(client, params)).rejects.toThrow('템플릿 영역을 찾을 수 없어요.');
    expect(calls).toHaveLength(1);
    const missing = mockClient([{ data: null }]);
    await expect(seedTemplateFiles(missing.client, params)).rejects.toThrow('템플릿 영역을 찾을 수 없어요.');
  });

  it('surfaces query failures as errors', async () => {
    const { client } = mockClient([{ data: root }, { data: folders }, { error: { message: 'boom' } }]);
    await expect(seedTemplateFiles(client, params)).rejects.toThrow('boom');
  });

  it('treats a concurrent duplicate seed (23505) as already seeded after re-checking', async () => {
    const { client, remaining } = mockClient([
      { data: root }, { data: folders }, { data: [] },
      { error: { message: 'duplicate key', code: '23505' } },
      { data: lockedDefaults },
    ]);
    const result = await seedTemplateFiles(client, params);
    expect(result).toEqual({ created: [], existing: [...KB_CATEGORIES], blocked: [] });
    expect(remaining()).toBe(0);
  });

  it('rethrows other insert errors (e.g. DB guard rejection)', async () => {
    const { client } = mockClient([
      { data: root }, { data: folders }, { data: [] }, { error: { message: 'invalid_template_seed', code: 'P0001' } },
    ]);
    await expect(seedTemplateFiles(client, params)).rejects.toThrow('invalid_template_seed');
  });
});

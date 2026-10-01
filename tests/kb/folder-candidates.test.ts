import { describe, expect, it } from 'vitest';
import {
  formatFolderPath,
  listCategoryFolderCandidates,
  MAX_FOLDER_DEPTH,
} from '../../lib/kb/actions';

type FolderRow = { id: string; name: string; parent_id: string | null };

function candidateClient(data: FolderRow[] | null, error: unknown = null) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) query[method] = () => query;
  query.is = () => Promise.resolve({ data, error });
  return { from: () => query } as never;
}

const input = { ownerId: 'owner', workId: 'work', category: '인물' };
const root: FolderRow = { id: 'root', name: '인물', parent_id: null };

describe('listCategoryFolderCandidates', () => {
  it('returns the structural root and its child folders', async () => {
    const result = await listCategoryFolderCandidates(candidateClient([
      root, { id: 'child', name: '주요 등장인물', parent_id: 'root' },
    ]), input);

    expect(result).toMatchObject({ status: 'ok' });
    if (result.status === 'ok') {
      expect(result.candidates).toHaveLength(2);
      expect(result.root).toMatchObject({ id: 'root', isRoot: true, path: '' });
    }
  });

  it('builds a path below the category root', async () => {
    const result = await listCategoryFolderCandidates(candidateClient([
      root,
      { id: 'main', name: '주요 등장인물', parent_id: 'root' },
      { id: 'key', name: '핵심', parent_id: 'main' },
    ]), input);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.candidates.find((item) => item.id === 'key')?.path).toBe('주요 등장인물/핵심');
  });

  it('excludes an orphan whose deleted parent is absent from the result set', async () => {
    const result = await listCategoryFolderCandidates(candidateClient([
      root, { id: 'orphan', name: '고아', parent_id: 'deleted-parent' },
    ]), input);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.candidates.map((item) => item.id)).not.toContain('orphan');
  });

  it('reports a missing structural root', async () => {
    await expect(listCategoryFolderCandidates(candidateClient([
      { id: 'child', name: '하위', parent_id: 'missing-root' },
    ]), input)).resolves.toEqual({ status: 'root_missing' });
  });

  it('reports duplicate structural roots without candidates', async () => {
    await expect(listCategoryFolderCandidates(candidateClient([
      root, { id: 'root-2', name: '인물', parent_id: null },
    ]), input)).resolves.toEqual({ status: 'root_duplicate' });
  });

  it('reports query failures separately from a missing root', async () => {
    await expect(listCategoryFolderCandidates(candidateClient(null, { message: 'network' }), input))
      .resolves.toEqual({ status: 'query_failed' });
  });

  it('terminates and excludes cyclic folders', async () => {
    const result = await listCategoryFolderCandidates(candidateClient([
      root,
      { id: 'a', name: 'A', parent_id: 'b' },
      { id: 'b', name: 'B', parent_id: 'a' },
    ]), input);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.candidates.map((item) => item.id)).toEqual(['root']);
  });

  it('returns a root-to-self id:name version that changes when an ancestor name changes', async () => {
    const rows = [root, { id: 'main', name: '주요', parent_id: 'root' }, { id: 'key', name: '핵심', parent_id: 'main' }];
    const before = await listCategoryFolderCandidates(candidateClient(rows), input);
    const after = await listCategoryFolderCandidates(candidateClient([
      root, { id: 'main', name: '변경', parent_id: 'root' }, { id: 'key', name: '핵심', parent_id: 'main' },
    ]), input);

    expect(before.status).toBe('ok');
    expect(after.status).toBe('ok');
    if (before.status === 'ok' && after.status === 'ok') {
      expect(before.candidates.find((item) => item.id === 'key')?.version).toBe('root:인물/main:주요/key:핵심');
      expect(after.candidates.find((item) => item.id === 'key')?.version).not.toBe(before.candidates.find((item) => item.id === 'key')?.version);
    }
  });

  it('orders root first, then path and id deterministically', async () => {
    const result = await listCategoryFolderCandidates(candidateClient([
      root,
      { id: 'z', name: '동일', parent_id: 'root' },
      { id: 'a', name: '동일', parent_id: 'root' },
      { id: 'b', name: '가나다', parent_id: 'root' },
    ]), input);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.candidates.map((item) => item.id)).toEqual(['root', 'b', 'a', 'z']);
  });
});

describe('folder candidate helpers', () => {
  it('formats a display path and exposes a bounded traversal depth', () => {
    expect(formatFolderPath('인물', '주요/핵심', ' › ')).toBe('인물 › 주요/핵심');
    expect(formatFolderPath('인물', '', '/')).toBe('인물');
    expect(MAX_FOLDER_DEPTH).toBe(32);
  });
});

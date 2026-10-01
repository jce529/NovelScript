import { describe, expect, it } from 'vitest';
import {
  buildOpaqueKeyMap,
  CATEGORY_CANDIDATES,
  shuffleArray,
  sortFolderCandidates,
  sortTemplateOptions,
  TASK_CANDIDATES,
} from '@/lib/ai/decision/candidates';
import type { FolderCandidate, TemplateOption } from '@/lib/kb/actions';
import { KB_CATEGORIES } from '@/lib/kb/categories';

describe('Jev decision candidates', () => {
  it('assigns opaque keys in input order and resolves original items without exposing ids', () => {
    const items = [{ id: 'secret-a', path: 'A' }, { id: 'secret-b', path: 'B' }];
    const result = buildOpaqueKeyMap(items, 'folder', (item) => ({ path: item.path }));
    expect(result.candidates).toEqual([{ path: 'A', key: 'folder_1' }, { path: 'B', key: 'folder_2' }]);
    expect(result.candidates.every((candidate) => !('id' in candidate))).toBe(true);
    expect(result.resolve('folder_1')).toBe(items[0]);
    expect(result.resolve('folder_2')).toBe(items[1]);
  });

  it('returns undefined for unknown opaque keys', () => {
    const result = buildOpaqueKeyMap([{ id: 'a' }], 'folder', () => ({}));
    expect(result.resolve('folder_99')).toBeUndefined();
  });

  it('exports the fixed task and category candidate sets', () => {
    expect(TASK_CANDIDATES).toEqual(['reply', 'draft', 'document', 'clarify']);
    expect(CATEGORY_CANDIDATES).toEqual([...KB_CATEGORIES, 'clarify']);
    expect(CATEGORY_CANDIDATES).toHaveLength(6);
  });

  it('shuffles deterministically while preserving elements', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const first = shuffleArray(items, 1);
    expect(shuffleArray(items, 1)).toEqual(first);
    expect(shuffleArray(items, 2)).not.toEqual(first);
    expect([...first].sort()).toEqual([...items].sort());
  });

  it('sorts root first then folders by path and id independent of input order', () => {
    const folders: FolderCandidate[] = [
      { id: 'b', name: 'B', isRoot: false, path: 'same', version: '' },
      { id: 'root', name: 'Root', isRoot: true, path: '', version: '' },
      { id: 'a', name: 'A', isRoot: false, path: 'same', version: '' },
      { id: 'z', name: 'Z', isRoot: false, path: 'alpha', version: '' },
    ];
    expect(sortFolderCandidates(folders).map((folder) => folder.id)).toEqual(['root', 'z', 'a', 'b']);
    expect(sortFolderCandidates([...folders].reverse()).map((folder) => folder.id)).toEqual(['root', 'z', 'a', 'b']);
  });

  it('sorts templates by scope, name, and nullable id independent of input order', () => {
    const templates: TemplateOption[] = [
      { id: 'z', name: 'Same', scope: 'canonical', content: '', isDefault: false },
      { id: null, name: 'Same', scope: 'work', content: '', isDefault: false },
      { id: 'b', name: 'Beta', scope: 'account_template', content: '', isDefault: false },
      { id: 'a', name: 'Alpha', scope: 'work', content: '', isDefault: false },
      { id: 'a', name: 'Same', scope: 'work', content: '', isDefault: false },
    ];
    const expected = ['a', null, 'a', 'b', 'z'];
    expect(sortTemplateOptions(templates).map((template) => template.id)).toEqual(expected);
    expect(sortTemplateOptions([...templates].reverse()).map((template) => template.id)).toEqual(expected);
  });
});


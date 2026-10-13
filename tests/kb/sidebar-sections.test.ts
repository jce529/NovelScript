import { describe, expect, it } from 'vitest';
import { partitionStudioSidebar } from '@/lib/kb/sidebar-sections';
import { buildTree, type FlatKbNode } from '@/lib/kb/tree';
import { KB_CATEGORIES } from '@/lib/kb/categories';

type Scope = 'work' | 'account_template';
const flat = (id: string, name: string, parent_id: string | null, node_type: 'folder' | 'file', category: string, scope: Scope, is_locked = false): FlatKbNode =>
  ({ id, name, parent_id, node_type, category, scope, is_locked });

function templateArea(scope: Scope, prefix: string, extra: FlatKbNode[] = []): FlatKbNode[] {
  const root = flat(`${prefix}-root`, '템플릿', null, 'folder', 'template', scope, true);
  const rows = [root];
  for (const c of KB_CATEGORIES) {
    rows.push(flat(`${prefix}-${c}`, c, root.id, 'folder', 'template', scope, true));
    rows.push(flat(`${prefix}-default-${c}`, `기본 ${c} 템플릿`, `${prefix}-${c}`, 'file', 'template', scope, true));
  }
  return [...rows, ...extra];
}

const workBase = [
  ...templateArea('work', 'w', [
    flat('w-mine', '내 인물', 'w-인물', 'file', 'template', 'work'),
    flat('w-loose', '미분류 양식', 'w-root', 'file', 'template', 'work'),
  ]),
  flat('w-chap', '회차', null, 'folder', '회차', 'work', true),
  flat('w-people', '인물', null, 'folder', '인물', 'work', true),
  flat('w-custom', '내 폴더', null, 'folder', 'custom', 'work'),
];
const accountBase = [
  ...templateArea('account_template', 'a', [flat('a-mine', '계정 장소', 'a-장소', 'file', 'template', 'account_template')]),
  flat('a-custom', '공유', null, 'folder', 'custom', 'account_template'),
];

describe('partitionStudioSidebar', () => {
  const sections = partitionStudioSidebar(buildTree(workBase), buildTree(accountBase));

  it('shows exactly 5 defaults even with two scopes, preferring the work copy', () => {
    expect(sections.defaultTemplates.map((e) => e.category)).toEqual([...KB_CATEGORIES]);
    expect(sections.defaultTemplates.every((e) => e.node.scope === 'work')).toBe(true);
  });

  it('falls back to the account default when the work scope has none', () => {
    const noWork = partitionStudioSidebar(buildTree([flat('w-chap', '회차', null, 'folder', '회차', 'work', true)]), buildTree(accountBase));
    expect(noWork.defaultTemplates).toHaveLength(5);
    expect(noWork.defaultTemplates.every((e) => e.node.scope === 'account_template')).toBe(true);
  });

  it('keeps every user template, including loose and cross-scope ones', () => {
    expect(sections.myTemplates.map((e) => e.node.id).sort()).toEqual(['a-mine', 'w-loose', 'w-mine']);
    expect(sections.myTemplates.find((e) => e.node.id === 'w-loose')?.category).toBeNull();
    expect(sections.myTemplates.find((e) => e.node.id === 'w-mine')?.category).toBe('인물');
  });

  it('separates folders, shared folders and chapters once each by id', () => {
    expect(sections.myFolders.map((n) => n.id).sort()).toEqual(['w-custom', 'w-people']);
    expect(sections.sharedFolders.map((n) => n.id)).toEqual(['a-custom']);
    expect(sections.chapterRoots.map((n) => n.id)).toEqual(['w-chap']);
  });

  it('does not lose roots with unexpected shapes', () => {
    const odd = partitionStudioSidebar(
      buildTree([flat('x', '이상한', null, 'folder', '사건', 'work')]),
      buildTree([flat('y', '이상한2', null, 'folder', '인물', 'account_template')]),
    );
    expect(odd.myFolders.map((n) => n.id)).toEqual(['x']);
    expect(odd.sharedFolders.map((n) => n.id)).toEqual(['y']);
  });

  it('handles missing template roots without throwing', () => {
    const empty = partitionStudioSidebar([], []);
    expect(empty.defaultTemplates).toEqual([]);
    expect(empty.templateRoots).toEqual([]);
  });

  it('exposes serializable area category folders for both scopes', () => {
    expect(sections.templateRoots.map((r) => r.scope)).toEqual(['work', 'account_template']);
    expect(sections.templateRoots[0].folders.map((f) => f.name)).toEqual([...KB_CATEGORIES]);
  });
});

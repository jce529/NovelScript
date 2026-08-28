import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTree, type FlatKbNode } from '../../lib/kb/tree';
import { getKbTree } from '../../lib/kb/actions';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

function node(overrides: Partial<FlatKbNode> & Pick<FlatKbNode, 'id' | 'parent_id'>): FlatKbNode {
  return {
    name: overrides.id,
    node_type: 'folder',
    category: '인물',
    is_locked: false,
    scope: 'work',
    ...overrides,
  };
}

describe('buildTree (pure, lib/kb/tree.ts)', () => {
  it('nests one root with its children in the same relative order as the input', () => {
    const flat = [node({ id: 'a', parent_id: null }), node({ id: 'b', parent_id: 'a' }), node({ id: 'c', parent_id: 'a' })];
    const tree = buildTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
    expect(tree[0].children.map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('returns [] for an empty work with no nodes', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('treats a node whose parent_id is not present in the list as a root, without throwing', () => {
    const flat = [node({ id: 'orphan', parent_id: 'does-not-exist' })];
    expect(() => buildTree(flat)).not.toThrow();
    const tree = buildTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('orphan');
  });
});

describe('getKbTree (integration, lib/kb/actions.ts)', () => {
  const admin = adminClient();
  let userA: { id: string };
  let userB: { id: string };
  let workAId: string;

  beforeAll(async () => {
    userA = await createTestUser();
    userB = await createTestUser();

    const { data: workId, error: workErr } = await admin.rpc('create_work', {
      p_owner_id: userA.id,
      p_title: '테스트 작품 (tree-query)',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (workErr) throw workErr;
    workAId = workId as string;

    const { data: accountRootId, error: rootErr } = await admin.rpc('ensure_account_template_root', {
      p_owner_id: userA.id,
    });
    if (rootErr) throw rootErr;

    // Give the account template root a child so the "merges in ... + its children" behavior is exercised.
    const { error: childErr } = await admin.from('kb_nodes').insert({
      owner_id: userA.id,
      work_id: null,
      scope: 'account_template',
      parent_id: accountRootId,
      node_type: 'file',
      category: 'template',
      is_locked: false,
      name: '인물',
      content: '# 계정 커스텀 인물 템플릿',
    });
    if (childErr) throw childErr;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(userA.id);
    await deleteTestUser(userB.id);
  });

  it("merges the work's own nodes with the owner's account-level template root + children, each tagged by scope", async () => {
    const nodes = await getKbTree(admin, { ownerId: userA.id, workId: workAId });
    const scopes = new Set(nodes.map((n) => n.scope));
    expect(scopes.has('work')).toBe(true);
    expect(scopes.has('account_template')).toBe(true);

    // 6 fixed work-level folders (template/인물/장소/사건/세력/아이템)
    const workNodeNames = nodes.filter((n) => n.scope === 'work').map((n) => n.name);
    expect(workNodeNames).toEqual(expect.arrayContaining(['template', '인물', '장소', '사건', '세력', '아이템']));

    // account-level template root + the one child we inserted
    const accountNodes = nodes.filter((n) => n.scope === 'account_template');
    expect(accountNodes.some((n) => n.name === 'template' && n.node_type === 'folder')).toBe(true);
    expect(accountNodes.some((n) => n.name === '인물' && n.node_type === 'file')).toBe(true);
  });

  it('returns an empty result for a work belonging to a different owner (no cross-owner leakage)', async () => {
    const nodes = await getKbTree(admin, { ownerId: userB.id, workId: workAId });
    expect(nodes).toEqual([]);
  });
});

export interface FlatKbNode {
  id: string;
  parent_id: string | null;
  name: string;
  node_type: 'folder' | 'file';
  category: string;
  is_locked: boolean;
  scope: 'account_template' | 'work';
}

export interface TreeNode extends FlatKbNode {
  children: TreeNode[];
}

/** Pure. No DB access. Builds a nested tree from a flat row list in one pass.
 * A node whose parent_id isn't present in the list (shouldn't happen given
 * kb_nodes' FK, but defensive) is treated as a root rather than dropped/thrown. */
export function buildTree(flatNodes: FlatKbNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(flatNodes.map((n) => [n.id, { ...n, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

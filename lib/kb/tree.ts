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

export interface ChapterLeaf {
  id: string;
  title: string;
  isPublished: boolean;
}

/** KB-05 §4 (RESEARCH.md): pure UI-layer merge — chapters stay their own table
 * (D-05), the tree never contains real chapter kb_nodes rows. Buckets a flat
 * chapter list by the folder node id it should render under: folder_id===null
 * means "at the 회차 root", so those chapters are keyed under chapterRootId;
 * a real folder_id is used verbatim — it already IS a validated kb_nodes id
 * (assertChapterFolder enforces this at write time), so no ancestor_ids/depth
 * walk is needed here (those columns are dead — see RESEARCH.md Don't Hand-Roll). */
export function groupChaptersByFolder(
  chapters: Array<{ id: string; title: string; isPublished: boolean; folderId: string | null }>,
  chapterRootId: string | null
): Record<string, ChapterLeaf[]> {
  const grouped: Record<string, ChapterLeaf[]> = {};
  for (const chapter of chapters) {
    const key = chapter.folderId ?? chapterRootId;
    if (!key) continue;
    (grouped[key] ??= []).push({ id: chapter.id, title: chapter.title, isPublished: chapter.isPublished });
  }
  return grouped;
}

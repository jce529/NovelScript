import { KB_CATEGORIES } from './categories';
import { isTemplateRoot, templateCategoryOf } from './template-tree';
import type { TreeNode } from './tree';

/** One template file as the sidebar shows it. `category` is the category folder it sits in (null = 미분류). */
export interface TemplateEntry {
  node: TreeNode;
  category: string | null;
  /** The category folders of the template root this file lives in (for the move dialog). */
  categoryFolders: TreeNode[];
}

export interface TemplateRootInfo {
  id: string;
  scope: 'work' | 'account_template';
  folders: { id: string; name: string }[];
}

export interface StudioSidebarSections {
  /** Locked defaults, one per category; the work copy wins over the account copy. */
  defaultTemplates: TemplateEntry[];
  /** Every unlocked template file from both scopes, work first. */
  myTemplates: TemplateEntry[];
  /** Work-scope roots that are not template/chapter roots (5 KB categories, custom folders, anything unexpected). */
  myFolders: TreeNode[];
  /** Account-scope roots that are not template roots. */
  sharedFolders: TreeNode[];
  /** Work-scope 회차 roots (chapters are merged in by the caller via chaptersByFolderId). */
  chapterRoots: TreeNode[];
  /** Serializable per-area category folders for the 내 템플릿 만들기 dialog. */
  templateRoots: TemplateRootInfo[];
}

const isChapterRoot = (node: TreeNode) => node.category === '회차' && node.parent_id === null;

function collectFiles(node: TreeNode, out: TreeNode[]): void {
  for (const child of node.children) {
    if (child.node_type === 'file') out.push(child);
    collectFiles(child, out);
  }
}

function entriesOf(root: TreeNode): TemplateEntry[] {
  const categoryFolders = root.children.filter((child) => templateCategoryOf(child, root));
  const files: TreeNode[] = [];
  collectFiles(root, files);
  const byId = new Map<string, TreeNode>();
  const index = (n: TreeNode) => { byId.set(n.id, n); n.children.forEach(index); };
  index(root);
  return files.map((node) => {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    const category = parent ? templateCategoryOf(parent, root) : null;
    return { node, category, categoryFolders };
  });
}

const categoryRank = (category: string | null) => {
  const index = category ? KB_CATEGORIES.indexOf(category as (typeof KB_CATEGORIES)[number]) : -1;
  return index === -1 ? KB_CATEGORIES.length : index;
};

/** Pure + client-safe. Splits the two flat-derived trees into the blueprint sections by node id; nothing is
 * rendered twice and no user node is dropped (unknown roots fall into 내 폴더 / 계정 공유 폴더). */
export function partitionStudioSidebar(workTree: TreeNode[], accountTree: TreeNode[]): StudioSidebarSections {
  const workTemplateRoots = workTree.filter(isTemplateRoot);
  const accountTemplateRoots = accountTree.filter(isTemplateRoot);
  const templateRootNodes = [...workTemplateRoots, ...accountTemplateRoots];

  const entries = templateRootNodes.flatMap(entriesOf);
  const defaultByKey = new Map<string, TemplateEntry>();
  for (const entry of entries) {
    if (!entry.node.is_locked) continue;
    const key = entry.category ?? `name:${entry.node.name}`;
    // entries are ordered work-first, so the first one seen is the work copy when both scopes have it.
    if (!defaultByKey.has(key)) defaultByKey.set(key, entry);
  }
  const defaultTemplates = [...defaultByKey.values()].sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
  const myTemplates = entries.filter((entry) => !entry.node.is_locked);

  return {
    defaultTemplates,
    myTemplates,
    myFolders: workTree.filter((node) => !isTemplateRoot(node) && !isChapterRoot(node)),
    sharedFolders: accountTree.filter((node) => !isTemplateRoot(node)),
    chapterRoots: workTree.filter(isChapterRoot),
    templateRoots: templateRootNodes.map((root) => ({
      id: root.id,
      scope: root.scope,
      folders: root.children.filter((child) => templateCategoryOf(child, root)).map((child) => ({ id: child.id, name: child.name })),
    })),
  };
}

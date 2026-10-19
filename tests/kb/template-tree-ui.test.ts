import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { TreeNode } from '@/lib/kb/tree';
import { KbTree, KbTemplateSection } from '@/components/studio/kb-tree';
import { CreateNodeDialog, MoveTemplateFileDialog } from '@/components/studio/kb-node-dialogs';
import { folderPresentation, toggleCollapsed } from '@/lib/kb/kb-node-menu-controller';
import { readFileSync } from 'node:fs';

const mock = vi.hoisted(() => ({ listOptions: vi.fn(), selectedValue: '', templateOptions: null as unknown[] | null, skipEffects: false, params: {} as Record<string, string> }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => void) => { if (!mock.skipEffects) effect(); },
    useState: (initial: unknown) => actual.useState(Array.isArray(initial) && mock.templateOptions ? mock.templateOptions : initial),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useParams: () => mock.params }));
vi.mock('next/link', () => ({ default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement('a', { href, className }, children) }));
vi.mock('@/app/studio/[workId]/kb/[nodeId]/actions', () => ({
  listTemplateOptionsAction: mock.listOptions,
  createNodeAction: vi.fn(), createFolderAction: vi.fn(), moveTemplateFileAction: vi.fn(),
  renameNodeAction: vi.fn(), deleteNodeAction: vi.fn(),
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogFooter: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('h2', null, children),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, children }: { value: string; children: ReactNode }) => { mock.selectedValue = value; return createElement('div', null, children); },
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  SelectValue: ({ children }: { children: (value: string) => ReactNode }) => createElement('span', null, children(mock.selectedValue)),
  SelectContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectItem: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectGroup: ({ children }: { children: ReactNode }) => createElement('section', null, children),
  SelectLabel: ({ children }: { children: ReactNode }) => createElement('h3', null, children),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
  TooltipContent: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));

const node = (id: string, name: string, parent_id: string | null, node_type: 'folder' | 'file', children: TreeNode[] = []): TreeNode =>
  ({ id, name, parent_id, node_type, children, category: 'template', scope: 'work', is_locked: node_type === 'folder' });
const category = node('category', '인물', 'root', 'folder');
const unclassified = node('file', '내 양식', 'root', 'file');
const root = node('root', '템플릿', null, 'folder', [category, unclassified]);

beforeEach(() => { mock.listOptions.mockReset(); mock.selectedValue = ''; mock.templateOptions = null; mock.skipEffects = false; mock.params = {}; });

describe('template tree UI', () => {
  it('shows file creation only on category folders and hides folder creation throughout the template tree', () => {
    mock.skipEffects = true; // row menu effects touch window; server rendering never runs them
    const html = renderToStaticMarkup(createElement(KbTree, { nodes: [root], chaptersByFolderId: {}, workId: 'work' }));
    const rootRow = html.split('data-node-id="root"')[1].split('data-node-id="category"')[0];
    const categoryRow = html.split('data-node-id="category"')[1].split('data-node-id="file"')[0];
    expect(rootRow).not.toContain('하위 문서 추가');
    expect(rootRow).not.toContain('새 폴더 만들기');
    expect(categoryRow).toContain('하위 문서 추가');
    expect(categoryRow).not.toContain('새 폴더 만들기');
    expect(html).toContain('카테고리 미지정');
    expect(html).toContain('카테고리 폴더로 이동');
  });

  it('uses a distinct template dialog without loading or displaying template options', () => {
    const html = renderToStaticMarkup(createElement(CreateNodeDialog, {
      open: true, onOpenChange: () => {}, workId: 'work', parentId: 'category', category: 'template', onCreated: () => {},
    }));
    expect(html).toContain('새 템플릿 만들기');
    expect(html).toContain('템플릿 이름');
    expect(html).not.toContain('템플릿 선택');
    expect(mock.listOptions).not.toHaveBeenCalled();
  });

  it('groups document templates by scope even when names match', () => {
    mock.skipEffects = true;
    mock.templateOptions = [
      { id: 'work-template', name: '인물', scope: 'work', content: '', isDefault: true },
      { id: 'account-template', name: '인물', scope: 'account_template', content: '', isDefault: false },
      { id: null, name: '기본 인물 템플릿', scope: 'canonical', content: '', isDefault: false },
    ];
    const html = renderToStaticMarkup(createElement(CreateNodeDialog, {
      open: true, onOpenChange: () => {}, workId: 'work', parentId: 'people', category: '인물', onCreated: () => {},
    }));
    expect(html).toMatch(/<h3>작품 템플릿<\/h3>.*인물.*<h3>계정 템플릿<\/h3>.*인물.*<h3>기본 템플릿<\/h3>.*기본 인물 템플릿/);
    expect(html).toContain('인물 (이 작품 전용) (기본)');
  });

  it('shows category names in the move dialog, including the selected value', () => {
    const html = renderToStaticMarkup(createElement(MoveTemplateFileDialog, {
      open: true, onOpenChange: () => {}, workId: 'work', nodeId: 'file', currentParentId: 'category',
      categoryFolders: [category, node('place', '장소', 'root', 'folder')], onMoved: () => {},
    }));
    expect(html).toContain('카테고리 폴더로 이동');
    expect(html).toContain('인물');
    expect(html).toContain('장소');
    expect(html).not.toContain('>category<');
  });

  it('renders folder toggles with aria-expanded and nothing hidden by default', () => {
    mock.skipEffects = true;
    const html = renderToStaticMarkup(createElement(KbTree, { nodes: [root], chaptersByFolderId: {}, workId: 'work' }));
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/<ul hidden/);
  });

  it('folder toggle flips visibility and aria-expanded together without touching children', () => {
    const children = root.children;
    const ids = children.map((c) => c.id);
    const open = new Set<string>();
    expect(folderPresentation(open, root.id)).toEqual({ visible: true, ariaExpanded: 'true' });
    const closed = toggleCollapsed(open, root.id);
    expect(folderPresentation(closed, root.id)).toEqual({ visible: false, ariaExpanded: 'false' });
    expect(folderPresentation(closed, 'other').visible).toBe(true);
    const reopened = toggleCollapsed(closed, root.id);
    expect(folderPresentation(reopened, root.id)).toEqual({ visible: true, ariaExpanded: 'true' });
    expect(open.size).toBe(0);
    expect(root.children).toBe(children);
    expect(root.children.map((c) => c.id)).toEqual(ids);
  });

  it('wires sections, menu and entry in source (real open is a 02-13 browser check)', () => {
    const layout = readFileSync('app/studio/[workId]/layout.tsx', 'utf8');
    expect(layout).toContain('partitionStudioSidebar(workTree, accountTree)');
    expect(layout).toContain('<TemplateSidebarEntry');
    expect(layout).toContain('<KbTemplateSection');
    const order = ['<KbTemplateSection', 'nodes={sections.myFolders}', 'nodes={sections.sharedFolders}', 'nodes={sections.chapterRoots}'].map((m) => layout.indexOf(m));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(layout).not.toContain('useState');
    const entry = readFileSync('components/studio/template-sidebar-entry.tsx', 'utf8');
    for (const part of ["'use client'", 'CreateTemplateDialog', 'CreateNodeDialog', '새 문서 (템플릿에서)']) expect(entry).toContain(part);
    const menu = readFileSync('components/studio/kb-node-menu.tsx', 'utf8');
    for (const part of ['onContextMenu', 'onPointerDown', 'onPointerCancel', 'onKeyDown', 'RenameNodeDialog', 'consumeClickBlock', 'dispose']) {
      expect(menu).toContain(part);
    }
    const tree = readFileSync('components/studio/kb-tree.tsx', 'utf8');
    expect(tree).toContain('aria-expanded');
    expect(tree).toContain('<KbNodeMenu');
  });
});

// BUG-03: opacity-0 row actions kept their layout width (52-136px of a 255px row) and squeezed names to 4-15px.
describe('tree row layout (BUG-03)', () => {
  const file = (id: string, name: string, is_locked: boolean, scope: 'work' | 'account_template'): TreeNode =>
    ({ id, name, parent_id: 'cat', node_type: 'file', category: 'template', scope, is_locked, children: [] });
  const entry = (n: TreeNode) => ({ node: n, category: '인물', categoryFolders: [category] });
  const templates = () => {
    mock.skipEffects = true;
    return renderToStaticMarkup(createElement(KbTemplateSection, {
      workId: 'w',
      defaults: [entry(file('d1', '인물', true, 'work'))],
      mine: [entry(file('m1', '게이트 인물 양식', false, 'work')), entry(file('m2', '범위시험', false, 'account_template'))],
    }));
  };
  const rowOf = (html: string, id: string) => html.split('<li>').find((chunk) => chunk.includes(`data-node-id="${id}"`)) ?? '';

  it('template row: name flexes with min-w-0 + truncate, badge and lock never shrink', () => {
    const html = templates();
    const mine = rowOf(html, 'm1');
    expect(mine).toMatch(/<a[^>]*class="[^"]*min-w-0[^"]*flex-1[^"]*truncate[^"]*"[^>]*>게이트 인물 양식<\/a>/);
    expect(mine).toMatch(/class="[^"]*shrink-0[^"]*whitespace-nowrap[^"]*"[^>]*>이 작품<\/span>|class="[^"]*whitespace-nowrap[^"]*shrink-0[^"]*"[^>]*>이 작품</);
    expect(rowOf(html, 'm2')).toMatch(/shrink-0[^>]*>계정</);
    expect(rowOf(html, 'd1')).toMatch(/<svg[^>]*class="[^"]*shrink-0[^"]*"[^>]*aria-label="기본 템플릿은 수정할 수 없어요"|aria-label="기본 템플릿은 수정할 수 없어요"[^>]*class="[^"]*shrink-0/);
  });

  it('row actions overlay the row (absolute, hidden until hover/focus) instead of holding layout width', () => {
    const html = templates();
    for (const id of ['d1', 'm1', 'm2']) {
      const row = rowOf(html, id);
      expect(row).toMatch(/<[^>]*data-node-id="[^"]*"[^>]*class="[^"]*\brelative\b[^"]*"|<[^>]*class="[^"]*\brelative\b[^"]*"[^>]*data-node-id=/);
      const actions = row.match(/<span[^>]*data-row-actions[^>]*>/)?.[0] ?? '';
      expect(actions).toContain('absolute');
      expect(actions).toContain('hidden');
      expect(actions).toContain('group-hover/row:flex');
      expect(actions).toContain('group-focus-within/row:flex');
      expect(actions).not.toContain('opacity-0');
      expect(actions).not.toContain('ml-auto');
    }
  });

  it('only one row shows its buttons: hovered on pointer devices, the tapped (active) row on touch-only devices', () => {
    const touchOnly = '[@media(hover:none)]:flex';
    const actionsOf = (html: string, id: string) => rowOf(html, id).match(/<span[^>]*data-row-actions[^>]*>/)?.[0] ?? '';

    // Nothing selected: no row opts into the touch-only visibility, every row stays hidden on touch.
    let html = templates();
    for (const id of ['d1', 'm1', 'm2']) {
      expect(actionsOf(html, id)).not.toContain(touchOnly);
      expect(actionsOf(html, id)).toContain('group-hover/row:flex');
    }

    // The opened document is the selected one: only its row shows buttons on touch devices.
    mock.params = { nodeId: 'm1' };
    html = templates();
    expect(actionsOf(html, 'm1')).toContain(touchOnly);
    expect(actionsOf(html, 'm1')).toContain('data-row-active="true"');
    for (const id of ['d1', 'm2']) {
      expect(actionsOf(html, id)).not.toContain(touchOnly);
      expect(actionsOf(html, id)).not.toContain('data-row-active');
    }
  });

  it('rows use a NAMED group so the mobile drawer (`details.group`) cannot reveal every row at once', () => {
    // Regression: unnamed group-hover/group-focus-within matched the drawer ancestor, so tapping a doc on a
    // phone showed the action buttons on all rows. The drawer keeps its own unnamed `group` (group-open).
    const layout = readFileSync('app/studio/[workId]/layout.tsx', 'utf8');
    expect(layout).toMatch(/<details className="group /);
    const html = templates();
    for (const id of ['d1', 'm1', 'm2']) {
      const row = rowOf(html, id);
      expect(row).toContain('group/row');
      expect(row).not.toMatch(/class="[^"]*(^|\s)group(\s|")/);
      const actions = row.match(/<span[^>]*data-row-actions[^>]*>/)?.[0] ?? '';
      expect(actions).not.toMatch(/(^|[\s"])group-(hover|focus-within):/);
    }
    const tree = readFileSync('components/studio/kb-tree.tsx', 'utf8');
    expect(tree).not.toMatch(/['"`\s]group-(hover|focus-within):/);
  });

  it('document and folder rows in KbTree use the same non-shrinking name and overlay actions', () => {
    mock.skipEffects = true;
    const doc = { ...file('doc', '아주 긴 문서 이름이 들어가는 경우', false, 'work'), category: '인물' };
    const folder = { ...node('f1', '인물', null, 'folder', [doc]), category: '인물', scope: 'work' as const };
    const html = renderToStaticMarkup(createElement(KbTree, { nodes: [folder], chaptersByFolderId: {}, workId: 'w' }));
    expect(html).toMatch(/<a[^>]*class="[^"]*min-w-0[^"]*flex-1[^"]*truncate[^"]*"[^>]*>아주 긴 문서 이름이 들어가는 경우<\/a>/);
    expect(html).toMatch(/<span[^>]*class="[^"]*min-w-0[^"]*flex-1[^"]*truncate[^"]*"[^>]*>인물<\/span>/);
    expect(html).not.toContain('ml-auto opacity-0');
    expect(html).toContain('data-row-actions');
  });
});

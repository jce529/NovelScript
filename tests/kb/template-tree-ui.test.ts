import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { TreeNode } from '@/lib/kb/tree';
import { KbTree } from '@/components/studio/kb-tree';
import { CreateNodeDialog, MoveTemplateFileDialog } from '@/components/studio/kb-node-dialogs';

const mock = vi.hoisted(() => ({ listOptions: vi.fn(), selectedValue: '', templateOptions: null as unknown[] | null, skipEffects: false }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (effect: () => void) => { if (!mock.skipEffects) effect(); },
    useState: (initial: unknown) => actual.useState(Array.isArray(initial) && mock.templateOptions ? mock.templateOptions : initial),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useParams: () => ({}) }));
vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) }));
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

beforeEach(() => { mock.listOptions.mockReset(); mock.selectedValue = ''; mock.templateOptions = null; mock.skipEffects = false; });

describe('template tree UI', () => {
  it('shows file creation only on category folders and hides folder creation throughout the template tree', () => {
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
});

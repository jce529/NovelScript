import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import type { TreeNode } from '@/lib/kb/tree';

const mock = vi.hoisted(() => ({
  copy: vi.fn(), createDoc: vi.fn(), createNode: vi.fn(), listOptions: vi.fn(),
  selectedValue: '', templateOptions: null as unknown[] | null,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: () => {},
    useState: (initial: unknown) => actual.useState(Array.isArray(initial) && mock.templateOptions ? mock.templateOptions : initial),
  };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useParams: () => ({}) }));
vi.mock('@/app/studio/[workId]/kb/[nodeId]/actions', () => ({
  listTemplateOptionsAction: mock.listOptions,
  createNodeAction: mock.createNode, createFolderAction: vi.fn(), moveTemplateFileAction: vi.fn(),
  renameNodeAction: vi.fn(), deleteNodeAction: vi.fn(),
  copyTemplateFileAction: mock.copy, createDocumentFromTemplateAction: mock.createDoc,
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

import {
  runCopyTemplate, runCreateFromTemplate, runCreateTemplate, CreateNodeDialog, CopyTemplateDialog, CreateTemplateDialog, KbTreeActions,
} from '@/components/studio/kb-node-dialogs';
import { TemplateEditorToolbar } from '@/components/studio/template-editor-toolbar';

const cb = () => ({ onSuccess: vi.fn(), onError: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  mock.selectedValue = '';
  mock.templateOptions = null;
});

describe('runCopyTemplate (사본 만들어 수정 submit)', () => {
  it('reports the new node id on success so the caller can open the new editor', async () => {
    mock.copy.mockResolvedValue({ ok: true, nodeId: 'copy-1' });
    const c = cb();
    await runCopyTemplate({ workId: 'w', nodeId: 'default', name: '인물 사본' }, c);
    expect(mock.copy).toHaveBeenCalledWith('w', 'default', '인물 사본');
    expect(c.onSuccess).toHaveBeenCalledWith('copy-1');
    expect(c.onError).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and does not navigate on failure or duplicate name', async () => {
    mock.copy.mockResolvedValue({ ok: false, error: '이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.' });
    const c = cb();
    await runCopyTemplate({ workId: 'w', nodeId: 'default', name: 'dup' }, c);
    expect(c.onError).toHaveBeenCalledWith('이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.');
    expect(c.onSuccess).not.toHaveBeenCalled();
  });

  it('falls back to generic copy when the server gives no message', async () => {
    mock.copy.mockResolvedValue({ ok: false });
    const c = cb();
    await runCopyTemplate({ workId: 'w', nodeId: 'n', name: 'x' }, c);
    expect(c.onError).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했어요'));
  });
});

describe('runCreateFromTemplate (이 템플릿으로 새 문서 submit)', () => {
  it('sends the selected template id, not content', async () => {
    mock.createDoc.mockResolvedValue({ ok: true, nodeId: 'doc-1' });
    const c = cb();
    await runCreateFromTemplate({ workId: 'w', category: '인물', parentId: null, name: '주인공', selected: 'mine' }, c);
    expect(mock.createDoc).toHaveBeenCalledWith('w', { category: '인물', parentId: null, name: '주인공', templateId: 'mine' });
    expect(c.onSuccess).toHaveBeenCalledWith('doc-1');
  });

  it('maps the canonical select value to a null template id', async () => {
    mock.createDoc.mockResolvedValue({ ok: true, nodeId: 'doc-2' });
    await runCreateFromTemplate({ workId: 'w', category: '인물', parentId: 'f', name: 'a', selected: 'canonical' }, cb());
    expect(mock.createDoc.mock.calls[0][1].templateId).toBeNull();
  });

  it('reports the server error without success', async () => {
    mock.createDoc.mockResolvedValue({ ok: false, error: '저장 템플릿이 변경되었어요. 다시 선택해주세요.' });
    const c = cb();
    await runCreateFromTemplate({ workId: 'w', category: '인물', parentId: 'f', name: 'a', selected: 'mine' }, c);
    expect(c.onError).toHaveBeenCalledWith('저장 템플릿이 변경되었어요. 다시 선택해주세요.');
    expect(c.onSuccess).not.toHaveBeenCalled();
  });
});

describe('runCreateTemplate (내 템플릿 만들기 submit)', () => {
  it('uses the existing createNode path with category=template under the chosen folder', async () => {
    mock.createNode.mockResolvedValue({ ok: true, nodeId: 't1' });
    const c = cb();
    await runCreateTemplate({ workId: 'w', folderId: 'cat-person', name: '내 양식' }, c);
    expect(mock.createNode).toHaveBeenCalledWith('w', 'cat-person', 'template', 'file', '내 양식');
    expect(c.onSuccess).toHaveBeenCalledWith('t1');
  });

  it('surfaces duplicate-name errors', async () => {
    mock.createNode.mockResolvedValue({ ok: false, error: '이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.' });
    const c = cb();
    await runCreateTemplate({ workId: 'w', folderId: 'f', name: 'dup' }, c);
    expect(c.onError).toHaveBeenCalled();
    expect(c.onSuccess).not.toHaveBeenCalled();
  });
});

describe('dialog rendering', () => {
  const options = [
    { id: 'mine', name: '내 양식', scope: 'work', content: 'm', isDefault: false },
    { id: null, name: '기본 인물 템플릿', scope: 'canonical', content: 'c', isDefault: true },
  ];

  it('preselects the given 내 템플릿 id', () => {
    mock.templateOptions = options;
    renderToStaticMarkup(createElement(CreateNodeDialog, { open: true, onOpenChange: vi.fn(), workId: 'w', parentId: null, category: '인물', onCreated: vi.fn(), preselectedTemplateId: 'mine' }));
    expect(mock.selectedValue).toBe('mine');
  });

  it('selects the canonical default when nothing is preselected or null is preselected (never confuses null with a user id)', () => {
    mock.templateOptions = options;
    renderToStaticMarkup(createElement(CreateNodeDialog, { open: true, onOpenChange: vi.fn(), workId: 'w', parentId: 'f', category: '인물', onCreated: vi.fn() }));
    expect(mock.selectedValue).toBe('canonical');
    renderToStaticMarkup(createElement(CreateNodeDialog, { open: true, onOpenChange: vi.fn(), workId: 'w', parentId: null, category: '인물', onCreated: vi.fn(), preselectedTemplateId: null }));
    expect(mock.selectedValue).toBe('canonical');
  });

  it('suggests "<기존 이름> 사본" in the copy dialog', () => {
    const html = renderToStaticMarkup(createElement(CopyTemplateDialog, { open: true, onOpenChange: vi.fn(), workId: 'w', nodeId: 'n', currentName: '인물' }));
    expect(html).toContain('value="인물 사본"');
    expect(html).toContain('사본 이름');
  });

  it('asks for name, scope and category when creating a 내 템플릿', () => {
    const areas = [
      { scope: 'work' as const, folders: [{ id: 'a', name: '인물' }] },
      { scope: 'account_template' as const, folders: [{ id: 'b', name: '인물' }] },
    ];
    const html = renderToStaticMarkup(createElement(CreateTemplateDialog, { open: true, onOpenChange: vi.fn(), workId: 'w', areas, onCreated: vi.fn() }));
    expect(html).toContain('템플릿 이름');
    expect(html).toContain('영역');
    expect(html).toContain('카테고리');
  });
});

describe('TemplateEditorToolbar', () => {
  const base = { workId: 'w', nodeId: 'n', name: '인물', templateCategory: '인물' };

  it('default toolbar shows read-only notice and 사본 만들어 수정, with no save or rename', () => {
    const html = renderToStaticMarkup(createElement(TemplateEditorToolbar, { ...base, mode: 'default_template', saveSlot: createElement('button', null, '문서 저장') }));
    expect(html).toContain('읽기 전용');
    expect(html).toContain('사본 만들어 수정');
    expect(html).toContain('이 템플릿으로 새 문서');
    expect(html).not.toContain('문서 저장');
    expect(html).not.toContain('이름 변경');
  });

  it('내 템플릿 toolbar offers rename, the save slot and 새 문서, but no copy CTA', () => {
    const html = renderToStaticMarkup(createElement(TemplateEditorToolbar, { ...base, mode: 'user_template', saveSlot: createElement('button', null, '문서 저장') }));
    expect(html).toContain('이름 변경');
    expect(html).toContain('문서 저장');
    expect(html).toContain('이 템플릿으로 새 문서');
    expect(html).not.toContain('사본 만들어 수정');
  });

  it('hides the new-document CTA for a loose template without a category', () => {
    const html = renderToStaticMarkup(createElement(TemplateEditorToolbar, { ...base, templateCategory: null, mode: 'user_template' }));
    expect(html).not.toContain('이 템플릿으로 새 문서');
  });

  // BUG-02: in one flex row the name collapsed to 0px, the label stacked vertically and the buttons overlapped.
  describe('two-tier layout (BUG-02)', () => {
    const render = (mode: 'default_template' | 'user_template') => renderToStaticMarkup(createElement(TemplateEditorToolbar, {
      ...base, mode,
      saveSlot: createElement('button', null, '문서 저장'),
      statusSlot: createElement('span', { 'data-test': 'chip' }, '저장됨'),
    }));
    const openTag = (html: string, tier: 'title' | 'actions') => html.match(new RegExp(`<div[^>]*data-toolbar-tier="${tier}"[^>]*>`))?.[0] ?? '';
    const split = (html: string) => {
      const at = html.indexOf('data-toolbar-tier="actions"');
      return { title: html.slice(0, at), actions: html.slice(at) };
    };

    it('stacks the title tier above the actions tier inside a column root', () => {
      const html = render('user_template');
      expect(html).toMatch(/<div[^>]*class="[^"]*flex-col[^"]*"[^>]*data-template-mode="user_template"|<div[^>]*data-template-mode="user_template"[^>]*class="[^"]*flex-col/);
      expect(html.indexOf('data-toolbar-tier="title"')).toBeGreaterThan(-1);
      expect(html.indexOf('data-toolbar-tier="title"')).toBeLessThan(html.indexOf('data-toolbar-tier="actions"'));
    });

    it('title tier: name truncates, gray 내 템플릿 label never shrinks or wraps, no buttons', () => {
      const { title } = split(render('user_template'));
      expect(title).toContain('인물');
      expect(title).toMatch(/<span[^>]*class="[^"]*min-w-0[^"]*truncate[^"]*"[^>]*>인물<\/span>/);
      const label = title.match(/<span[^>]*>내 템플릿<\/span>/)?.[0] ?? '';
      expect(label).toContain('text-muted-foreground');
      expect(label).toContain('shrink-0');
      expect(label).toContain('whitespace-nowrap');
      expect(title).not.toContain('<button');
    });

    it('actions tier holds every button and the status slot, and wraps instead of overflowing', () => {
      const html = render('user_template');
      const { actions } = split(html);
      for (const text of ['이름 변경', '문서 저장', '이 템플릿으로 새 문서']) expect(actions).toContain(text);
      expect(actions).toContain('data-test="chip"');
      expect(openTag(html, 'actions')).toContain('flex-wrap');
    });

    it('default template: read-only notice in the title tier, copy CTA and status in the actions tier', () => {
      const { title, actions } = split(render('default_template'));
      expect(title).toContain('읽기 전용');
      expect(title).not.toContain('사본 만들어 수정');
      expect(actions).toContain('사본 만들어 수정');
      expect(actions).toContain('data-test="chip"');
      expect(actions).not.toContain('이름 변경');
    });
  });
});

describe('KbTreeActions template rows', () => {
  const folder = (id: string, name: string): TreeNode => ({ id, name, parent_id: 'root', node_type: 'folder', category: 'template', scope: 'work', is_locked: true, children: [] });
  const file = (is_locked: boolean): TreeNode => ({ id: 'f', name: '인물', parent_id: 'cat', node_type: 'file', category: 'template', scope: 'work', is_locked, children: [] });
  const folders = [folder('cat', '인물')];
  const render = (node: TreeNode) => renderToStaticMarkup(createElement(KbTreeActions, { workId: 'w', node, categoryFolders: folders }));

  it('locked default: copy and new-document actions, no rename/delete/move', () => {
    const html = render(file(true));
    expect(html).toContain('사본 만들어 수정');
    expect(html).toContain('이 템플릿으로 새 문서');
    expect(html).not.toContain('이름 변경');
    expect(html).not.toContain('삭제');
    expect(html).not.toContain('카테고리 폴더로 이동');
  });

  it('내 템플릿: also rename, delete and move', () => {
    const html = render(file(false));
    expect(html).toContain('사본 만들어 수정');
    expect(html).toContain('이름 변경');
    expect(html).toContain('카테고리 폴더로 이동');
  });

  it('template root row offers 내 템플릿 만들기', () => {
    const root: TreeNode = { id: 'root', name: '템플릿', parent_id: null, node_type: 'folder', category: 'template', scope: 'work', is_locked: true, children: [] };
    expect(render(root)).toContain('내 템플릿 만들기');
  });
});

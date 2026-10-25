import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { TreeNode } from '@/lib/kb/tree';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: () => {} };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useParams: () => ({}) }));
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement('a', { href, className }, children),
}));
vi.mock('@/app/studio/[workId]/kb/[nodeId]/actions', () => ({
  listTemplateOptionsAction: vi.fn(), createNodeAction: vi.fn(), createFolderAction: vi.fn(), moveTemplateFileAction: vi.fn(),
  renameNodeAction: vi.fn(), deleteNodeAction: vi.fn(), moveKbNodeAction: vi.fn(), copyTemplateFileAction: vi.fn(),
  createDocumentFromTemplateAction: vi.fn(),
}));
vi.mock('@/app/studio/[workId]/chapters/actions', () => ({ moveChapterAction: vi.fn(), reorderChaptersAction: vi.fn() }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => (open ? children : null),
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogFooter: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('h2', null, children),
}));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
  TooltipContent: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));

const { TreeDndProvider, pillText } = await import('@/components/studio/tree-dnd');
const { MoveChapterDialog, MoveKbNodeDialog, CHAPTER_MOVE_HELPER } = await import('@/components/studio/kb-node-dialogs');
const { KbTree } = await import('@/components/studio/kb-tree');
const { MOVE_COPY } = await import('@/lib/kb/move-rules');

const t = (id: string, name: string, parent_id: string | null, children: TreeNode[] = [], o: Partial<TreeNode> = {}): TreeNode =>
  ({ id, name, parent_id, node_type: 'folder', category: '인물', scope: 'work', is_locked: false, children, ...o });

const part1 = t('p1', '1부', 'root', [], { category: '회차' });
const part2 = t('p2', '2부', 'root', [], { category: '회차' });
const chapterRoot = t('root', '회차', null, [part1, part2], { category: '회차', is_locked: true });
const doc = t('doc', '라온', 'main', [], { node_type: 'file' });
const main = t('main', '주요', 'person', [doc]);
const side = t('side', '조연', 'person');
const person = t('person', '인물', null, [main, side], { is_locked: true });
const place = t('place', '장소', null, [], { category: '장소', is_locked: true });
const shared = t('shared', '공용', null, [], { category: 'custom', scope: 'account_template' });
const chapters = { root: [{ id: 'c0', title: '프롤로그', isPublished: true }], p1: [{ id: 'c1', title: '1화', isPublished: true }, { id: 'c2', title: '2화', isPublished: false }] };

const inTree = (child: ReactNode) => renderToStaticMarkup(createElement(TreeDndProvider, {
  workId: 'w', workTree: [chapterRoot, person, place], accountTree: [shared], chaptersByFolderId: chapters,
}, child));

describe('회차 이동 dialog', () => {
  const html = inTree(createElement(MoveChapterDialog, { open: true, onOpenChange: () => {}, chapterId: 'c1', name: '1화', currentFolderId: 'p1' }));

  it('uses the mockup copy, a 옮길 폴더 radiogroup and per-folder counts', () => {
    expect(html).toContain('<h2>회차 이동</h2>');
    expect(html).toContain('‘1화’을 옮길 회차 폴더를 고르세요.');
    expect(html).toContain('role="radiogroup" aria-label="옮길 폴더"');
    expect(html).toContain('회차 (최상위)');
    expect(html).toContain('회차 1개');
    expect(html).toContain('회차 0개');
    expect(html).toContain(CHAPTER_MOVE_HELPER);
    expect(CHAPTER_MOVE_HELPER).toBe('이동해도 발행 상태와 회차 순서는 그대로예요. 회차는 회차 폴더 안으로만 옮길 수 있어요.');
    expect(html).toContain('>취소<');
  });

  it('disables the current folder with the 현재 위치 badge and indents folders by depth', () => {
    const current = html.split('<label').find((chunk) => chunk.includes('1부')) ?? '';
    expect(current).toContain('disabled=""');
    expect(current).toContain('현재 위치');
    expect(current).toContain('padding-left:28px');
    const root = html.split('<label').find((chunk) => chunk.includes('회차 (최상위)')) ?? '';
    expect(root).not.toContain('disabled=""');
  });
});

describe('폴더/문서 이동 dialog', () => {
  it('lists same-category folders and shows each disabled reason', () => {
    const html = inTree(createElement(MoveKbNodeDialog, { open: true, onOpenChange: () => {}, node: main }));
    expect(html).toContain('<h2>폴더 이동</h2>');
    expect(html).toContain('‘주요’을 옮길 폴더를 고르세요. 같은 카테고리(인물) 안에서만 옮길 수 있어요.');
    expect(html).toContain(MOVE_COPY.self);
    expect(html).toContain('다른 영역');
    expect(html).toContain(MOVE_COPY.other_category);
    expect(html).toContain(MOVE_COPY.other_scope);
    expect(html).toContain('현재 위치');
  });

  it('titles a document move 문서 이동', () => {
    const html = inTree(createElement(MoveKbNodeDialog, { open: true, onOpenChange: () => {}, node: doc }));
    expect(html).toContain('<h2>문서 이동</h2>');
  });
});

describe('tree rows inside the move provider', () => {
  it('movable rows get a "…" menu button and a drag description; locked folders do not drag', () => {
    const html = inTree(createElement(KbTree, { nodes: [person], chaptersByFolderId: {}, workId: 'w' }));
    expect(html).toContain('aria-label="라온 메뉴"');
    expect(html).toContain('aria-label="주요 메뉴"');
    expect(html).toContain('aria-roledescription="옮길 수 있는 항목"');
    const lockedRow = html.match(/<div[^>]*data-node-id="person"[^>]*>/)?.[0] ?? '';
    expect(lockedRow).not.toContain('aria-roledescription');
  });

  it('chapter rows get the same "…" button', () => {
    const html = inTree(createElement(KbTree, { nodes: [], chaptersByFolderId: {}, workId: 'w', leaves: chapters.root, leavesFolderId: 'root' }));
    expect(html).toContain('aria-label="프롤로그 메뉴"');
    expect(html).toContain('aria-roledescription="옮길 수 있는 항목"');
  });

  it('outside the provider rows stay plain (no move, no drag)', () => {
    const html = renderToStaticMarkup(createElement(KbTree, { nodes: [person], chaptersByFolderId: {}, workId: 'w' }));
    expect(html).not.toContain('aria-roledescription');
    expect(html).not.toContain('aria-label="주요 메뉴"');
  });
});

describe('drag status pill', () => {
  const item = { kind: 'chapter' as const, chapterId: 'c1', name: '1화', folderId: 'p1' };
  it('reads "{이름} → {대상} · 놓으면 이동해요" over a valid target and the rule message over an invalid one', () => {
    expect(pillText(item, { ok: true, noop: false, targetId: 'p2', targetName: '2부', message: null }))
      .toEqual({ main: '1화 → 2부 · 놓으면 이동해요', tone: 'valid' });
    expect(pillText(item, { ok: false, noop: false, targetId: null, targetName: '인물', message: MOVE_COPY.chapter_only }))
      .toEqual({ main: '회차는 회차 폴더로만 옮길 수 있어요', tone: 'invalid' });
    expect(pillText(item, null).tone).toBe('idle');
  });
});

describe('drag wiring (source)', () => {
  const src = readFileSync('components/studio/tree-dnd.tsx', 'utf8');
  it('drags with mouse/pen only after 8px, supports the keyboard, and refreshes or toasts after the server action', () => {
    expect(src).toContain("event.pointerType === 'touch'");
    expect(src).toContain('activationConstraint: { distance: 8 }');
    expect(src).toContain('useSensor(KeyboardSensor)');
    expect(src).not.toContain('TouchSensor');
    expect(src).toContain('toast.error');
    expect(src).toContain('router.refresh()');
    expect(src).toContain('moveKbNodeAction');
    expect(src).toContain('moveChapterAction');
    expect(src).toContain('Esc로 취소');
    expect(src).toContain('여기로 이동');
  });
});

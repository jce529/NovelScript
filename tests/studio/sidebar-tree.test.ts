import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import type { TreeNode } from '@/lib/kb/tree';

const mock = vi.hoisted(() => ({ params: {} as Record<string, string> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  // Row menu effects touch window; server rendering never runs them anyway.
  return { ...actual, useEffect: () => {} };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), useParams: () => mock.params }));
vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) => createElement('a', { href, className }, children),
}));
vi.mock('@/app/studio/[workId]/kb/[nodeId]/actions', () => ({
  listTemplateOptionsAction: vi.fn(), createNodeAction: vi.fn(), createFolderAction: vi.fn(), moveTemplateFileAction: vi.fn(),
  renameNodeAction: vi.fn(), deleteNodeAction: vi.fn(), moveKbNodeAction: vi.fn(), copyTemplateFileAction: vi.fn(),
  createDocumentFromTemplateAction: vi.fn(),
}));
vi.mock('@/app/studio/[workId]/chapters/actions', () => ({ moveChapterAction: vi.fn(), reorderChaptersAction: vi.fn() }));
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
  TooltipContent: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));

const { SidebarGroup, groupKeyAction } = await import('@/components/studio/sidebar-groups');
const { KbTree } = await import('@/components/studio/kb-tree');

beforeEach(() => { mock.params = {}; });

describe('SidebarGroup (collapsible tree groups)', () => {
  it('is expanded by default with aria-expanded and visible content', () => {
    const html = renderToStaticMarkup(createElement(SidebarGroup, { id: 'g1', label: '작품 폴더', kind: 'root', icon: 'work', aside: '내 작품' },
      createElement('p', null, '내용')));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="sidebar-group-g1"');
    expect(html).toContain('작품 폴더');
    expect(html).toContain('내 작품');
    expect(html).not.toMatch(/id="sidebar-group-g1"[^>]*hidden/);
    expect(html).toContain('<p>내용</p>');
  });

  it('can start collapsed (템플릿) and shows a badge', () => {
    const html = renderToStaticMarkup(createElement(SidebarGroup, { id: 'tpl', label: '템플릿', defaultOpen: false, badge: '기본 5 · 내 2' },
      createElement('p', null, '내용')));
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/id="sidebar-group-tpl"[^>]*hidden/);
    expect(html).toContain('기본 5 · 내 2');
  });

  it('renders header actions outside the toggle button (no nested buttons)', () => {
    const html = renderToStaticMarkup(createElement(SidebarGroup, {
      id: 's', label: '설정', actions: createElement('button', { type: 'button', 'aria-label': '새 폴더 만들기' }),
    }, null));
    const toggle = html.match(/<button[^>]*aria-expanded[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(toggle).not.toContain('새 폴더 만들기');
    expect(html).toContain('aria-label="새 폴더 만들기"');
  });

  it('maps ArrowLeft/ArrowRight to collapse/expand like a tree item', () => {
    expect(groupKeyAction('ArrowLeft', true)).toBe('collapse');
    expect(groupKeyAction('ArrowLeft', false)).toBeNull();
    expect(groupKeyAction('ArrowRight', false)).toBe('expand');
    expect(groupKeyAction('ArrowRight', true)).toBeNull();
    expect(groupKeyAction('Enter', true)).toBeNull();
  });
});

const folder = (id: string, name: string, parent_id: string | null, children: TreeNode[] = [], category = '회차'): TreeNode =>
  ({ id, name, parent_id, node_type: 'folder', category, scope: 'work', is_locked: false, children });

describe('KbTree inside a section', () => {
  it('renders folders and root-level chapter leaves at the base depth with 20px indent steps', () => {
    const part1 = folder('p1', '1부', 'root');
    const html = renderToStaticMarkup(createElement(KbTree, {
      nodes: [part1], workId: 'w', baseDepth: 2,
      chaptersByFolderId: { p1: [{ id: 'c1', title: '1화', isPublished: true }] },
      leaves: [{ id: 'c0', title: '프롤로그', isPublished: false }], leavesFolderId: 'root',
    }));
    expect(html).toMatch(/data-node-id="p1"[^>]*style="padding-left:48px"|style="padding-left:48px"[^>]*data-node-id="p1"/);
    expect(html).toMatch(/data-chapter-id="c1"[^>]*style="padding-left:68px"|style="padding-left:68px"[^>]*data-chapter-id="c1"/);
    expect(html).toMatch(/data-chapter-id="c0"[^>]*style="padding-left:48px"|style="padding-left:48px"[^>]*data-chapter-id="c0"/);
    expect(html).toContain('프롤로그');
  });

  it('marks the active row with the mockup colours and keeps 32px rows (40px below lg)', () => {
    mock.params = { chapterId: 'c1' };
    const html = renderToStaticMarkup(createElement(KbTree, {
      nodes: [folder('p1', '1부', 'root')], workId: 'w',
      chaptersByFolderId: { p1: [{ id: 'c1', title: '1화', isPublished: true }] },
    }));
    const row = html.match(/<div[^>]*data-chapter-id="c1"[^>]*>/)?.[0] ?? '';
    expect(row).toContain('bg-[#ede9fe]');
    expect(row).toContain('text-[#3f2fd0]');
    expect(row).toContain('h-8');
    expect(row).toContain('max-lg:h-10');
  });
});

describe('studio layout tree structure (source)', () => {
  const layout = readFileSync('app/studio/[workId]/layout.tsx', 'utf8');

  it('places 작품 폴더 (회차 · 설정 · 템플릿) before 계정 폴더 (설정)', () => {
    const marks = ['label="작품 폴더"', 'label="회차"', 'nodes={sections.myFolders}', 'label="템플릿"', '<KbTemplateSection', 'label="계정 폴더"', 'nodes={sections.sharedFolders}'];
    const at = marks.map((m) => layout.indexOf(m));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(layout).toContain('모든 작품 공용');
    expect(layout).toContain('work.title');
  });

  it('keeps the existing entry points: template buttons, both folder-create buttons, chapter actions', () => {
    expect(layout).toContain('<TemplateSidebarEntry');
    expect(layout).toContain('<CreateRootFolderButton workId={workId} scope="work"');
    expect(layout).toContain('<CreateRootFolderButton workId={workId} scope="account_template"');
    expect(layout).toContain('<KbTreeActions');
    expect(layout).toContain('첫 회차를 써볼까요?');
    expect(layout).toContain('공유 폴더가 아직 없어요');
  });

  it('collapses 템플릿 by default with the 기본/내 count badge; layout stays a server component', () => {
    expect(layout).toMatch(/label="템플릿"[^>]*defaultOpen=\{false\}/);
    expect(layout).toMatch(/badge=\{`기본 \$\{sections\.defaultTemplates\.length\} · 내 \$\{sections\.myTemplates\.length\}`\}/);
    expect(layout).not.toContain("'use client'");
    expect(layout).not.toContain('useState');
  });
});

'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Folder, FileText, Lock, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KbTreeActions } from '@/components/studio/kb-node-dialogs';
import { ChapterRowMenu, KbNodeMenu, RowMenuButton, type RowBindings } from '@/components/studio/kb-node-menu';
import { useDragDim, useTreeDrag, useTreeDrop } from '@/components/studio/tree-dnd';
import { DROP, isMoveExcludedCategory, type DragItem } from '@/lib/kb/move-rules';
import type { TreeNode, ChapterLeaf } from '@/lib/kb/tree';
import { isTemplateRoot, templateCategoryOf } from '@/lib/kb/template-tree';
import { folderPresentation, toggleCollapsed } from '@/lib/kb/kb-node-menu-controller';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import type { TemplateEntry } from '@/lib/kb/sidebar-sections';
import { chapterBadgeAriaLabel, chapterInboxHref, countBadgeText } from '@/components/proposals/inbox-model';

/** 17-07 tree metrics: 32px rows (40px below lg), 20px indent per level, mockup active colours. */
export const INDENT_PX = 20;
export const rowPadding = (depth: number) => 8 + depth * INDENT_PX;
const ROW_BASE = 'group/row relative flex items-center gap-1 h-8 max-lg:h-10 px-2 text-sm';
const ACTIVE_ROW = 'bg-[#ede9fe] text-[#3f2fd0] font-medium';
export const rowClass = (active: boolean) => `${ROW_BASE}${active ? ` ${ACTIVE_ROW}` : ''}`;

/** Drag item for a settings row; template / 회차 / locked nodes never move this way. */
const kbDragItem = (node: TreeNode): DragItem | null =>
  node.is_locked || isMoveExcludedCategory(node.category) ? null : { kind: 'kb', nodeId: node.id, name: node.name };

/** Drop id for a folder row: 회차 folders take chapters, other settings folders take settings rows. */
const folderDropId = (node: TreeNode): string | null => {
  if (node.node_type !== 'folder' || node.category === 'template') return null;
  return node.category === '회차' ? DROP.chapterFolder(node.id) : DROP.kbFolder(node.id);
};

/** Merges a row's drag + drop bindings into one stable ref and the look while dragging. */
function useRowDnd(item: DragItem | null, dropId: string | null) {
  const drag = useTreeDrag(item);
  const drop = useTreeDrop(dropId);
  const dim = useDragDim(drag.isDragging);
  const { setNodeRef: setDragRef, setActivatorNodeRef } = drag;
  const { setNodeRef: setDropRef } = drop;
  const ref = useCallback((el: HTMLDivElement | null) => {
    setDragRef(el);
    setActivatorNodeRef(el);
    setDropRef(el);
  }, [setDragRef, setActivatorNodeRef, setDropRef]);
  const bindings = useMemo<RowBindings>(
    () => ({ ref, listeners: drag.listeners, attributes: drag.attributes, overlay: drop.hint }),
    [ref, drag.listeners, drag.attributes, drop.hint],
  );
  const look = drag.isDragging ? drag.className : dropId ? drop.className : dim;
  return { bindings, look, title: drop.title };
}

export function KbTree({
  nodes, chaptersByFolderId, workId, baseDepth = 0, leaves = [], leavesFolderId = null,
}: {
  nodes: TreeNode[]; chaptersByFolderId: Record<string, ChapterLeaf[]>; workId: string;
  /** Depth of the first level (a section header sits above it). */
  baseDepth?: number;
  /** Chapters rendered at the first level (the 회차 root's own chapters) and the folder they belong to. */
  leaves?: ChapterLeaf[]; leavesFolderId?: string | null;
}) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} depth={baseDepth} chaptersByFolderId={chaptersByFolderId} workId={workId} templateRoot={null} />
      ))}
      {leaves.map((chapter) => (
        <ChapterLeafRow key={chapter.id} chapter={chapter} depth={baseDepth} workId={workId} folderId={leavesFolderId} />
      ))}
    </ul>
  );
}

function TreeRow({
  node, depth, chaptersByFolderId, workId, templateRoot,
}: { node: TreeNode; depth: number; chaptersByFolderId: Record<string, ChapterLeaf[]>; workId: string; templateRoot: TreeNode | null }) {
  const params = useParams<{ nodeId?: string }>();
  const isActive = params?.nodeId === node.id;
  const isRootTemplateFolder = isTemplateRoot(node);
  const currentTemplateRoot = isRootTemplateFolder ? node : templateRoot;
  const isTemplateCategoryFolder = Boolean(currentTemplateRoot && templateCategoryOf(node, currentTemplateRoot));
  const categoryFolders = currentTemplateRoot?.children.filter((child) => templateCategoryOf(child, currentTemplateRoot)) ?? [];
  const isChapterRootFolder = node.category === '회차' && node.parent_id === null;
  const chapterLeaves = node.category === '회차' ? (chaptersByFolderId[node.id] ?? []) : [];
  const hasNoChapterContent = isChapterRootFolder && node.children.length === 0 && chapterLeaves.length === 0;
  const hasContent = node.children.length > 0 || chapterLeaves.length > 0;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const presentation = folderPresentation(collapsed, node.id);
  const parentTemplateCategory = node.category === 'template' && node.node_type === 'file'
    ? (categoryFolders.find((folder) => folder.id === node.parent_id)?.name ?? null)
    : null;
  const dnd = useRowDnd(kbDragItem(node), folderDropId(node));

  return (
    <li>
      <KbNodeMenu
        workId={workId}
        node={node}
        categoryFolders={categoryFolders}
        templateCategory={parentTemplateCategory}
        bindings={dnd.bindings}
        rowProps={{
          className: rowClass(isActive) + dnd.look,
          style: { paddingLeft: rowPadding(depth) },
          title: dnd.title,
          'data-node-id': node.id,
          'data-node-type': node.node_type,
          'data-locked': node.is_locked,
        }}
      >
        {node.node_type === 'folder' && hasContent ? (
          <button
            type="button"
            aria-expanded={presentation.ariaExpanded === 'true'}
            aria-label={`${node.name} ${presentation.visible ? '접기' : '펼치기'}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
            onClick={() => setCollapsed((current) => toggleCollapsed(current, node.id))}
          >
            {presentation.visible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span aria-hidden className="h-5 w-5 shrink-0" />
        )}
        {node.node_type === 'folder' ? (
          <Folder size={16} className="shrink-0" />
        ) : (
          <FileText size={16} className="shrink-0" />
        )}
        {node.node_type === 'file' ? (
          <Link href={`/studio/${workId}/kb/${node.id}`} className="min-w-0 flex-1 truncate" aria-current={isActive ? 'page' : undefined}>
            {node.name}
          </Link>
        ) : isChapterRootFolder ? (
          <Link href={`/studio/${workId}/chapters`} className="min-w-0 flex-1 truncate">{node.name}</Link>
        ) : (
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        )}
        {node.is_locked && (
          <Tooltip>
            <TooltipTrigger
              render={<Lock size={12} className="shrink-0 text-muted-foreground" aria-label="기본 폴더는 이름을 바꾸거나 삭제할 수 없어요" />}
            />
            <TooltipContent>기본 폴더는 이름을 바꾸거나 삭제할 수 없어요</TooltipContent>
          </Tooltip>
        )}
        {isRootTemplateFolder && node.scope === 'account_template' && (
          <Badge variant="outline" className="shrink-0 whitespace-nowrap text-xs">계정 공용</Badge>
        )}
        {isRootTemplateFolder && node.scope === 'work' && (
          <Badge variant="secondary" className="shrink-0 whitespace-nowrap text-xs">이 작품 전용</Badge>
        )}
        <RowActions active={isActive}>
          <KbTreeActions workId={workId} node={node} isTemplateCategoryFolder={isTemplateCategoryFolder} categoryFolders={categoryFolders} />
          <RowMenuButton />
        </RowActions>
      </KbNodeMenu>
      {hasContent && (
        <ul hidden={!presentation.visible}>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} chaptersByFolderId={chaptersByFolderId} workId={workId} templateRoot={currentTemplateRoot} />
          ))}
          {chapterLeaves.map((chapter) => (
            <ChapterLeafRow key={chapter.id} chapter={chapter} depth={depth + 1} workId={workId} folderId={node.id} />
          ))}
        </ul>
      )}
      {hasNoChapterContent && (
        <div className="flex items-center px-2 text-xs text-muted-foreground" style={{ paddingLeft: rowPadding(depth + 1) }}>
          <Link href={`/studio/${workId}/chapters/new?folderId=${node.id}`} className="hover:text-foreground">
            첫 회차를 써볼까요?
          </Link>
        </div>
      )}
    </li>
  );
}

function ChapterLeafRow({ chapter, depth, workId, folderId }: { chapter: ChapterLeaf; depth: number; workId: string; folderId: string | null }) {
  const params = useParams<{ chapterId?: string }>();
  const isActive = params?.chapterId === chapter.id;
  const dnd = useRowDnd({ kind: 'chapter', chapterId: chapter.id, name: chapter.title, folderId }, null);

  return (
    <li>
      <ChapterRowMenu
        chapterId={chapter.id} name={chapter.title} folderId={folderId} bindings={dnd.bindings}
        rowProps={{
          className: rowClass(isActive) + dnd.look,
          style: { paddingLeft: rowPadding(depth) },
          'data-chapter-id': chapter.id,
        }}
      >
        <span aria-hidden className="h-5 w-5 shrink-0" />
        <BookOpen size={16} className="shrink-0" />
        <Link
          href={`/studio/${workId}/chapters/${chapter.id}`}
          aria-current={isActive ? 'page' : undefined}
          className={`min-w-0 flex-1 truncate ${isActive || chapter.isPublished ? '' : 'text-muted-foreground'}`}
        >
          {chapter.title}
        </Link>
        {chapter.pendingCount ? (
          <Link
            href={chapterInboxHref(workId, chapter.id)}
            aria-label={chapterBadgeAriaLabel(chapter.title, chapter.pendingCount)}
            className="inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-lg:min-h-10 max-lg:min-w-10"
          >
            <span aria-hidden className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{countBadgeText(chapter.pendingCount)}</span>
          </Link>
        ) : null}
        <RowActions active={isActive}>
          <RowMenuButton />
        </RowActions>
      </ChapterRowMenu>
    </li>
  );
}

/** Row actions overlay the row's right edge instead of taking layout width, so a hidden action cluster can
 * no longer squeeze the name in the fixed-width sidebar (BUG-03). Only one row shows its buttons at a time:
 * on devices with a hovering pointer (desktop, tablet with mouse) the hovered row (or the keyboard-focused
 * one); on touch-only devices (`hover: none`) and below lg the row the user tapped, which opens it and makes
 * it the active row. Long press / right click still open the row menu. The row (`group/row relative`) is the
 * positioning context. The group MUST be named: an unnamed `group-hover`/`group-focus-within` would match
 * any ancestor `.group` and show every row's buttons at once. */
export function RowActions({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      data-row-actions
      data-row-active={active ? 'true' : undefined}
      className={`absolute inset-y-0 right-1 hidden items-center rounded-md pl-1 group-focus-within/row:flex group-hover/row:flex${active ? ' bg-[#ede9fe] [@media(hover:none)]:flex max-lg:flex' : ' bg-secondary'}`}
    >
      {children}
    </span>
  );
}

const NO_CATEGORY = '미분류';

/** 기본 5종 + 내 템플릿 section. Template category folders are flattened for display only (the DB tree is
 * untouched); 내 템플릿 groups are collapsible with the same aria-expanded contract as folder rows. */
export function KbTemplateSection({
  defaults, mine, workId, baseDepth = 0,
}: { defaults: TemplateEntry[]; mine: TemplateEntry[]; workId: string; baseDepth?: number }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = [...KB_CATEGORIES, NO_CATEGORY]
    .map((name) => ({ name, entries: mine.filter((entry) => (entry.category ?? NO_CATEGORY) === name) }))
    .filter((group) => group.entries.length > 0);
  const labelStyle = { paddingLeft: rowPadding(baseDepth) };

  return (
    <div className="flex flex-col" data-section="templates">
      <div className="pt-2 text-xs font-medium text-muted-foreground" style={labelStyle}>기본 템플릿</div>
      <ul>
        {defaults.map((entry) => <TemplateEntryRow key={entry.node.id} entry={entry} workId={workId} depth={baseDepth} />)}
      </ul>
      <div className="pt-3 text-xs font-medium text-muted-foreground" style={labelStyle}>내 템플릿</div>
      {groups.length === 0 && <p className="py-2 text-xs text-muted-foreground" style={labelStyle}>아직 만든 템플릿이 없어요.</p>}
      {groups.map((group) => {
        const presentation = folderPresentation(collapsed, group.name);
        return (
          <div key={group.name} data-template-group={group.name}>
            <button
              type="button"
              aria-expanded={presentation.ariaExpanded === 'true'}
              className="flex h-8 w-full items-center gap-1 pr-2 text-sm hover:bg-accent max-lg:h-10"
              style={labelStyle}
              onClick={() => setCollapsed((current) => toggleCollapsed(current, group.name))}
            >
              {presentation.visible ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
              <Folder size={16} className="shrink-0" />
              <span className="truncate">{group.name}</span>
            </button>
            {group.name === NO_CATEGORY && presentation.visible && (
              <p className="py-1 text-xs text-muted-foreground" style={{ paddingLeft: rowPadding(baseDepth + 1) }}>
                카테고리 폴더로 옮기면 분류돼요
              </p>
            )}
            <ul hidden={!presentation.visible}>
              {group.entries.map((entry) => <TemplateEntryRow key={entry.node.id} entry={entry} workId={workId} depth={baseDepth + 1} />)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TemplateEntryRow({ entry, workId, depth }: { entry: TemplateEntry; workId: string; depth: number }) {
  const params = useParams<{ nodeId?: string }>();
  const { node } = entry;
  const isActive = params?.nodeId === node.id;
  return (
    <li>
      <KbNodeMenu
        workId={workId}
        node={node}
        categoryFolders={entry.categoryFolders}
        templateCategory={entry.category}
        rowProps={{
          className: rowClass(isActive),
          style: { paddingLeft: rowPadding(depth + 1) },
          'data-node-id': node.id,
          'data-node-type': node.node_type,
          'data-locked': node.is_locked,
        }}
      >
        <FileText size={16} className="shrink-0" />
        <Link href={`/studio/${workId}/kb/${node.id}`} className="min-w-0 flex-1 truncate" aria-current={isActive ? 'page' : undefined}>
          {node.name}
        </Link>
        {node.is_locked ? (
          <Lock size={12} className="shrink-0 text-muted-foreground" aria-label="기본 템플릿은 수정할 수 없어요" />
        ) : (
          <Badge variant={node.scope === 'work' ? 'secondary' : 'outline'} className="shrink-0 whitespace-nowrap text-xs">
            {node.scope === 'work' ? '이 작품' : '계정'}
          </Badge>
        )}
        <RowActions active={isActive}>
          <KbTreeActions workId={workId} node={node} categoryFolders={entry.categoryFolders} />
        </RowActions>
      </KbNodeMenu>
    </li>
  );
}

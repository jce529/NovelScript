'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Folder, FileText, Lock, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KbTreeActions } from '@/components/studio/kb-node-dialogs';
import { KbNodeMenu } from '@/components/studio/kb-node-menu';
import type { TreeNode, ChapterLeaf } from '@/lib/kb/tree';
import { isTemplateRoot, templateCategoryOf } from '@/lib/kb/template-tree';
import { folderPresentation, toggleCollapsed } from '@/lib/kb/kb-node-menu-controller';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import type { TemplateEntry } from '@/lib/kb/sidebar-sections';

export function KbTree({
  nodes, chaptersByFolderId, workId,
}: { nodes: TreeNode[]; chaptersByFolderId: Record<string, ChapterLeaf[]>; workId: string }) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} depth={0} chaptersByFolderId={chaptersByFolderId} workId={workId} templateRoot={null} />
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
  const isUncategorizedTemplate = node.category === 'template' && node.node_type === 'file' && node.parent_id === currentTemplateRoot?.id;
  const isChapterRootFolder = node.category === '회차' && node.parent_id === null;
  const chapterLeaves = node.category === '회차' ? (chaptersByFolderId[node.id] ?? []) : [];
  const hasNoChapterContent = isChapterRootFolder && node.children.length === 0 && chapterLeaves.length === 0;
  const hasContent = node.children.length > 0 || chapterLeaves.length > 0;
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const presentation = folderPresentation(collapsed, node.id);
  const parentTemplateCategory = node.category === 'template' && node.node_type === 'file'
    ? (categoryFolders.find((folder) => folder.id === node.parent_id)?.name ?? null)
    : null;

  return (
    <li>
      <KbNodeMenu
        workId={workId}
        node={node}
        categoryFolders={categoryFolders}
        templateCategory={parentTemplateCategory}
        rowProps={{
          className: 'group flex items-center gap-1 h-8 px-2 text-sm',
          style: { paddingLeft: 8 + depth * 16 },
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
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
            onClick={() => setCollapsed((current) => toggleCollapsed(current, node.id))}
          >
            {presentation.visible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : null}
        {node.node_type === 'folder' ? (
          <Folder size={16} className={isActive ? 'text-primary' : undefined} />
        ) : (
          <FileText size={16} className={isActive ? 'text-primary' : undefined} />
        )}
        {node.node_type === 'file' ? (
          <Link
            href={`/studio/${workId}/kb/${node.id}`}
            className={`truncate ${isActive ? 'text-primary font-medium border-l-2 border-primary pl-1' : ''}`}
          >
            {node.name}
          </Link>
        ) : isChapterRootFolder ? (
          <Link href={`/studio/${workId}/chapters`} className="truncate">{node.name}</Link>
        ) : (
          <span className="truncate">{node.name}</span>
        )}
        {node.is_locked && (
          <Tooltip>
            <TooltipTrigger
              render={<Lock size={12} className="text-muted-foreground" aria-label="기본 폴더는 이름을 바꾸거나 삭제할 수 없어요" />}
            />
            <TooltipContent>기본 폴더는 이름을 바꾸거나 삭제할 수 없어요</TooltipContent>
          </Tooltip>
        )}
        {isRootTemplateFolder && node.scope === 'account_template' && (
          <Badge variant="outline" className="text-xs">계정 공용</Badge>
        )}
        {isRootTemplateFolder && node.scope === 'work' && (
          <Badge variant="secondary" className="text-xs">이 작품 전용</Badge>
        )}
        {isUncategorizedTemplate && (
          <Tooltip>
            <TooltipTrigger render={<span className="text-xs text-muted-foreground" aria-label="카테고리 미지정">미분류</span>} />
            <TooltipContent>카테고리 미지정 · 카테고리 폴더로 이동해 주세요</TooltipContent>
          </Tooltip>
        )}
        <span className="ml-auto opacity-0 group-hover:opacity-100">
          <KbTreeActions workId={workId} node={node} isTemplateCategoryFolder={isTemplateCategoryFolder} categoryFolders={categoryFolders} />
        </span>
      </KbNodeMenu>
      {hasContent && (
        <ul hidden={!presentation.visible}>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} chaptersByFolderId={chaptersByFolderId} workId={workId} templateRoot={currentTemplateRoot} />
          ))}
          {chapterLeaves.map((chapter) => (
            <ChapterLeafRow key={chapter.id} chapter={chapter} depth={depth + 1} workId={workId} />
          ))}
        </ul>
      )}
      {hasNoChapterContent && (
        <div className="flex items-center px-2 text-xs text-muted-foreground" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
          <Link href={`/studio/${workId}/chapters/new?folderId=${node.id}`} className="hover:text-foreground">
            첫 회차를 써볼까요?
          </Link>
        </div>
      )}
    </li>
  );
}

function ChapterLeafRow({ chapter, depth, workId }: { chapter: ChapterLeaf; depth: number; workId: string }) {
  const params = useParams<{ chapterId?: string }>();
  const isActive = params?.chapterId === chapter.id;

  return (
    <li>
      <div
        className="flex items-center gap-1 h-8 px-2 text-sm"
        style={{ paddingLeft: 8 + depth * 16 }}
        data-chapter-id={chapter.id}
      >
        <BookOpen size={16} className={isActive ? 'text-primary' : undefined} />
        <Link
          href={`/studio/${workId}/chapters/${chapter.id}`}
          className={`truncate ${
            isActive ? 'text-primary font-medium border-l-2 border-primary pl-1' : chapter.isPublished ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {chapter.title}
        </Link>
      </div>
    </li>
  );
}

const NO_CATEGORY = '미분류';

/** 기본 5종 + 내 템플릿 section. Template category folders are flattened for display only (the DB tree is
 * untouched); 내 템플릿 groups are collapsible with the same aria-expanded contract as folder rows. */
export function KbTemplateSection({
  defaults, mine, workId,
}: { defaults: TemplateEntry[]; mine: TemplateEntry[]; workId: string }) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const groups = [...KB_CATEGORIES, NO_CATEGORY]
    .map((name) => ({ name, entries: mine.filter((entry) => (entry.category ?? NO_CATEGORY) === name) }))
    .filter((group) => group.entries.length > 0);

  return (
    <div className="flex flex-col" data-section="templates">
      <div className="px-4 pt-2 text-xs font-medium text-muted-foreground">기본 템플릿</div>
      <ul>
        {defaults.map((entry) => <TemplateEntryRow key={entry.node.id} entry={entry} workId={workId} depth={0} />)}
      </ul>
      <div className="px-4 pt-3 text-xs font-medium text-muted-foreground">내 템플릿</div>
      {groups.length === 0 && <p className="px-4 py-2 text-xs text-muted-foreground">아직 만든 템플릿이 없어요.</p>}
      {groups.map((group) => {
        const presentation = folderPresentation(collapsed, group.name);
        return (
          <div key={group.name} data-template-group={group.name}>
            <button
              type="button"
              aria-expanded={presentation.ariaExpanded === 'true'}
              className="flex h-8 w-full items-center gap-1 px-4 text-sm hover:bg-accent"
              onClick={() => setCollapsed((current) => toggleCollapsed(current, group.name))}
            >
              {presentation.visible ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={16} />
              <span className="truncate">{group.name}</span>
            </button>
            <ul hidden={!presentation.visible}>
              {group.entries.map((entry) => <TemplateEntryRow key={entry.node.id} entry={entry} workId={workId} depth={1} />)}
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
          className: 'group flex items-center gap-1 h-8 px-2 text-sm',
          style: { paddingLeft: 8 + (depth + 1) * 16 },
          'data-node-id': node.id,
          'data-node-type': node.node_type,
          'data-locked': node.is_locked,
        }}
      >
        <FileText size={16} className={isActive ? 'text-primary' : undefined} />
        <Link
          href={`/studio/${workId}/kb/${node.id}`}
          className={`truncate ${isActive ? 'text-primary font-medium border-l-2 border-primary pl-1' : ''}`}
        >
          {node.name}
        </Link>
        {node.is_locked ? (
          <Lock size={12} className="text-muted-foreground" aria-label="기본 템플릿은 수정할 수 없어요" />
        ) : (
          <Badge variant={node.scope === 'work' ? 'secondary' : 'outline'} className="text-xs">
            {node.scope === 'work' ? '이 작품' : '계정'}
          </Badge>
        )}
        <span className="ml-auto opacity-0 group-hover:opacity-100">
          <KbTreeActions workId={workId} node={node} categoryFolders={entry.categoryFolders} />
        </span>
      </KbNodeMenu>
    </li>
  );
}

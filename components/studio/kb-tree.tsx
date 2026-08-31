'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Folder, FileText, Lock, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KbTreeActions } from '@/components/studio/kb-node-dialogs';
import type { TreeNode, ChapterLeaf } from '@/lib/kb/tree';

export function KbTree({
  nodes, chaptersByFolderId, workId,
}: { nodes: TreeNode[]; chaptersByFolderId: Record<string, ChapterLeaf[]>; workId: string }) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} depth={0} chaptersByFolderId={chaptersByFolderId} workId={workId} />
      ))}
    </ul>
  );
}

function TreeRow({
  node, depth, chaptersByFolderId, workId,
}: { node: TreeNode; depth: number; chaptersByFolderId: Record<string, ChapterLeaf[]>; workId: string }) {
  const params = useParams<{ nodeId?: string }>();
  const isActive = params?.nodeId === node.id;
  const isRootTemplateFolder = node.category === 'template' && node.parent_id === null;
  const isChapterRootFolder = node.category === '회차' && node.parent_id === null;
  const chapterLeaves = node.category === '회차' ? (chaptersByFolderId[node.id] ?? []) : [];
  const hasNoChapterContent = isChapterRootFolder && node.children.length === 0 && chapterLeaves.length === 0;

  return (
    <li>
      <div
        className="group flex items-center gap-1 h-8 px-2 text-sm"
        style={{ paddingLeft: 8 + depth * 16 }}
        data-node-id={node.id}
        data-node-type={node.node_type}
        data-locked={node.is_locked}
      >
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
        <span className="ml-auto opacity-0 group-hover:opacity-100">
          <KbTreeActions workId={workId} node={node} />
        </span>
      </div>
      {(node.children.length > 0 || chapterLeaves.length > 0) && (
        <ul>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} chaptersByFolderId={chaptersByFolderId} workId={workId} />
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

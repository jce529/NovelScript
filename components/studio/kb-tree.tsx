'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Folder, FileText, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KbTreeActions } from '@/components/studio/kb-node-dialogs';
import type { TreeNode } from '@/lib/kb/tree';

export function KbTree({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul className="flex flex-col">
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} depth={0} />
      ))}
    </ul>
  );
}

function TreeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const params = useParams<{ workId: string; nodeId?: string }>();
  const isActive = params?.nodeId === node.id;
  const isRootTemplateFolder = node.category === 'template' && node.parent_id === null;

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
            href={`/studio/${params.workId}/kb/${node.id}`}
            className={`truncate ${isActive ? 'text-primary font-medium border-l-2 border-primary pl-1' : ''}`}
          >
            {node.name}
          </Link>
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
          {params.workId && <KbTreeActions workId={params.workId} node={node} />}
        </span>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

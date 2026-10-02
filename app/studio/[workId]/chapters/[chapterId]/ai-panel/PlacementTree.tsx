'use client';

import { useMemo, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { FileText, FilePlus2, Folder, GripVertical } from 'lucide-react';
import { buildTree, type FlatKbNode, type TreeNode } from '@/lib/kb/tree';

const TRAY_ID = 'tray';
const folderDropId = (id: string) => `folder:${id}`;
const fileDragId = (name: string) => `file:${name}`;

export interface PlacementTreeProps {
  /** 기존 웹의 카테고리 트리(폴더 + 기존 문서). */
  nodes: FlatKbNode[];
  /** 업로드한 파일 이름들. */
  files: string[];
  /** 파일 이름 → 배치된 폴더 id (null = 아직 미배치). */
  placement: Record<string, string | null>;
  /** Jev가 처음 제안한 배치 — 사용자가 바꿨는지 표시하는 데 쓴다. */
  suggested: Record<string, string | null>;
  onMove: (fileName: string, folderId: string | null) => void;
  disabled?: boolean;
}

/** Jev가 제안한 배치를 기존 트리 위에 얹어 보여주고, 드래그앤드롭으로 고치게 한다. */
export function PlacementTree({ nodes, files, placement, suggested, onMove, disabled }: PlacementTreeProps) {
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const [activeName, setActiveName] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const filesByFolder = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const name of files) {
      const folderId = placement[name];
      if (folderId) (map[folderId] ??= []).push(name);
    }
    return map;
  }, [files, placement]);
  const unplaced = files.filter((name) => !placement[name]);

  function handleDragStart(event: DragStartEvent) {
    setActiveName(String(event.active.id).replace(/^file:/, ''));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveName(null);
    const { active, over } = event;
    if (!over) return;
    const fileName = String(active.id).replace(/^file:/, '');
    const overId = String(over.id);
    if (overId === TRAY_ID) onMove(fileName, null);
    else if (overId.startsWith('folder:')) onMove(fileName, overId.slice('folder:'.length));
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveName(null)}>
      <div className="flex flex-col gap-2">
        <Tray names={unplaced} disabled={disabled} />
        <ul className="max-h-72 overflow-y-auto rounded-md border border-border py-1 text-sm" aria-label="문서 배치 트리">
          {tree.map((node) => (
            <FolderRow key={node.id} node={node} depth={0} filesByFolder={filesByFolder} suggested={suggested} placement={placement} disabled={disabled} />
          ))}
        </ul>
      </div>
      <DragOverlay>
        {activeName ? <PendingChip name={activeName} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Tray({ names, disabled }: { names: string[]; disabled?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_ID });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border border-dashed p-2 ${isOver ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <p className="mb-1 text-xs text-muted-foreground">
        {names.length > 0 ? `미분류 ${names.length}개 — 아래 트리의 폴더로 끌어다 놓아주세요` : '모든 문서가 배치됐어요'}
      </p>
      <div className="flex flex-wrap gap-1">
        {names.map((name) => <DraggableFile key={name} name={name} disabled={disabled} />)}
      </div>
    </div>
  );
}

function FolderRow({ node, depth, filesByFolder, suggested, placement, disabled }: {
  node: TreeNode; depth: number; filesByFolder: Record<string, string[]>;
  suggested: Record<string, string | null>; placement: Record<string, string | null>; disabled?: boolean;
}) {
  const isFolder = node.node_type === 'folder';
  const { setNodeRef, isOver } = useDroppable({ id: folderDropId(node.id), disabled: !isFolder });
  const pending = filesByFolder[node.id] ?? [];

  return (
    <li>
      <div
        ref={isFolder ? setNodeRef : undefined}
        className={`flex h-8 items-center gap-1 px-2 ${isOver ? 'bg-primary/10 ring-1 ring-primary' : ''} ${isFolder ? '' : 'text-muted-foreground'}`}
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {isFolder ? <Folder size={16} /> : <FileText size={16} />}
        <span className="truncate">{node.name}</span>
      </div>
      {(node.children.length > 0 || pending.length > 0) && (
        <ul>
          {node.children.map((child) => (
            <FolderRow key={child.id} node={child} depth={depth + 1} filesByFolder={filesByFolder} suggested={suggested} placement={placement} disabled={disabled} />
          ))}
          {pending.map((name) => (
            <li key={name} style={{ paddingLeft: 8 + (depth + 1) * 16 }} className="py-0.5">
              <DraggableFile name={name} disabled={disabled} moved={suggested[name] !== placement[name]} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function DraggableFile({ name, moved, disabled }: { name: string; moved?: boolean; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: fileDragId(name), disabled });
  return (
    <span ref={setNodeRef} className={isDragging ? 'opacity-40' : undefined}>
      <PendingChip name={name} moved={moved} handleProps={{ ...attributes, ...listeners }} />
    </span>
  );
}

function PendingChip({ name, moved, dragging, handleProps }: {
  name: string; moved?: boolean; dragging?: boolean; handleProps?: Record<string, unknown>;
}) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-xs ${dragging ? 'shadow-md' : ''}`}>
      {/* 핸들만 touch-none: 모바일에서 목록 스크롤과 드래그가 충돌하지 않게 한다. */}
      <button type="button" aria-label={`${name} 옮기기`} className="touch-none cursor-grab text-muted-foreground" {...handleProps}>
        <GripVertical className="size-3" />
      </button>
      <FilePlus2 className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
      {moved && <span className="shrink-0 text-[10px] text-muted-foreground">수정됨</span>}
    </span>
  );
}

import { josa } from '@/lib/text/josa';
'use client';

import { createContext, useContext, useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragOverEvent,
  type DragStartEvent, type PointerSensorOptions,
} from '@dnd-kit/core';
import { BookOpen, FileText } from 'lucide-react';
import type { ChapterLeaf, TreeNode } from '@/lib/kb/tree';
import {
  DROP, MOVE_COPY, flattenTree, nodeMapOf, resolveDrop, type DragItem, type DropDecision, type MoveNode,
} from '@/lib/kb/move-rules';
import { moveKbNodeAction } from '@/app/studio/[workId]/kb/[nodeId]/actions';
import { moveChapterAction } from '@/app/studio/[workId]/chapters/actions';

type NamedNode = MoveNode & { name: string };

export interface TreeMoveData {
  workId: string;
  workTree: TreeNode[];
  accountTree: TreeNode[];
  chapterRoot: TreeNode | null;
  chaptersByFolderId: Record<string, ChapterLeaf[]>;
  nodes: ReadonlyMap<string, NamedNode>;
}

interface DragState {
  item: DragItem | null;
  overId: string | null;
  decide: (dropId: string) => DropDecision | null;
}

const TreeMoveContext = createContext<TreeMoveData | null>(null);
const DragStateContext = createContext<DragState>({ item: null, overId: null, decide: () => null });

/** Move data for the "이동…" dialogs; null outside the sidebar tree (then no move is offered). */
export const useTreeMove = () => useContext(TreeMoveContext);

/** The one place both the dialogs and drag-and-drop call the server: same actions, same copy. */
export async function performTreeMove(
  workId: string, item: DragItem, targetId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = item.kind === 'chapter'
      ? await moveChapterAction(workId, item.chapterId, targetId)
      : await moveKbNodeAction(workId, item.nodeId, targetId);
    return result.ok ? { ok: true } : { ok: false, error: result.error ?? MOVE_COPY.failed };
  } catch {
    return { ok: false, error: MOVE_COPY.failed };
  }
}

export const movedMessage = (name: string, targetName: string) => `‘${name}’${josa(name, 'eul')} ‘${targetName}’${josa(targetName, 'euro')} 옮겼어요.`;

/** Mouse / pen only: touch keeps long-press for the row menu, so it never starts a drag. */
class MousePenSensor extends PointerSensor {
  static activators = [{
    eventName: 'onPointerDown' as const,
    handler: ({ nativeEvent: event }: React.PointerEvent, { onActivation }: PointerSensorOptions) => {
      if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return false;
      onActivation?.({ event });
      return true;
    },
  }];
}

// Pointer first; the keyboard sensor has no pointer, so fall back to rectangle overlap.
const collision: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : rectIntersection(args);
};

const itemOf = (data: unknown) => (data && typeof data === 'object' && 'kind' in data ? (data as DragItem) : null);

/** Sidebar-tree move provider: dnd-kit context (mouse/pen 8px, keyboard), drag-over feedback, the ghost
 * chip, the bottom status pill and the shared move data for the dialogs. Failures toast and leave the
 * tree as it was (nothing moves until the server confirms and the route refreshes). */
export function TreeDndProvider({
  workId, workTree, accountTree, chaptersByFolderId, children,
}: { workId: string; workTree: TreeNode[]; accountTree: TreeNode[]; chaptersByFolderId: Record<string, ChapterLeaf[]>; children?: React.ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [item, setItem] = useState<DragItem | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // Stable SSR/hydration id for dnd-kit's aria-describedby (its own counter differs between server and client).
  const dndId = useId();
  const sensors = useSensors(
    useSensor(MousePenSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const data = useMemo<TreeMoveData>(() => {
    const chapterRoot = workTree.find((node) => node.category === '회차' && node.parent_id === null) ?? null;
    const nodes = nodeMapOf([...flattenTree(workTree), ...flattenTree(accountTree)] as NamedNode[]);
    return { workId, workTree, accountTree, chapterRoot, chaptersByFolderId, nodes };
  }, [workId, workTree, accountTree, chaptersByFolderId]);

  const decideFor = (dragItem: DragItem | null, dropId: string | null) =>
    dragItem && dropId ? resolveDrop(dragItem, dropId, { nodes: data.nodes, chapterRootId: data.chapterRoot?.id ?? null }) : null;

  const dragState = useMemo<DragState>(() => ({
    item, overId,
    decide: (dropId) => (item ? resolveDrop(item, dropId, { nodes: data.nodes, chapterRootId: data.chapterRoot?.id ?? null }) : null),
  }), [item, overId, data]);

  const reset = () => { setItem(null); setOverId(null); };
  const onDragStart = (event: DragStartEvent) => setItem(itemOf(event.active.data.current));
  const onDragOver = (event: DragOverEvent) => setOverId(event.over ? String(event.over.id) : null);
  const onDragEnd = (event: DragEndEvent) => {
    const dragItem = itemOf(event.active.data.current);
    reset();
    if (!dragItem || !event.over) return;
    const decision = decideFor(dragItem, String(event.over.id));
    if (!decision) return;
    if (!decision.ok) { toast.error(decision.message ?? MOVE_COPY.failed); return; }
    if (decision.noop) return;
    startTransition(async () => {
      const result = await performTreeMove(workId, dragItem, decision.targetId);
      if (!result.ok) { toast.error(result.error ?? MOVE_COPY.failed); return; }
      toast.success(movedMessage(dragItem.name, decision.targetName));
      router.refresh();
    });
  };

  const nameOfOver = (over: { id: string | number } | null) => (over ? decideFor(item, String(over.id))?.targetName ?? '' : '');
  const announcements: Announcements = {
    onDragStart: ({ active }) => `‘${itemOf(active.data.current)?.name ?? ''}’${josa(itemOf(active.data.current)?.name ?? '', 'eul')} 들었어요. 화살표로 옮길 폴더를 고르고 Space로 놓으세요. Esc로 취소해요.`,
    onDragOver: ({ over }) => {
      if (!over) return '옮길 폴더 밖이에요.';
      const decision = decideFor(item, String(over.id));
      return decision?.ok ? `‘${decision.targetName}’ 위예요. 놓으면 이동해요.` : decision?.message ?? undefined;
    },
    onDragEnd: ({ over }) => (over ? `‘${nameOfOver(over)}’에 놓았어요.` : '이동을 취소했어요.'),
    onDragCancel: () => '이동을 취소했어요.',
  };

  const decision = decideFor(item, overId);
  return (
    <TreeMoveContext.Provider value={data}>
      <DragStateContext.Provider value={dragState}>
        <DndContext
          id={dndId} sensors={sensors} collisionDetection={collision}
          onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={reset}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: 'Space나 Enter로 들고, 화살표로 옮길 폴더를 고른 뒤 Space로 놓아요. Esc로 취소해요.' },
          }}
        >
          {children}
          <DragOverlay dropAnimation={null}>
            {item ? <GhostChip item={item} /> : null}
          </DragOverlay>
          {item && <StatusPill item={item} decision={decision} />}
        </DndContext>
      </DragStateContext.Provider>
    </TreeMoveContext.Provider>
  );
}

function GhostChip({ item }: { item: DragItem }) {
  const Icon = item.kind === 'chapter' ? BookOpen : FileText;
  return (
    <div className="inline-flex max-w-60 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm shadow-lg">
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{item.name}</span>
    </div>
  );
}

/** Bottom pill: "{이름} → {대상} · 놓으면 이동해요  Esc로 취소". aria-hidden: dnd-kit announces the same. */
export function pillText(item: DragItem, decision: DropDecision | null): { main: string; tone: 'idle' | 'valid' | 'invalid' } {
  if (!decision) return { main: `${item.name} · 옮길 폴더 위에 놓으세요`, tone: 'idle' };
  if (!decision.ok) return { main: decision.message ?? MOVE_COPY.failed, tone: 'invalid' };
  if (decision.noop) return { main: `${item.name} · 지금 있는 곳이에요`, tone: 'idle' };
  return { main: `${item.name} → ${decision.targetName} · 놓으면 이동해요`, tone: 'valid' };
}

function StatusPill({ item, decision }: { item: DragItem; decision: DropDecision | null }) {
  const text = pillText(item, decision);
  return (
    <div
      aria-hidden
      data-tree-move-pill
      className={`pointer-events-none fixed bottom-6 left-1/2 z-50 flex max-w-[90vw] -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full px-4 py-2 text-sm shadow-lg ${
        text.tone === 'invalid' ? 'bg-destructive text-white' : 'bg-foreground text-background'
      }`}
    >
      <span className="truncate">{text.main}</span>
      <span className="shrink-0 opacity-70">Esc로 취소</span>
    </div>
  );
}

/** Draggable binding for a row (`item` null = not draggable). Works as a no-op outside the provider. */
export function useTreeDrag(item: DragItem | null) {
  const inTree = useTreeMove() !== null;
  const fallbackId = useId();
  const id = item ? (item.kind === 'chapter' ? `drag:ch:${item.chapterId}` : `drag:kb:${item.nodeId}`) : `drag:none:${fallbackId}`;
  const draggable = useDraggable({ id, data: item ?? undefined, disabled: !item || !inTree });
  const enabled = Boolean(item) && inTree;
  return {
    enabled,
    setNodeRef: draggable.setNodeRef,
    setActivatorNodeRef: draggable.setActivatorNodeRef,
    listeners: enabled ? draggable.listeners : undefined,
    attributes: enabled
      ? { ...draggable.attributes, role: undefined, 'aria-roledescription': '옮길 수 있는 항목' }
      : undefined,
    isDragging: draggable.isDragging,
    className: draggable.isDragging ? ' opacity-50 outline-dashed outline-1 -outline-offset-1 outline-muted-foreground' : '',
  };
}

/** Droppable binding + drag-over look for a folder row or section header (`dropId` null = not a target). */
export function useTreeDrop(dropId: string | null) {
  const state = useContext(DragStateContext);
  const fallbackId = useId();
  const droppable = useDroppable({ id: dropId ?? `drop:none:${fallbackId}`, disabled: !dropId });
  const dragging = state.item !== null;
  const decision = dragging && dropId ? state.decide(dropId) : null;
  const isOver = dragging && dropId !== null && state.overId === dropId;
  const valid = Boolean(decision?.ok && !decision.noop);
  let className = '';
  let hint: React.ReactNode = null;
  if (dragging) {
    if (isOver && valid) {
      className = ' outline-2 -outline-offset-2 outline-[#4f3cf5] bg-[#ede9fe]';
      hint = <span className="pointer-events-none absolute right-2 shrink-0 whitespace-nowrap text-xs font-medium text-[#4f3cf5]">여기로 이동</span>;
    } else if (!valid) {
      className = ' opacity-40';
      if (isOver && decision?.message) {
        hint = <span className="pointer-events-none absolute right-2 max-w-[60%] truncate text-xs text-muted-foreground">{decision.message}</span>;
      }
    }
  }
  return { setNodeRef: droppable.setNodeRef, className, hint, title: dragging && !valid ? decision?.message ?? undefined : undefined };
}

/** Rows that are never drop targets (documents, chapters) dim while something is being dragged. */
export function useDragDim(isSelfDragging = false) {
  const state = useContext(DragStateContext);
  return state.item !== null && !isSelfDragging ? ' opacity-40' : '';
}

export { DROP };
export type { DragItem };

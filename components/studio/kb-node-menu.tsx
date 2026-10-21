'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CopyTemplateDialog, CreateNodeDialog, DeleteNodeDialog, MoveTemplateFileDialog, RenameNodeDialog,
} from '@/components/studio/kb-node-dialogs';
import type { TreeNode } from '@/lib/kb/tree';
import {
  createNodeMenuController, menuActionsFor, type MenuActionId, type NodeMenuController, type Point,
} from '@/lib/kb/kb-node-menu-controller';

const ACTION_LABEL: Record<MenuActionId, string> = {
  copy: '사본 만들기',
  'create-from-template': '이 템플릿으로 새 문서',
  move: '카테고리 폴더로 이동',
  rename: '이름 바꾸기',
  delete: '삭제',
};

type RowProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> & { [data: `data-${string}`]: string | boolean | undefined };

/** Wraps a KB document / template row. Right-click, touch long-press (500ms) and Shift+F10 / ContextMenu all
 * open the same menu, whose actions open the same dialogs the row icon buttons use. */
export function KbNodeMenu({
  workId, node, categoryFolders = [], templateCategory = null, rowProps, children,
}: {
  workId: string; node: TreeNode; categoryFolders?: TreeNode[]; templateCategory?: string | null;
  rowProps?: RowProps; children: React.ReactNode;
}) {
  const router = useRouter();
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<NodeMenuController | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [dialog, setDialog] = useState<MenuActionId | null>(null);

  const actions = menuActionsFor(node, { hasCategoryFolders: categoryFolders.length > 0, templateCategory });

  useEffect(() => {
    const controller = createNodeMenuController(
      (p) => { returnFocusRef.current = document.activeElement as HTMLElement | null; setPoint(p); },
      { onClose: () => { setPoint(null); returnFocusRef.current?.focus(); } },
    );
    controllerRef.current = controller;
    return () => { controller.dispose(); controllerRef.current = null; };
  }, []);

  // Outside press closes the menu.
  useEffect(() => {
    if (!point) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) controllerRef.current?.close();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [point]);

  useEffect(() => { if (point) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(); }, [point]);

  // Scrolling anywhere cancels a pending long press.
  useEffect(() => {
    const onScroll = () => controllerRef.current?.scroll();
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);

  const select = useCallback((id: MenuActionId) => {
    controllerRef.current?.close();
    setDialog(id);
  }, []);

  if (actions.length === 0) {
    return <div {...rowProps}>{children}</div>;
  }

  const closeDialog = () => setDialog(null);
  return (
    <>
      <div
        {...rowProps}
        ref={rowRef}
        onContextMenu={(e) => {
          if (controllerRef.current?.contextMenu({ x: e.clientX, y: e.clientY })) e.preventDefault();
        }}
        onPointerDown={(e) => controllerRef.current?.pointerDown({ pointerType: e.pointerType, x: e.clientX, y: e.clientY })}
        onPointerMove={(e) => controllerRef.current?.pointerMove({ x: e.clientX, y: e.clientY })}
        onPointerUp={() => controllerRef.current?.pointerUp()}
        onPointerCancel={() => controllerRef.current?.pointerCancel()}
        onClickCapture={(e) => {
          if (controllerRef.current?.consumeClickBlock()) { e.preventDefault(); e.stopPropagation(); }
        }}
        onKeyDown={(e) => {
          const rect = rowRef.current?.getBoundingClientRect();
          const handled = controllerRef.current?.keyDown(e, { x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
          if (handled) e.preventDefault();
        }}
      >
        {children}
      </div>
      {point && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${node.name} 메뉴`}
          className="fixed z-50 min-w-40 rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
          style={{ left: point.x, top: point.y }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); controllerRef.current?.keyDown({ key: 'Escape' }, point); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
              const at = items.indexOf(document.activeElement as HTMLElement);
              items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
            }
          }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              role="menuitem"
              type="button"
              disabled={!action.enabled}
              className="flex w-full items-center rounded px-2 py-1.5 text-left hover:bg-accent focus:bg-accent disabled:opacity-50"
              onClick={() => select(action.id)}
            >
              {ACTION_LABEL[action.id]}
            </button>
          ))}
        </div>
      )}
      {dialog === 'copy' && (
        <CopyTemplateDialog open onOpenChange={(v) => !v && closeDialog()} workId={workId} nodeId={node.id} currentName={node.name} />
      )}
      {dialog === 'create-from-template' && templateCategory && (
        <CreateNodeDialog
          open onOpenChange={(v) => !v && closeDialog()} workId={workId} parentId={null} category={templateCategory}
          preselectedTemplateId={node.is_locked ? null : node.id}
          onCreated={(newId) => { router.refresh(); if (newId) router.push(`/studio/${workId}/kb/${newId}`); }}
        />
      )}
      {dialog === 'move' && (
        <MoveTemplateFileDialog
          open onOpenChange={(v) => !v && closeDialog()} workId={workId} nodeId={node.id}
          currentParentId={node.parent_id} categoryFolders={categoryFolders} onMoved={() => router.refresh()}
        />
      )}
      {dialog === 'rename' && (
        <RenameNodeDialog open onOpenChange={(v) => !v && closeDialog()} workId={workId} nodeId={node.id} currentName={node.name} />
      )}
      {dialog === 'delete' && (
        <DeleteNodeDialog
          open onOpenChange={(v) => !v && closeDialog()} workId={workId} nodeId={node.id} name={node.name}
          onDeleted={() => router.refresh()}
        />
      )}
    </>
  );
}

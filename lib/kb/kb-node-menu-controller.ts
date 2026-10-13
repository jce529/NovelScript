/** Pure (no DOM/React) controller behind the row menu and folder toggles, so long-press / context-menu /
 * keyboard / cancel / dispose behaviour is testable under vitest's node environment. */

export const LONG_PRESS_MS = 500;
export const MOVE_TOLERANCE_PX = 8;

export type MenuActionId = 'copy' | 'create-from-template' | 'move' | 'rename' | 'delete';
export interface MenuAction { id: MenuActionId; enabled: boolean }

interface MenuNode { node_type: string; category: string; is_locked: boolean }

/** Actions a row offers. Locked defaults get 사본 만들기 only; chapters/folders are not menu rows. */
export function menuActionsFor(node: MenuNode, opts: { hasCategoryFolders?: boolean; templateCategory?: string | null } = {}): MenuAction[] {
  if (node.node_type !== 'file') return [];
  if (node.category === 'template') {
    if (node.is_locked) return [{ id: 'copy', enabled: true }];
    const actions: MenuAction[] = [{ id: 'copy', enabled: true }];
    if (opts.templateCategory) actions.push({ id: 'create-from-template', enabled: true });
    if (opts.hasCategoryFolders) actions.push({ id: 'move', enabled: true });
    actions.push({ id: 'rename', enabled: true }, { id: 'delete', enabled: true });
    return actions;
  }
  if (node.is_locked) return [];
  return [{ id: 'rename', enabled: true }, { id: 'delete', enabled: true }];
}

export interface Point { x: number; y: number }
export interface Scheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}
const defaultScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface NodeMenuController {
  pointerDown(e: { pointerType: string; x: number; y: number }): void;
  pointerMove(e: Point): void;
  pointerUp(): void;
  pointerCancel(): void;
  scroll(): void;
  /** Right-click / native contextmenu. Returns true when the caller should preventDefault. */
  contextMenu(point: Point): boolean;
  /** Returns 'open' | 'close' when the key was handled (caller preventDefaults), else null. */
  keyDown(e: { key: string; shiftKey?: boolean }, anchor: Point): 'open' | 'close' | null;
  /** True exactly once after a long press opened the menu: the follow-up click must not navigate. */
  consumeClickBlock(): boolean;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

export function createNodeMenuController(
  onOpen: (point: Point) => void,
  opts: { scheduler?: Scheduler; onClose?: () => void } = {},
): NodeMenuController {
  const scheduler = opts.scheduler ?? defaultScheduler;
  let handle: unknown = null;
  let start: Point | null = null;
  let open = false;
  let blockClick = false;
  let disposed = false;

  const cancelTimer = () => {
    if (handle !== null) scheduler.clear(handle);
    handle = null;
    start = null;
  };
  const openAt = (point: Point) => {
    if (disposed || open) return;
    open = true;
    onOpen(point);
  };

  return {
    pointerDown(e) {
      if (disposed || e.pointerType === 'mouse') return;
      cancelTimer();
      blockClick = false;
      start = { x: e.x, y: e.y };
      const point = start;
      handle = scheduler.set(() => {
        handle = null;
        start = null;
        if (open) return;
        blockClick = true;
        openAt(point);
      }, LONG_PRESS_MS);
    },
    pointerMove(e) {
      if (!start) return;
      if (Math.hypot(e.x - start.x, e.y - start.y) > MOVE_TOLERANCE_PX) cancelTimer();
    },
    pointerUp() { cancelTimer(); },
    pointerCancel() { cancelTimer(); },
    scroll() { cancelTimer(); },
    contextMenu(point) {
      if (disposed) return false;
      openAt(point);
      return true;
    },
    keyDown(e, anchor) {
      if (disposed) return null;
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { openAt(anchor); return 'open'; }
      if (e.key === 'Escape' && open) { this.close(); return 'close'; }
      return null;
    },
    consumeClickBlock() {
      const blocked = blockClick;
      blockClick = false;
      return blocked;
    },
    close() {
      if (!open) return;
      open = false;
      opts.onClose?.();
    },
    isOpen: () => open,
    dispose() {
      disposed = true;
      cancelTimer();
      blockClick = false;
      open = false;
    },
  };
}

/** Folder toggle state: a set of collapsed ids (default = expanded). Pure so visibility and aria agree. */
export function toggleCollapsed(collapsed: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function folderPresentation(collapsed: ReadonlySet<string>, id: string): { visible: boolean; ariaExpanded: 'true' | 'false' } {
  const visible = !collapsed.has(id);
  return { visible, ariaExpanded: visible ? 'true' : 'false' };
}

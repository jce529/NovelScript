import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNodeMenuController, menuActionsFor, type Point } from '@/lib/kb/kb-node-menu-controller';

const touch = (x = 10, y = 10) => ({ pointerType: 'touch', x, y });

describe('menuActionsFor', () => {
  it('default (locked) template offers copy only', () => {
    const actions = menuActionsFor({ node_type: 'file', category: 'template', is_locked: true }, { hasCategoryFolders: true, templateCategory: '인물' });
    expect(actions).toEqual([{ id: 'copy', enabled: true }]);
  });

  it('custom template and documents expose rename; folders and locked docs expose nothing', () => {
    const custom = menuActionsFor({ node_type: 'file', category: 'template', is_locked: false }, { hasCategoryFolders: true, templateCategory: '인물' });
    expect(custom.map((a) => a.id)).toEqual(['copy', 'create-from-template', 'move', 'rename', 'delete']);
    expect(menuActionsFor({ node_type: 'file', category: '인물', is_locked: false }).map((a) => a.id)).toEqual(['rename', 'delete']);
    expect(menuActionsFor({ node_type: 'file', category: '인물', is_locked: true })).toEqual([]);
    expect(menuActionsFor({ node_type: 'folder', category: 'custom', is_locked: false })).toEqual([]);
  });
});

type Controller = ReturnType<typeof createNodeMenuController>;

describe('createNodeMenuController', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup() {
    const opened: Point[] = [];
    const controller = createNodeMenuController((p) => opened.push(p));
    return { opened, controller };
  }

  it('does not open on a 499ms press and lets the click navigate', () => {
    const { opened, controller } = setup();
    controller.pointerDown(touch());
    vi.advanceTimersByTime(499);
    controller.pointerUp();
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(0);
    expect(controller.consumeClickBlock()).toBe(false);
  });

  it('opens once at 500ms and blocks exactly one following click', () => {
    const { opened, controller } = setup();
    controller.pointerDown(touch(5, 6));
    vi.advanceTimersByTime(500);
    expect(opened).toEqual([{ x: 5, y: 6 }]);
    controller.pointerUp();
    vi.advanceTimersByTime(2000);
    expect(opened).toHaveLength(1);
    // the native contextmenu that follows a long press must not reopen the menu
    expect(controller.contextMenu({ x: 5, y: 6 })).toBe(true);
    expect(opened).toHaveLength(1);
    expect(controller.consumeClickBlock()).toBe(true);
    expect(controller.consumeClickBlock()).toBe(false);
  });

  it.each([
    ['pointercancel', (c: Controller) => c.pointerCancel()],
    ['scroll', (c: Controller) => c.scroll()],
    ['move beyond 8px', (c: Controller) => c.pointerMove({ x: 10, y: 19 })],
    ['dispose (unmount)', (c: Controller) => c.dispose()],
  ])('%s before 500ms cancels the long press', (_name, cancel) => {
    const { opened, controller } = setup();
    controller.pointerDown(touch());
    vi.advanceTimersByTime(300);
    cancel(controller);
    vi.advanceTimersByTime(5000);
    expect(opened).toHaveLength(0);
    expect(controller.consumeClickBlock()).toBe(false);
  });

  it('a move within 8px keeps the long press alive', () => {
    const { opened, controller } = setup();
    controller.pointerDown(touch());
    controller.pointerMove({ x: 14, y: 14 });
    vi.advanceTimersByTime(500);
    expect(opened).toHaveLength(1);
  });

  it('mouse pointerdown never starts a long press; right-click opens the menu', () => {
    const { opened, controller } = setup();
    controller.pointerDown({ pointerType: 'mouse', x: 1, y: 1 });
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(0);
    expect(controller.contextMenu({ x: 3, y: 4 })).toBe(true);
    expect(opened).toEqual([{ x: 3, y: 4 }]);
  });

  it('keyboard ContextMenu and Shift+F10 open; Escape closes and reports it', () => {
    const closed = vi.fn();
    const opened: Point[] = [];
    const controller = createNodeMenuController((p) => opened.push(p), { onClose: closed });
    expect(controller.keyDown({ key: 'F10', shiftKey: false }, { x: 0, y: 0 })).toBeNull();
    expect(controller.keyDown({ key: 'F10', shiftKey: true }, { x: 1, y: 2 })).toBe('open');
    expect(opened).toEqual([{ x: 1, y: 2 }]);
    expect(controller.keyDown({ key: 'Escape' }, { x: 0, y: 0 })).toBe('close');
    expect(closed).toHaveBeenCalledTimes(1);
    expect(controller.isOpen()).toBe(false);
    expect(controller.keyDown({ key: 'ContextMenu' }, { x: 7, y: 8 })).toBe('open');
    expect(opened).toHaveLength(2);
  });

  it('a disposed controller ignores later events', () => {
    const { opened, controller } = setup();
    controller.dispose();
    expect(controller.contextMenu({ x: 1, y: 1 })).toBe(false);
    expect(controller.keyDown({ key: 'ContextMenu' }, { x: 1, y: 1 })).toBeNull();
    controller.pointerDown(touch());
    vi.advanceTimersByTime(1000);
    expect(opened).toHaveLength(0);
  });
});

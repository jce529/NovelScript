import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createEditorState,
  editorReducer,
  selectSaveStatus,
  type EditorAction,
} from '@/lib/studio/editor-state';
import { applyEdit, performSave, spliceAtSelection } from '@/lib/studio/editor-session';
import { INITIAL_PANEL_STATE, panelReducer, presentPanels, slotCommands } from '@/lib/studio/panel-controller';
import { PRICE_TIERS } from '@/lib/chapters/actions';

const PAGE = readFileSync('app/studio/[workId]/chapters/[chapterId]/page.tsx', 'utf8');

function store() {
  let state = createEditorState();
  const dispatch = vi.fn((action: EditorAction) => {
    state = editorReducer(state, action);
  });
  dispatch({ type: 'load', resourceKey: 'chapter:w:c1', content: 'base' });
  dispatch.mockClear();
  return { dispatch, get: () => state };
}

describe('chapter editor save state', () => {
  it('save pending is the reducer saving status; publish pending never feeds it', () => {
    const s = store();
    expect(selectSaveStatus(s.get())).toBe('saved');
    // page keeps publish pending in its own transition, separate from the reducer
    expect(PAGE).toMatch(/isPublishPending/);
    expect(PAGE).toMatch(/selectSaveStatus\(editor\) === 'saving'/);
    expect(PAGE).not.toMatch(/disabled=\{isPending/);
    // performSave is only wired to saveChapterContentAction
    expect(PAGE.match(/performSave\(/g)).toHaveLength(1);
    expect(PAGE).toMatch(/saveChapterContentAction\(workId, chapterId, content\)/);
  });

  it('typing or AI insert during an in-flight save keeps the draft dirty after success', async () => {
    const s = store();
    applyEdit(false, 'chapter:w:c1', 'base1', s.dispatch);
    let release!: (v: { ok: boolean }) => void;
    const save = vi.fn((_c: string) => new Promise<{ ok: boolean }>((r) => { release = r; }));
    const pending = performSave({ state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch, save });
    expect(selectSaveStatus(s.get())).toBe('saving');
    expect(save).toHaveBeenCalledWith('base1');
    // AI insertion goes through the same edit event
    applyEdit(false, 'chapter:w:c1', spliceAtSelection(s.get().currentContent, 'AI', 5, 5), s.dispatch);
    release({ ok: true });
    await pending;
    expect(s.get().currentContent).toBe('base1AI');
    expect(s.get().savedContent).toBe('base1');
    expect(selectSaveStatus(s.get())).toBe('dirty');
  });

  it('failed save keeps edits and reports failure via callback', async () => {
    const s = store();
    applyEdit(false, 'chapter:w:c1', 'edited', s.dispatch);
    const onFailure = vi.fn();
    await performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch,
      save: async () => ({ ok: false, error: '실패' }), onFailure,
    });
    expect(onFailure).toHaveBeenCalledWith('실패');
    expect(s.get().currentContent).toBe('edited');
    expect(selectSaveStatus(s.get())).toBe('failed');
    expect(PAGE).toMatch(/toast\.error\(message\)/);
  });

  it('a late answer for another chapter does not reach the new draft', async () => {
    const s = store();
    applyEdit(false, 'chapter:w:c1', 'c1 edit', s.dispatch);
    let release!: (v: { ok: boolean }) => void;
    const pending = performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch,
      save: () => new Promise((r) => { release = r; }),
    });
    s.dispatch({ type: 'load', resourceKey: 'chapter:w:c2', content: 'c2' });
    release({ ok: true });
    await pending;
    expect(s.get()).toMatchObject({ resourceKey: 'chapter:w:c2', currentContent: 'c2', savedContent: 'c2' });
    applyEdit(false, 'chapter:w:c1', 'leak', s.dispatch);
    expect(s.get().currentContent).toBe('c2');
  });

  it('page guards fetch with cancelled flag and keys load by chapter resource', () => {
    expect(PAGE).toMatch(/let cancelled = false/);
    expect(PAGE).toMatch(/if \(cancelled\) return/);
    expect(PAGE).toMatch(/loadState\?\.key === resourceKey/);
    expect(PAGE).toMatch(/activeKeyRef\.current !== key/);
  });
});

describe('chapter publish flow is unchanged', () => {
  it('publish/unpublish use the existing actions with the fixed price tiers', () => {
    expect([...PRICE_TIERS]).toEqual([10, 30, 50, 100]);
    expect(PAGE).toMatch(/publishChapterAction\(workId, chapterId, isPaid \? \(priceTier \?\? PRICE_TIERS\[0\]\) : null\)/);
    expect(PAGE).toMatch(/unpublishChapterAction\(workId, chapterId\)/);
    expect(PAGE).toMatch(/<ReviewRequestPanel workId=\{workId\} chapterId=\{chapterId\}/);
    expect(PAGE).toMatch(/발행을 취소할까요\?/);
    expect(PAGE).toMatch(/무료/);
    expect(PAGE).toMatch(/유료/);
  });
});

describe('chapter editor: collapse keeps editor and AI mounted', () => {
  it('toggle keeps descriptors by reference with no load/reset/unregister commands', () => {
    const meta = { resourceKey: 'chapter:w:c1', hasAi: true };
    const open = presentPanels(INITIAL_PANEL_STATE, meta);
    let panels = panelReducer(INITIAL_PANEL_STATE, { type: 'toggle', side: 'right' });
    panels = panelReducer(panels, { type: 'toggle', side: 'left' });
    const collapsed = presentPanels(panels, meta);
    expect(collapsed.editor).toBe(open.editor);
    expect(collapsed.ai).toBe(open.ai);
    expect(slotCommands(open, collapsed)).toEqual([]);
  });

  it('page uses fixed StudioEditorPanels slots and never reads collapse state', () => {
    expect(PAGE).toMatch(/<StudioEditorPanels/);
    expect(PAGE).toMatch(/<AiPanel\s+key=\{chapterId\}/);
    expect(PAGE).not.toMatch(/useStudioPanels|leftCollapsed|rightCollapsed/);
    expect(PAGE).toMatch(/\[workId, chapterId, resourceKey\]/);
  });
});

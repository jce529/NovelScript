import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createEditorState,
  editorReducer,
  selectSaveStatus,
  type EditorAction,
  type EditorState,
} from '@/lib/studio/editor-state';
import { applyEdit, performSave, spliceAtSelection } from '@/lib/studio/editor-session';
import { INITIAL_PANEL_STATE, panelReducer, presentPanels, slotCommands } from '@/lib/studio/panel-controller';

/** Tiny store so reducer events from the real helpers are applied in order. */
function store(initial?: EditorState) {
  let state = initial ?? createEditorState();
  const dispatch = vi.fn((action: EditorAction) => {
    state = editorReducer(state, action);
  });
  return { dispatch, get: () => state };
}

function loaded(resourceKey: string, content: string) {
  const s = store();
  s.dispatch({ type: 'load', resourceKey, content });
  s.dispatch.mockClear();
  return s;
}

const PAGE = readFileSync('app/studio/[workId]/kb/[nodeId]/page.tsx', 'utf8');

describe('KB editor: default template is read-only', () => {
  it('typing, AI insert and save never mutate or call the save action', async () => {
    const s = loaded('kb:w:t', 'seed');
    const save = vi.fn(async () => ({ ok: true }));
    expect(applyEdit(true, 'kb:w:t', 'typed', s.dispatch)).toBe(false);
    expect(applyEdit(true, 'kb:w:t', spliceAtSelection('seed', 'AI', 0, 0), s.dispatch)).toBe(false);
    const outcome = await performSave({
      state: s.get(), readOnly: true, requestId: 'r1', dispatch: s.dispatch, save,
    });
    expect(outcome).toBe('skipped');
    expect(save).not.toHaveBeenCalled();
    expect(s.dispatch).not.toHaveBeenCalled();
    expect(s.get().currentContent).toBe('seed');
    expect(selectSaveStatus(s.get())).toBe('saved');
  });

  it('page does not fetch AI context or mount AiPanel for the default template', () => {
    expect(PAGE).toMatch(/result\.mode !== 'default_template'/);
    expect(PAGE).toMatch(/loaded && !readOnly && ai\?\.defaultProviderModel/);
    expect(PAGE).toMatch(/readOnly=\{readOnly\}/);
  });
});

describe('KB editor: my template / document save', () => {
  it('save success clears dirty with the submitted snapshot and toasts through callbacks', async () => {
    const s = loaded('kb:w:n', 'a');
    applyEdit(false, 'kb:w:n', 'ab', s.dispatch);
    expect(selectSaveStatus(s.get())).toBe('dirty');
    const save = vi.fn(async (_c: string) => ({ ok: true }));
    const onSuccess = vi.fn();
    const outcome = await performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch, save, onSuccess,
    });
    expect(outcome).toBe('saved');
    expect(save).toHaveBeenCalledWith('ab');
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(selectSaveStatus(s.get())).toBe('saved');
  });

  it('save failure keeps the body and shows failed', async () => {
    const s = loaded('kb:w:n', 'a');
    applyEdit(false, 'kb:w:n', 'draft', s.dispatch);
    const onFailure = vi.fn();
    const outcome = await performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch,
      save: async () => ({ ok: false, error: '오류' }), onFailure,
    });
    expect(outcome).toBe('failed');
    expect(onFailure).toHaveBeenCalledWith('오류');
    expect(s.get().currentContent).toBe('draft');
    expect(selectSaveStatus(s.get())).toBe('failed');
  });

  it('a thrown action is a failure, not an unhandled rejection', async () => {
    const s = loaded('kb:w:n', 'a');
    applyEdit(false, 'kb:w:n', 'b', s.dispatch);
    const outcome = await performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch,
      save: async () => { throw new Error('network'); },
    });
    expect(outcome).toBe('failed');
    expect(s.get().currentContent).toBe('b');
  });

  it('typing during an in-flight save stays dirty after success', async () => {
    const s = loaded('kb:w:n', 'a');
    applyEdit(false, 'kb:w:n', 'ab', s.dispatch);
    let release!: (v: { ok: boolean }) => void;
    const pending = performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch,
      save: () => new Promise((resolve) => { release = resolve; }),
    });
    expect(selectSaveStatus(s.get())).toBe('saving');
    applyEdit(false, 'kb:w:n', 'abc', s.dispatch);
    release({ ok: true });
    await pending;
    expect(selectSaveStatus(s.get())).toBe('dirty');
    expect(s.get().currentContent).toBe('abc');
  });

  it('does not call the action when nothing changed or a save is pending', async () => {
    const s = loaded('kb:w:n', 'a');
    const save = vi.fn(async () => ({ ok: true }));
    expect(await performSave({ state: s.get(), readOnly: false, requestId: 'r', dispatch: s.dispatch, save })).toBe('skipped');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('KB editor: node switch', () => {
  it('a late save/answer for the previous node does not touch the new node content', async () => {
    const s = loaded('kb:w:old', 'old');
    applyEdit(false, 'kb:w:old', 'old!', s.dispatch);
    let release!: (v: { ok: boolean }) => void;
    const pending = performSave({
      state: s.get(), readOnly: false, requestId: 'r1', dispatch: s.dispatch,
      save: () => new Promise((resolve) => { release = resolve; }),
    });
    s.dispatch({ type: 'load', resourceKey: 'kb:w:new', content: 'new' });
    release({ ok: true });
    await pending;
    expect(s.get().resourceKey).toBe('kb:w:new');
    expect(s.get().currentContent).toBe('new');
    expect(s.get().savedContent).toBe('new');
    expect(selectSaveStatus(s.get())).toBe('saved');
  });

  it('a stale edit tagged with the old resource is dropped', () => {
    const s = loaded('kb:w:new', 'new');
    applyEdit(false, 'kb:w:old', 'leak', s.dispatch);
    expect(s.get().currentContent).toBe('new');
  });

  it('page guards the fetch with a cancelled flag and keys the load by resource', () => {
    expect(PAGE).toMatch(/let cancelled = false/);
    expect(PAGE).toMatch(/if \(cancelled\) return/);
    expect(PAGE).toMatch(/getNodeContentAction\(nodeId, workId\)/);
    expect(PAGE).toMatch(/loadState\?\.key === resourceKey/);
  });

  it('load failure renders an error screen', () => {
    expect(PAGE).toMatch(/role="alert"/);
    expect(PAGE).toMatch(/status: 'error'/);
  });
});

describe('KB editor: collapse keeps editor and AI mounted', () => {
  it('toggling panels keeps descriptors and emits no load/reset/unregister commands', () => {
    const meta = { resourceKey: 'kb:w:n', hasAi: true };
    const open = presentPanels(INITIAL_PANEL_STATE, meta);
    let panels = panelReducer(INITIAL_PANEL_STATE, { type: 'toggle', side: 'left' });
    panels = panelReducer(panels, { type: 'toggle', side: 'right' });
    const collapsed = presentPanels(panels, meta);
    expect(collapsed.editor).toBe(open.editor);
    expect(collapsed.ai).toBe(open.ai);
    expect(slotCommands(open, collapsed)).toEqual([]);
  });

  it('page renders editor and AI through fixed StudioEditorPanels slots, key preserved, no collapse-driven load', () => {
    expect(PAGE).toMatch(/<StudioEditorPanels/);
    expect(PAGE).toMatch(/<AiPanel\s+key=\{nodeId\}/);
    expect(PAGE).not.toMatch(/useStudioPanels/);
    expect(PAGE).not.toMatch(/leftCollapsed|rightCollapsed/);
    // load effect depends only on the resource identity
    expect(PAGE).toMatch(/\[workId, nodeId, resourceKey\]/);
  });
});

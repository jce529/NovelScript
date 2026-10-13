import { describe, expect, it } from 'vitest';
import {
  createEditorState,
  editorReducer,
  saveStatusCopy,
  selectSaveStatus,
  type EditorAction,
  type EditorState,
} from '@/lib/studio/editor-state';

function run(actions: EditorAction[], from?: EditorState): EditorState {
  return actions.reduce(editorReducer, from ?? createEditorState());
}

const load = (key = 'chapter:a', content = 'hello'): EditorAction => ({
  type: 'load',
  resourceKey: key,
  content,
});

describe('editor save-state reducer', () => {
  it('loaded content is 저장됨, edit makes 저장 안 됨, reverting edit is clean again', () => {
    let s = run([load()]);
    expect(selectSaveStatus(s)).toBe('saved');
    s = run([{ type: 'edit', content: 'hello!' }], s);
    expect(selectSaveStatus(s)).toBe('dirty');
    s = run([{ type: 'edit', content: 'hello' }], s);
    expect(selectSaveStatus(s)).toBe('saved');
  });

  it('save-start -> saving, matching success -> saved', () => {
    let s = run([load(), { type: 'edit', content: 'v2' }, { type: 'save-start', requestId: 'r1' }]);
    expect(selectSaveStatus(s)).toBe('saving');
    expect(s.submittedContent).toBe('v2');
    s = run([{ type: 'save-success', resourceKey: 'chapter:a', requestId: 'r1' }], s);
    expect(selectSaveStatus(s)).toBe('saved');
    expect(s.savedContent).toBe('v2');
    expect(s.pendingRequestId).toBeNull();
  });

  it('edit during an in-flight save stays 저장 안 됨 after success', () => {
    let s = run([
      load(),
      { type: 'edit', content: 'v2' },
      { type: 'save-start', requestId: 'r1' },
      { type: 'edit', content: 'v3' },
    ]);
    expect(selectSaveStatus(s)).toBe('saving');
    s = run([{ type: 'save-success', resourceKey: 'chapter:a', requestId: 'r1' }], s);
    expect(s.savedContent).toBe('v2');
    expect(s.currentContent).toBe('v3');
    expect(selectSaveStatus(s)).toBe('dirty');
  });

  it('failure keeps the typed content, shows 저장 실패, retry follows the new request result', () => {
    let s = run([
      load(),
      { type: 'edit', content: 'v2' },
      { type: 'save-start', requestId: 'r1' },
      { type: 'save-failure', resourceKey: 'chapter:a', requestId: 'r1', error: 'network' },
    ]);
    expect(selectSaveStatus(s)).toBe('failed');
    expect(s.currentContent).toBe('v2');
    expect(s.error).toBe('network');
    s = run([{ type: 'save-start', requestId: 'r2' }], s);
    expect(selectSaveStatus(s)).toBe('saving');
    expect(s.error).toBeNull();
    s = run([{ type: 'save-success', resourceKey: 'chapter:a', requestId: 'r2' }], s);
    expect(selectSaveStatus(s)).toBe('saved');
  });

  it('ignores stale request ids and late results from another resource', () => {
    let s = run([load('chapter:a'), { type: 'edit', content: 'v2' }, { type: 'save-start', requestId: 'r1' }]);
    // stale id
    const stale = run([{ type: 'save-success', resourceKey: 'chapter:a', requestId: 'old' }], s);
    expect(stale).toBe(s);
    // switch resource while r1 is in flight, then r1 answers late
    s = run([load('kb:b', 'other')], s);
    expect(s.pendingRequestId).toBeNull();
    const lateOk = run([{ type: 'save-success', resourceKey: 'chapter:a', requestId: 'r1' }], s);
    expect(lateOk).toBe(s);
    const lateFail = run(
      [{ type: 'save-failure', resourceKey: 'chapter:a', requestId: 'r1', error: 'x' }],
      s
    );
    expect(lateFail).toBe(s);
    expect(selectSaveStatus(s)).toBe('saved');
    expect(s.savedContent).toBe('other');
  });

  it('AI insertion uses the normal edit event and is not a save', () => {
    const s = run([load(), { type: 'edit', content: 'hello + AI text' }]);
    expect(selectSaveStatus(s)).toBe('dirty');
  });

  it('save-start is a no-op when clean or already pending', () => {
    const clean = run([load()]);
    expect(run([{ type: 'save-start', requestId: 'r1' }], clean)).toBe(clean);
    const pending = run([{ type: 'edit', content: 'x' }, { type: 'save-start', requestId: 'r1' }], clean);
    expect(run([{ type: 'save-start', requestId: 'r2' }], pending)).toBe(pending);
  });

  it('edits for a different resource are not applied implicitly (reload required)', () => {
    const s = run([load('chapter:a')]);
    expect(run([{ type: 'edit', content: 'z', resourceKey: 'kb:other' }], s)).toBe(s);
  });

  it('copy: readOnly shows 읽기 전용; pending is the only 저장 중', () => {
    expect(saveStatusCopy('saved')).toBe('저장됨');
    expect(saveStatusCopy('dirty')).toBe('저장 안 됨');
    expect(saveStatusCopy('saving')).toBe('저장 중');
    expect(saveStatusCopy('failed')).toBe('저장 실패');
    expect(saveStatusCopy('saved', true)).toBe('읽기 전용');
    expect(saveStatusCopy('saving', true)).toBe('읽기 전용');
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  createSystemInstructionController, initialSystemInstructionState, systemInstructionReducer, canSaveSystemInstruction,
  SYSTEM_INSTRUCTION_LOAD_FAILED, SYSTEM_INSTRUCTION_SAVE_FAILED,
} from '@/lib/ai/system-instruction-state';
import type { WorkInstructionResult } from '@/lib/ai/work-instructions';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const loads: { workId: string; d: ReturnType<typeof deferred<WorkInstructionResult>> }[] = [];
  const saves: { workId: string; instruction: string; d: ReturnType<typeof deferred<WorkInstructionResult>> }[] = [];
  const load = vi.fn((workId: string) => { const d = deferred<WorkInstructionResult>(); loads.push({ workId, d }); return d.promise; });
  const save = vi.fn((workId: string, instruction: string) => { const d = deferred<WorkInstructionResult>(); saves.push({ workId, instruction, d }); return d.promise; });
  const controller = createSystemInstructionController({ load, save });
  return { controller, loads, saves, load, save };
}

describe('systemInstructionReducer', () => {
  it('starts closed and opening starts a load sequence', () => {
    const s = systemInstructionReducer(initialSystemInstructionState, { type: 'open', workId: 'w1' });
    expect(s).toMatchObject({ status: 'loading', workId: 'w1', draft: '', error: null });
    expect(s.seq).toBeGreaterThan(initialSystemInstructionState.seq);
  });

  it('ignores a load result for a different sequence', () => {
    const s = systemInstructionReducer(initialSystemInstructionState, { type: 'open', workId: 'w1' });
    const stale = systemInstructionReducer(s, { type: 'load_resolved', seq: s.seq - 1, result: { ok: true, instruction: 'old' } });
    expect(stale).toBe(s);
  });

  it('open is a no-op while disabled (beginner)', () => {
    const disabled = systemInstructionReducer(initialSystemInstructionState, { type: 'set_disabled', disabled: true });
    expect(systemInstructionReducer(disabled, { type: 'open', workId: 'w1' }).status).toBe('closed');
  });

  it('canSave only when ready, enabled and within 4000 chars', () => {
    const open = systemInstructionReducer(initialSystemInstructionState, { type: 'open', workId: 'w1' });
    expect(canSaveSystemInstruction(open)).toBe(false);
    const ready = systemInstructionReducer(open, { type: 'load_resolved', seq: open.seq, result: { ok: true, instruction: '' } });
    expect(canSaveSystemInstruction(ready)).toBe(true);
    expect(canSaveSystemInstruction(systemInstructionReducer(ready, { type: 'edit', value: 'x'.repeat(4001) }))).toBe(false);
  });
});

describe('createSystemInstructionController', () => {
  it('loads the stored extra instruction into the draft', async () => {
    const { controller, loads, load } = setup();
    controller.open('w1');
    expect(load).toHaveBeenCalledWith('w1');
    expect(controller.getState().status).toBe('loading');
    loads[0].d.resolve({ ok: true, instruction: '저장된 지시' });
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'ready', draft: '저장된 지시' });
  });

  it('ignores a stale response after a workId change', async () => {
    const { controller, loads } = setup();
    controller.open('w1');
    controller.open('w2');
    loads[1].d.resolve({ ok: true, instruction: 'w2 지시' });
    await flush();
    loads[0].d.resolve({ ok: true, instruction: 'w1 지시' });
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'ready', workId: 'w2', draft: 'w2 지시' });
  });

  it('close discards the draft and ignores the pending load; reopening reads the server value again', async () => {
    const { controller, loads, saves } = setup();
    controller.open('w1');
    loads[0].d.resolve({ ok: true, instruction: '서버값' });
    await flush();
    controller.edit('수정 중인 초안');
    controller.close();
    expect(controller.getState().status).toBe('closed');
    controller.open('w1');
    controller.close();
    loads[1].d.resolve({ ok: true, instruction: '늦은 응답' });
    await flush();
    expect(controller.getState().status).toBe('closed');
    controller.open('w1');
    expect(controller.getState().draft).toBe('');
    loads[2].d.resolve({ ok: true, instruction: '서버값' });
    await flush();
    expect(controller.getState().draft).toBe('서버값');
    expect(saves).toHaveLength(0);
  });

  it('ignores every response after dispose (unmount)', async () => {
    const { controller, loads } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.open('w1');
    listener.mockClear();
    controller.dispose();
    loads[0].d.resolve({ ok: true, instruction: 'x' });
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  it('load failure blocks saving, shows an error and only a successful retry resets the draft', async () => {
    const { controller, loads, save } = setup();
    controller.open('w1');
    loads[0].d.resolve({ ok: false, error: '로그인이 필요해요.' });
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'load_error', error: '로그인이 필요해요.' });
    expect(canSaveSystemInstruction(controller.getState())).toBe(false);
    controller.edit('무시돼야 함');
    expect(await controller.save()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    controller.retry();
    loads[1].d.reject(new Error('network'));
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'load_error', error: SYSTEM_INSTRUCTION_LOAD_FAILED });
    controller.retry();
    loads[2].d.resolve({ ok: true, instruction: '복구된 값' });
    await flush();
    expect(controller.getState()).toMatchObject({ status: 'ready', draft: '복구된 값', error: null });
  });

  it('save failure keeps the draft open with an error; only success reports closed', async () => {
    const { controller, loads, saves } = setup();
    controller.open('w1');
    loads[0].d.resolve({ ok: true, instruction: '' });
    await flush();
    controller.edit('대사를 늘려줘');
    const first = controller.save();
    expect(controller.getState().status).toBe('saving');
    expect(saves[0]).toMatchObject({ workId: 'w1', instruction: '대사를 늘려줘' });
    saves[0].d.resolve({ ok: false, error: '추가 지시는 4000자 이하로 입력해주세요.' });
    expect(await first).toBe(false);
    expect(controller.getState()).toMatchObject({ status: 'ready', draft: '대사를 늘려줘', error: '추가 지시는 4000자 이하로 입력해주세요.' });
    const thrown = controller.save();
    saves[1].d.reject(new Error('boom'));
    expect(await thrown).toBe(false);
    expect(controller.getState()).toMatchObject({ status: 'ready', error: SYSTEM_INSTRUCTION_SAVE_FAILED, draft: '대사를 늘려줘' });
    const second = controller.save();
    saves[2].d.resolve({ ok: true, instruction: '대사를 늘려줘' });
    expect(await second).toBe(true);
    expect(controller.getState().status).toBe('closed');
  });

  it('a save that resolves after close is ignored and reports failure', async () => {
    const { controller, loads, saves } = setup();
    controller.open('w1');
    loads[0].d.resolve({ ok: true, instruction: '' });
    await flush();
    controller.edit('x');
    const pending = controller.save();
    controller.close();
    saves[0].d.resolve({ ok: true, instruction: 'x' });
    expect(await pending).toBe(false);
    expect(controller.getState().status).toBe('closed');
  });

  it('switching to beginner closes the modal, invalidates pending work and blocks open/save', async () => {
    const { controller, loads, saves, load, save } = setup();
    controller.open('w1');
    loads[0].d.resolve({ ok: true, instruction: '보존' });
    await flush();
    controller.edit('미저장');
    const pending = controller.save();
    controller.setDisabled(true);
    expect(controller.getState().status).toBe('closed');
    saves[0].d.resolve({ ok: true, instruction: '미저장' });
    expect(await pending).toBe(false);
    controller.open('w1');
    expect(controller.getState().status).toBe('closed');
    expect(load).toHaveBeenCalledTimes(1);
    expect(await controller.save()).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    controller.setDisabled(false);
    controller.open('w1');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

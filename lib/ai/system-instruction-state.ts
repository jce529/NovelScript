/**
 * 04-10: client-safe state machine for the per-work "작품 시스템 지시" modal.
 *
 * The reducer is pure; the controller wires it to injected load/save callbacks (the real modal
 * passes loadWorkSystemInstructionAction / saveWorkSystemInstructionAction). Every async request
 * is tagged with a sequence number, so a response that arrives after a close, a workId change,
 * a beginner switch or an unmount is ignored instead of overwriting newer state.
 */
import type { WorkInstructionResult } from '@/lib/ai/work-instructions';
import { CUSTOM_INSTRUCTION_MAX_LENGTH } from '@/lib/ai/regenerate-contract';

/** Same 4000-char limit as the stored work instruction (WORK_INSTRUCTION_MAX_LENGTH, DB CHECK). */
export const SYSTEM_INSTRUCTION_MAX_LENGTH = CUSTOM_INSTRUCTION_MAX_LENGTH;
export const SYSTEM_INSTRUCTION_LOAD_FAILED = '작품 시스템 지시를 불러오지 못했어요. 다시 시도해주세요.';
export const SYSTEM_INSTRUCTION_SAVE_FAILED = '작품 시스템 지시를 저장하지 못했어요. 다시 시도해주세요.';

export type SystemInstructionStatus = 'closed' | 'loading' | 'ready' | 'load_error' | 'saving';

export interface SystemInstructionState {
  status: SystemInstructionStatus;
  workId: string | null;
  /** Bumped by every transition that starts or invalidates a request. */
  seq: number;
  draft: string;
  error: string | null;
  /** Beginner preset: the modal can neither open nor save. */
  disabled: boolean;
}

export type SystemInstructionEvent =
  | { type: 'open'; workId: string }
  | { type: 'retry' }
  | { type: 'load_resolved'; seq: number; result: WorkInstructionResult }
  | { type: 'edit'; value: string }
  | { type: 'save_started' }
  | { type: 'save_resolved'; seq: number; result: WorkInstructionResult }
  | { type: 'close' }
  | { type: 'set_disabled'; disabled: boolean };

export const initialSystemInstructionState: SystemInstructionState = Object.freeze({
  status: 'closed', workId: null, seq: 0, draft: '', error: null, disabled: false,
});

export function systemInstructionReducer(state: SystemInstructionState, event: SystemInstructionEvent): SystemInstructionState {
  switch (event.type) {
    case 'open':
      if (state.disabled) return state;
      return { ...state, status: 'loading', workId: event.workId, seq: state.seq + 1, draft: '', error: null };
    case 'retry':
      if (state.status !== 'load_error' || state.disabled) return state;
      return { ...state, status: 'loading', seq: state.seq + 1, error: null };
    case 'load_resolved':
      if (state.status !== 'loading' || event.seq !== state.seq) return state;
      return event.result.ok
        ? { ...state, status: 'ready', draft: event.result.instruction, error: null }
        : { ...state, status: 'load_error', draft: '', error: event.result.error || SYSTEM_INSTRUCTION_LOAD_FAILED };
    case 'edit':
      if (state.status !== 'ready') return state;
      return { ...state, draft: event.value };
    case 'save_started':
      if (!canSaveSystemInstruction(state)) return state;
      return { ...state, status: 'saving', seq: state.seq + 1, error: null };
    case 'save_resolved':
      if (state.status !== 'saving' || event.seq !== state.seq) return state;
      return event.result.ok
        ? { ...state, status: 'closed', draft: '', error: null }
        : { ...state, status: 'ready', error: event.result.error || SYSTEM_INSTRUCTION_SAVE_FAILED };
    case 'close':
      if (state.status === 'closed') return state;
      return { ...state, status: 'closed', seq: state.seq + 1, draft: '', error: null };
    case 'set_disabled':
      if (event.disabled === state.disabled) return state;
      return event.disabled
        ? { ...state, disabled: true, status: 'closed', seq: state.seq + 1, draft: '', error: null }
        : { ...state, disabled: false };
  }
}

export function canSaveSystemInstruction(state: SystemInstructionState): boolean {
  return state.status === 'ready' && !state.disabled && state.workId !== null && state.draft.length <= SYSTEM_INSTRUCTION_MAX_LENGTH;
}

export interface SystemInstructionDeps {
  load: (workId: string) => Promise<WorkInstructionResult>;
  save: (workId: string, instruction: string) => Promise<WorkInstructionResult>;
}

export interface SystemInstructionController {
  getState(): SystemInstructionState;
  subscribe(listener: () => void): () => void;
  open(workId: string): void;
  retry(): void;
  edit(value: string): void;
  /** Resolves true only when THIS save was accepted and succeeded (the modal may close). */
  save(): Promise<boolean>;
  close(): void;
  setDisabled(disabled: boolean): void;
  /** Unmount: pending work is invalidated, every later response is ignored and no listener is notified. */
  dispose(): void;
  /** Mount: (re)activates the controller and returns dispose — safe for StrictMode effect replays. */
  attach(): () => void;
}

export function createSystemInstructionController({ load, save }: SystemInstructionDeps): SystemInstructionController {
  let state = initialSystemInstructionState;
  let disposed = false;
  const listeners = new Set<() => void>();

  function dispatch(event: SystemInstructionEvent) {
    if (disposed) return;
    const next = systemInstructionReducer(state, event);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  }

  function startLoad() {
    if (state.status !== 'loading' || state.workId === null) return;
    const { seq, workId } = state;
    let request: Promise<WorkInstructionResult>;
    try {
      request = load(workId);
    } catch {
      request = Promise.resolve({ ok: false, error: SYSTEM_INSTRUCTION_LOAD_FAILED });
    }
    request
      .catch((): WorkInstructionResult => ({ ok: false, error: SYSTEM_INSTRUCTION_LOAD_FAILED }))
      .then((result) => dispatch({ type: 'load_resolved', seq, result }));
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    open(workId) {
      dispatch({ type: 'open', workId });
      startLoad();
    },
    retry() {
      dispatch({ type: 'retry' });
      startLoad();
    },
    edit(value) { dispatch({ type: 'edit', value }); },
    async save() {
      if (!canSaveSystemInstruction(state)) return false;
      dispatch({ type: 'save_started' });
      const { seq, workId, draft } = state;
      if (state.status !== 'saving' || workId === null) return false;
      let result: WorkInstructionResult;
      try {
        result = await save(workId, draft);
      } catch {
        result = { ok: false, error: SYSTEM_INSTRUCTION_SAVE_FAILED };
      }
      if (disposed || state.status !== 'saving' || state.seq !== seq) return false;
      dispatch({ type: 'save_resolved', seq, result });
      return result.ok;
    },
    close() { dispatch({ type: 'close' }); },
    setDisabled(disabled) { dispatch({ type: 'set_disabled', disabled }); },
    dispose,
    attach() {
      disposed = false;
      return dispose;
    },
  };

  function dispose() {
    // Silently invalidate in-flight requests (seq bump) so a later re-attach cannot accept them.
    state = systemInstructionReducer(state, { type: 'close' });
    disposed = true;
  }
}

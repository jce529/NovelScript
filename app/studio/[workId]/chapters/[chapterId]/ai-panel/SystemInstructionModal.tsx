'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { BASELINE_SYSTEM_PROMPT } from '@/lib/ai/prompt';
import {
  canSaveSystemInstruction, createSystemInstructionController, SYSTEM_INSTRUCTION_MAX_LENGTH,
} from '@/lib/ai/system-instruction-state';
import { loadWorkSystemInstructionAction, saveWorkSystemInstructionAction } from '../../../ai-settings-actions';

export const SYSTEM_INSTRUCTION_MODAL_TITLE = '작품 시스템 지시';

export interface SystemInstructionModalProps {
  workId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Beginner preset: closes the modal, blocks saving and invalidates pending load/save. */
  disabled: boolean;
}

/**
 * 04-10 (Reopen D-14): the default system instruction is always prepended and read-only; the
 * writer edits only the per-work extra instruction that follows it. All async state lives in the
 * tested controller (lib/ai/system-instruction-state.ts) — this component only renders it.
 */
export function SystemInstructionModal({ workId, open, onOpenChange, disabled }: SystemInstructionModalProps) {
  const [controller] = useState(() => createSystemInstructionController({
    load: (id) => loadWorkSystemInstructionAction(id),
    save: (id, instruction) => saveWorkSystemInstructionAction(id, instruction),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);

  useEffect(() => controller.attach(), [controller]);

  useEffect(() => {
    controller.setDisabled(disabled);
    // Every (re)open and every workId change re-reads the server value; close discards the draft.
    if (open && !disabled) controller.open(workId);
    else controller.close();
  }, [controller, open, workId, disabled]);

  const saving = state.status === 'saving';

  function requestClose() {
    if (saving) return; // a running save is either confirmed (closes) or fails (stays open)
    onOpenChange(false);
  }

  async function handleSave() {
    if (await controller.save()) onOpenChange(false);
  }

  return (
    <Dialog open={open && !disabled} onOpenChange={(next) => { if (!next) requestClose(); }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{SYSTEM_INSTRUCTION_MODAL_TITLE}</DialogTitle>
          <DialogDescription>
            기본 지시는 항상 맨 앞에 고정돼요. 여기서는 이 작품에만 덧붙는 추가 지시를 편집해요. 회차와 설정 문서 편집기에서 함께 쓰이고, 중급자·자유형 프리셋에 적용돼요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <label htmlFor="ai-baseline-instruction" className="text-xs text-muted-foreground">기본 지시 (읽기 전용)</label>
          <Textarea
            id="ai-baseline-instruction"
            value={BASELINE_SYSTEM_PROMPT}
            readOnly
            aria-readonly="true"
            rows={5}
            className="max-h-40 overflow-y-auto bg-muted text-xs"
          />
        </div>

        {state.status === 'loading' && (
          <p role="status" className="text-sm text-muted-foreground">추가 지시를 불러오는 중...</p>
        )}

        {state.status === 'load_error' && (
          <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-muted p-3 text-sm">
            <span className="flex gap-2"><AlertCircle className="size-4 shrink-0" />{state.error}</span>
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => controller.retry()}>다시 불러오기</Button>
          </div>
        )}

        {(state.status === 'ready' || saving) && (
          <div className="flex flex-col gap-1">
            <label htmlFor="ai-work-instruction" className="text-xs text-muted-foreground">추가 지시</label>
            <Textarea
              id="ai-work-instruction"
              value={state.draft}
              maxLength={SYSTEM_INSTRUCTION_MAX_LENGTH}
              placeholder="이 작품에서 AI가 항상 지켜야 할 내용을 적어주세요."
              disabled={saving}
              onChange={(event) => controller.edit(event.target.value)}
              rows={6}
            />
            <span className="self-end text-xs text-muted-foreground">{state.draft.length.toLocaleString()} / {SYSTEM_INSTRUCTION_MAX_LENGTH.toLocaleString()}자</span>
            {state.error && (
              <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-muted p-3 text-sm"><AlertCircle className="size-4 shrink-0" />{state.error}</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>취소</Button>
          <Button type="button" disabled={!canSaveSystemInstruction(state)} onClick={() => void handleSave()}>
            {saving ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

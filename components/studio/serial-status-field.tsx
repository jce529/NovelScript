'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  updateWorkSerialStatusAction,
  type SerialStatus,
  type UpdateSerialStatusResult,
} from '@/app/studio/[workId]/settings/actions';

export const SERIAL_STATUS_COPY = {
  legend: '연재 상태',
  description:
    '완결로 바꾸면 독자 연재 목록의 완결 탭에 나오고 작품 카드에 완결 라벨이 붙어요. 언제든 연재중으로 되돌릴 수 있어요.',
  options: {
    ongoing: '연재중',
    completed: '완결',
  },
  saveSuccess: '연재 상태를 저장했어요.',
  saveError: '연재 상태를 저장하지 못했어요. 다시 시도해 주세요.',
} as const;

export const SERIAL_STATUS_OPTIONS: ReadonlyArray<{
  value: SerialStatus;
  label: (typeof SERIAL_STATUS_COPY.options)[SerialStatus];
}> = [
  { value: 'ongoing', label: SERIAL_STATUS_COPY.options.ongoing },
  { value: 'completed', label: SERIAL_STATUS_COPY.options.completed },
];

export type SerialStatusSaveFn = (
  workId: string,
  nextStatus: SerialStatus,
) => Promise<UpdateSerialStatusResult>;

export interface SerialStatusFieldProps {
  workId: string;
  initialStatus?: SerialStatus;
  saveAction?: SerialStatusSaveFn;
  /** Optional external pending flag (used for deterministic static rendering assertions). */
  pending?: boolean;
}

export interface SerialStatusControllerState {
  status: SerialStatus;
  saving: boolean;
}

/**
 * Non-optimistic state transition controller for `SerialStatusField` (UI-SPEC §6):
 * 1. Click sets `saving = true` (both segment buttons disabled) while keeping `status` unchanged.
 * 2. On `{ ok: true }`, updates `status` to the saved status and triggers `toast.success`.
 * 3. On `{ ok: false }` or thrown error, keeps the previous `status` and triggers `toast.error`.
 * 4. Clears `saving = false` so the author can retry immediately.
 */
export function createSerialStatusController({
  workId,
  initialStatus = 'ongoing',
  saveAction = (id, nextStatus) => updateWorkSerialStatusAction(id, nextStatus),
  notify = toast,
  onChange,
}: {
  workId: string;
  initialStatus?: SerialStatus;
  saveAction?: SerialStatusSaveFn;
  notify?: Pick<typeof toast, 'success' | 'error'>;
  onChange?: (state: SerialStatusControllerState) => void;
}) {
  let state: SerialStatusControllerState = {
    status: initialStatus === 'completed' ? 'completed' : 'ongoing',
    saving: false,
  };

  const publish = (next: SerialStatusControllerState) => {
    state = next;
    onChange?.(state);
  };

  return {
    getState: () => state,
    async select(nextStatus: SerialStatus): Promise<SerialStatusControllerState> {
      if (state.saving) return state;
      const previousStatus = state.status;
      publish({ status: previousStatus, saving: true });

      try {
        const result = await saveAction(workId, nextStatus);
        if (result?.ok) {
          const resolvedStatus = result.serialStatus ?? nextStatus;
          publish({ status: resolvedStatus, saving: false });
          notify.success(SERIAL_STATUS_COPY.saveSuccess);
          return state;
        }
        publish({ status: previousStatus, saving: false });
        notify.error(SERIAL_STATUS_COPY.saveError);
        return state;
      } catch {
        publish({ status: previousStatus, saving: false });
        notify.error(SERIAL_STATUS_COPY.saveError);
        return state;
      }
    },
  };
}

const focusRingClass =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function SerialStatusField({
  workId,
  initialStatus = 'ongoing',
  saveAction = (id, nextStatus) => updateWorkSerialStatusAction(id, nextStatus),
  pending = false,
}: SerialStatusFieldProps) {
  const [status, setStatus] = useState<SerialStatus>(
    initialStatus === 'completed' ? 'completed' : 'ongoing',
  );
  const [saving, setSaving] = useState(false);

  const isDisabled = saving || pending;
  const descriptionId = `serial-status-description-${workId}`;

  async function handleSelect(nextStatus: SerialStatus) {
    if (isDisabled) return;
    const previousStatus = status;
    setSaving(true);
    try {
      const result = await saveAction(workId, nextStatus);
      if (result?.ok) {
        setStatus(result.serialStatus ?? nextStatus);
        toast.success(SERIAL_STATUS_COPY.saveSuccess);
      } else {
        setStatus(previousStatus);
        toast.error(SERIAL_STATUS_COPY.saveError);
      }
    } catch {
      setStatus(previousStatus);
      toast.error(SERIAL_STATUS_COPY.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset
      aria-describedby={descriptionId}
      className="min-w-0 rounded-xl border bg-card p-4"
    >
      <legend className="px-1 text-sm font-semibold leading-[1.2]">
        {SERIAL_STATUS_COPY.legend}
      </legend>
      <p
        id={descriptionId}
        className="mt-1 text-xs font-normal leading-[1.5] text-muted-foreground"
      >
        {SERIAL_STATUS_COPY.description}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {SERIAL_STATUS_OPTIONS.map((option) => {
          const selected = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              aria-describedby={descriptionId}
              disabled={isDisabled}
              onClick={() => {
                void handleSelect(option.value);
              }}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold leading-[1.5] ${focusRingClass} disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-foreground hover:bg-muted'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

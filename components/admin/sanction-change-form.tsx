'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { adjustUserSanctionAction } from '@/app/admin/actions';
import {
  DurationPresetPicker,
  PAST_EXPIRY_MESSAGE,
  StatusMessage,
  describeFailure,
} from '@/components/admin/moderation-form';
import { LocalTime } from '@/components/admin/report-queue';
import { suspensionPresetEndsAt, type SanctionDurationDays } from '@/lib/admin/sanction-presets';
import type { AdminResult, EffectiveSanction } from '@/lib/admin/types';

/*
 * Current-sanction adjustment (ADMIN-03, Reopen 2026-10-12: 제재 이력 탭의 현재 제재 행에서
 * 해제·기간 변경). Rendered only for an active sanction and only from the history tab; report
 * detail pages never adjust sanctions. The user id and the row's expectedSeq are props of this
 * component alone. Inputs survive failures; the retry key survives retries of the same input
 * and is replaced on any edit or success.
 */

export type SanctionChangeMode = 'lift' | 'change_duration';

export interface SanctionChangeFormProps {
  userId: string;
  userName: string;
  current: EffectiveSanction;
  expectedSeq: string;
}

const REASON_REQUIRED = '조치 사유를 입력해 주세요.';
const EXPIRY_REQUIRED = '정지 기간을 선택해 주세요.';

type Field = 'reason' | 'publicReason' | 'endsAt';
type FieldErrors = Partial<Record<Field, string>>;
type FormStatus = ReturnType<typeof describeFailure> | { kind: 'idle' };

const FIELD_IDS: Record<Field, string> = {
  reason: 'sanction-change-reason',
  publicReason: 'sanction-change-reason-public',
  endsAt: 'sanction-change-ends-at',
};

const SERVER_FIELD_MESSAGES: Record<string, string> = {
  [REASON_REQUIRED]: REASON_REQUIRED,
  expiry_required: EXPIRY_REQUIRED,
  expiry_in_past: PAST_EXPIRY_MESSAGE,
  expiry_not_allowed: '이 조치에는 종료 시각을 지정할 수 없습니다.',
};

/** Client-side mirror of the server rules; the server remains authoritative. */
export function validateSanctionChange(input: {
  mode: SanctionChangeMode;
  endsAt: string | null;
  reason: string;
  publicReason: string;
  now: number;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!input.reason.trim()) errors.reason = REASON_REQUIRED;
  if (!input.publicReason.trim()) errors.publicReason = REASON_REQUIRED;
  if (input.mode === 'change_duration') {
    if (!input.endsAt) errors.endsAt = EXPIRY_REQUIRED;
    else if (Date.parse(input.endsAt) <= input.now) errors.endsAt = PAST_EXPIRY_MESSAGE;
  }
  return errors;
}

/** Lift always sends endsAt null; a duration change sends the captured preset instant. */
export function buildSanctionAdjustInput(
  props: Pick<SanctionChangeFormProps, 'userId' | 'expectedSeq'>,
  input: { mode: SanctionChangeMode; endsAt: string | null; reason: string; publicReason: string },
  idempotencyKey: string
) {
  return {
    idempotencyKey,
    userId: props.userId,
    expectedSeq: props.expectedSeq,
    operation: input.mode,
    reason: input.reason.trim(),
    publicReason: input.publicReason.trim(),
    endsAt: input.mode === 'lift' ? null : input.endsAt,
  };
}

function mapServerFieldErrors(fieldErrors: Record<string, string> | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const field of ['reason', 'publicReason', 'endsAt'] as const) {
    const message = fieldErrors?.[field];
    if (message) out[field] = SERVER_FIELD_MESSAGES[message] ?? '입력 내용을 확인해 주세요.';
  }
  return out;
}

function CurrentExpiry({ current }: { current: EffectiveSanction }) {
  if (current.kind === 'permanent_suspension') return <span>영구 정지</span>;
  return current.sanctionedUntil ? <LocalTime value={current.sanctionedUntil} withZone /> : <span>-</span>;
}

function ReasonInput({
  field,
  label,
  hint,
  value,
  error,
  disabled,
  onChange,
}: {
  field: Exclude<Field, 'endsAt'>;
  label: string;
  hint: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = FIELD_IDS[field];
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        <span className="text-destructive"> (필수)</span>
      </Label>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        {hint}
      </p>
      <Textarea
        id={id}
        value={value}
        rows={3}
        maxLength={field === 'publicReason' ? 500 : 2000}
        required
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={[`${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(' ')}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SanctionChangeForm({ userId, userName, current, expectedSeq }: SanctionChangeFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SanctionChangeMode>('lift');
  const [days, setDays] = useState<SanctionDurationDays | null>(null);
  const [baseTime, setBaseTime] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [publicReason, setPublicReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });
  const keyRef = useRef<string | null>(null);

  // Focus the first invalid field after errors change.
  useEffect(() => {
    const first = (['reason', 'publicReason', 'endsAt'] as const).find((field) => errors[field]);
    if (first) document.getElementById(FIELD_IDS[first])?.focus();
  }, [errors]);

  if (current.kind === 'none') return null;

  const endsAt = mode === 'change_duration' && days !== null && baseTime !== null
    ? suspensionPresetEndsAt(days, baseTime)
    : null;

  /** Any edit makes the next submit a different operation. */
  const touched = () => {
    keyRef.current = null;
    if (status.kind !== 'idle') setStatus({ kind: 'idle' });
  };

  const openFor = (next: SanctionChangeMode) => {
    if (next !== mode) touched();
    setMode(next);
    setErrors({});
    setOpen(true);
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    const found = validateSanctionChange({ mode, endsAt, reason, publicReason, now: Date.now() });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (!keyRef.current) keyRef.current = crypto.randomUUID();
    const idempotencyKey = keyRef.current;
    startTransition(async () => {
      let result: AdminResult<{ actionId: string }>;
      try {
        result = await adjustUserSanctionAction(
          buildSanctionAdjustInput({ userId, expectedSeq }, { mode, endsAt, reason, publicReason }, idempotencyKey)
        );
      } catch {
        setStatus({ kind: 'error', message: '처리하지 못했습니다. 다시 시도해 주세요.' });
        return;
      }
      if (result.ok) {
        keyRef.current = null;
        setErrors({});
        setStatus({ kind: 'idle' });
        setReason('');
        setPublicReason('');
        setDays(null);
        setBaseTime(null);
        setOpen(false);
        toast.success(mode === 'lift' ? '제재가 해제되었습니다.' : '제재 기간이 변경되었습니다.');
        router.refresh();
        return;
      }
      // Inputs, selection and retry key stay as they were.
      const fieldErrors = mapServerFieldErrors(result.fieldErrors);
      setErrors(fieldErrors);
      setStatus(
        Object.keys(fieldErrors).length > 0 && result.error !== 'stale_target' && result.error !== 'conflict'
          ? { kind: 'idle' }
          : describeFailure(result)
      );
    });
  };

  const title = mode === 'lift' ? '제재 해제' : '제재 기간 변경';
  const submitLabel = mode === 'lift' ? '해제 확인' : '기간 변경 확인';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11" onClick={() => openFor('lift')}>
          제재 해제
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => openFor('change_duration')}>
          기간 변경
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent showCloseButton={false}>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                {mode === 'lift'
                  ? '현재 제재를 즉시 해제합니다.'
                  : '선택한 기간 뒤로 정지 종료 시각을 변경합니다.'}
              </DialogDescription>
            </DialogHeader>

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium text-muted-foreground">대상</dt>
              <dd className="[overflow-wrap:anywhere]">{userName}</dd>
              <dt className="font-medium text-muted-foreground">현재</dt>
              <dd>
                {current.kind === 'permanent_suspension' ? '영구 정지' : '기간 정지'} · 종료{' '}
                <CurrentExpiry current={current} />
              </dd>
              <dt className="font-medium text-muted-foreground">변경 후</dt>
              <dd>{mode === 'lift' ? '제재 없음' : endsAt ? <LocalTime value={endsAt} withZone /> : '기간을 선택해 주세요'}</dd>
            </dl>

            {mode === 'change_duration' ? (
              <DurationPresetPicker
                id={FIELD_IDS.endsAt}
                selected={days}
                baseTime={baseTime}
                disabled={pending}
                error={errors.endsAt}
                onSelect={(next) => {
                  touched();
                  setErrors({});
                  setDays(next);
                  setBaseTime(Date.now());
                }}
              />
            ) : null}

            <ReasonInput
              field="reason"
              label="조치 사유 (내부)"
              hint="관리자만 볼 수 있습니다."
              value={reason}
              error={errors.reason}
              disabled={pending}
              onChange={(value) => {
                touched();
                setReason(value);
              }}
            />
            <ReasonInput
              field="publicReason"
              label="공개 사유"
              hint="대상 사용자에게 표시됩니다."
              value={publicReason}
              error={errors.publicReason}
              disabled={pending}
              onChange={(value) => {
                touched();
                setPublicReason(value);
              }}
            />

            <StatusMessage status={status} onRefresh={() => router.refresh()} />

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button type="submit" variant="destructive" disabled={pending} aria-disabled={pending} className="min-h-11 w-full sm:w-auto">
                <LoaderCircle aria-hidden="true" className={cn('animate-spin', pending ? 'visible' : 'invisible')} />
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

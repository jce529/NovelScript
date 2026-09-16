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
import {
  moderateReportGroupAction,
  resolveReviewRequestAction,
  unblindTargetAction,
} from '@/app/admin/actions';
import type { AdminResult, ModerationAction, ReviewOutcome } from '@/lib/admin/types';

/*
 * Admin action forms (ADMIN-02..04, D-18, D-19). Each form submits the exact reviewed
 * report IDs and target version it was rendered with plus a per-operation retry UUID.
 * The UUID survives retries of the same input and is replaced whenever the input
 * changes or the operation succeeds, so a retry is idempotent but an edit is a new
 * operation. The actor is never sent; the server derives it from the session.
 */

const REASON_REQUIRED = '조치 사유를 입력해 주세요.';
const CONFLICT = '다른 관리자가 이 항목을 변경했습니다. 새로고침 후 확인해 주세요.';
const BLIND_EFFECT = '이 콘텐츠의 본문을 차단합니다. 기존 구매 내역은 유지됩니다.';
const SUSPEND_EFFECT = '이 사용자의 쓰기 활동을 제한합니다. 기존 구매 콘텐츠 열람은 유지됩니다.';

const ACTION_OPTIONS: { value: ModerationAction; label: string; submit: string }[] = [
  { value: 'resolve', label: '처리 완료', submit: '처리 완료' },
  { value: 'dismiss', label: '기각', submit: '기각' },
  { value: 'blind', label: '블라인드', submit: '블라인드 적용' },
  { value: 'warn', label: '경고', submit: '경고 전달' },
  { value: 'suspend', label: '기간 정지', submit: '정지 적용' },
  { value: 'permanent_suspend', label: '영구 정지', submit: '정지 적용' },
];

const OPERATIVE: ReadonlySet<ModerationAction> = new Set(['blind', 'warn', 'suspend', 'permanent_suspend']);
const NEEDS_CONFIRM: ReadonlySet<ModerationAction> = new Set(['blind', 'suspend', 'permanent_suspend']);

type Field = 'reason' | 'publicReason' | 'endsAt';
type FieldErrors = Partial<Record<Field, string>>;
type Status = { kind: 'idle' } | { kind: 'stale' } | { kind: 'error'; message: string };

const FIELD_MESSAGES: Record<string, string> = {
  [REASON_REQUIRED]: REASON_REQUIRED,
  expiry_required: '정지 종료 시각을 입력해 주세요.',
  expiry_in_past: '정지 종료 시각은 현재 이후여야 합니다.',
  expiry_not_allowed: '이 조치에는 종료 시각을 지정할 수 없습니다.',
};

function newKey(): string {
  return crypto.randomUUID();
}

/** Converts a datetime-local value (browser local time) to an ISO instant. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'local';
  }
}

function describeFailure(result: Extract<AdminResult<unknown>, { ok: false }>): Status {
  switch (result.error) {
    case 'stale_target':
    case 'conflict':
      return { kind: 'stale' };
    case 'not_found':
      return { kind: 'error', message: '대상을 찾을 수 없거나 권한이 없습니다.' };
    case 'reason_required':
      return { kind: 'error', message: REASON_REQUIRED };
    case 'validation_failed':
      return { kind: 'error', message: '입력 내용을 확인해 주세요.' };
    default:
      return { kind: 'error', message: '처리하지 못했습니다. 다시 시도해 주세요.' };
  }
}

function mapFieldErrors(fieldErrors: Record<string, string> | undefined): FieldErrors {
  const out: FieldErrors = {};
  for (const field of ['reason', 'publicReason', 'endsAt'] as const) {
    const message = fieldErrors?.[field];
    if (message) out[field] = FIELD_MESSAGES[message] ?? '입력 내용을 확인해 주세요.';
  }
  return out;
}

/** Shared submit plumbing: pending lock, retry key, field focus, stale refresh. */
function useCommand(fieldIds: Partial<Record<Field, string>>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const keyRef = useRef<string | null>(null);
  const idsKey = JSON.stringify(fieldIds);

  // Focus the first invalid field after errors change (UI-SPEC: invalid submit focuses first error).
  useEffect(() => {
    const ids = JSON.parse(idsKey) as Partial<Record<Field, string>>;
    const first = (['reason', 'publicReason', 'endsAt'] as const).find((field) => errors[field] && ids[field]);
    if (first) document.getElementById(ids[first]!)?.focus();
  }, [errors, idsKey]);

  const key = () => {
    if (!keyRef.current) keyRef.current = newKey();
    return keyRef.current;
  };

  /** Any edit makes the next submit a different operation. */
  const touched = () => {
    keyRef.current = null;
    if (status.kind !== 'idle') setStatus({ kind: 'idle' });
  };

  const run = (
    call: (idempotencyKey: string) => Promise<AdminResult<{ actionId: string }>>,
    successMessage: string,
    onSuccess: () => void
  ) => {
    const idempotencyKey = key();
    startTransition(async () => {
      let result: AdminResult<{ actionId: string }>;
      try {
        result = await call(idempotencyKey);
      } catch {
        setStatus({ kind: 'error', message: '처리하지 못했습니다. 다시 시도해 주세요.' });
        return;
      }
      if (result.ok) {
        keyRef.current = null;
        setErrors({});
        setStatus({ kind: 'idle' });
        onSuccess();
        toast.success(successMessage);
        router.refresh();
        return;
      }
      const fieldErrors = mapFieldErrors(result.fieldErrors);
      setErrors(fieldErrors);
      setStatus(Object.keys(fieldErrors).length > 0 && result.error !== 'stale_target' ? { kind: 'idle' } : describeFailure(result));
    });
  };

  return { pending, status, errors, setErrors, touched, run, refresh: () => router.refresh() };
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

function StatusMessage({ status, onRefresh }: { status: Status; onRefresh: () => void }) {
  return (
    <div aria-live="polite" className="min-h-0">
      {status.kind === 'stale' ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          <p>{CONFLICT}</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={onRefresh}>
            새로고침
          </Button>
        </div>
      ) : null}
      {status.kind === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({
  pending,
  label,
  destructive,
  onClick,
  type = 'submit',
}: {
  pending: boolean;
  label: string;
  destructive?: boolean;
  onClick?: () => void;
  type?: 'submit' | 'button';
}) {
  return (
    <Button
      type={type}
      variant={destructive ? 'destructive' : 'default'}
      disabled={pending}
      aria-disabled={pending}
      onClick={onClick}
      className="min-h-11 w-full sm:w-auto"
    >
      <LoaderCircle aria-hidden="true" className={cn('animate-spin', pending ? 'visible' : 'invisible')} />
      {label}
    </Button>
  );
}

function ReasonField({
  id,
  label,
  hint,
  value,
  error,
  required,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  error?: string;
  required: boolean;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> (필수)</span> : <span className="text-muted-foreground"> (선택)</span>}
      </Label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <Textarea
        id={id}
        value={value}
        rows={3}
        maxLength={id.endsWith('public') ? 500 : 2000}
        required={required}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  targetName,
  effect,
  reason,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  targetName: string;
  effect: string;
  reason: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{effect}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium text-muted-foreground">대상</dt>
          <dd className="[overflow-wrap:anywhere]">{targetName}</dd>
          <dt className="font-medium text-muted-foreground">사유</dt>
          <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{reason}</dd>
        </dl>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <SubmitButton type="button" pending={pending} label={confirmLabel} destructive onClick={onConfirm} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------- */

export interface ReportModerationFormProps {
  workId: string;
  chapterId: string | null;
  reportIds: string[];
  targetVersion: string;
  targetName: string;
  authorName: string;
}

export function ReportModerationForm({
  workId,
  chapterId,
  reportIds,
  targetVersion,
  targetName,
  authorName,
}: ReportModerationFormProps) {
  const cmd = useCommand({ reason: 'moderation-reason', publicReason: 'moderation-reason-public', endsAt: 'moderation-ends-at' });
  const [action, setAction] = useState<ModerationAction>('resolve');
  const [reason, setReason] = useState('');
  const [publicReason, setPublicReason] = useState('');
  const [endsAtLocal, setEndsAtLocal] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const operative = OPERATIVE.has(action);
  const option = ACTION_OPTIONS.find((o) => o.value === action)!;
  const isSanction = action === 'warn' || action === 'suspend' || action === 'permanent_suspend';

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (operative && !reason.trim()) next.reason = REASON_REQUIRED;
    if (operative && !publicReason.trim()) next.publicReason = REASON_REQUIRED;
    if (action === 'suspend') {
      const iso = localInputToIso(endsAtLocal);
      if (!iso) next.endsAt = FIELD_MESSAGES.expiry_required;
      else if (Date.parse(iso) <= Date.now()) next.endsAt = FIELD_MESSAGES.expiry_in_past;
    }
    cmd.setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = () => {
    // Close the confirmation first so pending/error/stale state is visible next to the form.
    setConfirmOpen(false);
    cmd.run(
      (idempotencyKey) =>
        moderateReportGroupAction({
          idempotencyKey,
          workId,
          chapterId,
          reportIds,
          targetVersion,
          action,
          reason: reason.trim() || null,
          publicReason: operative ? publicReason.trim() || null : null,
          endsAt: action === 'suspend' ? localInputToIso(endsAtLocal) : null,
        }),
      `${option.submit}되었습니다.`,
      () => {
        setReason('');
        setPublicReason('');
        setEndsAtLocal('');
      }
    );
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (cmd.pending || !validate()) return;
    if (NEEDS_CONFIRM.has(action)) setConfirmOpen(true);
    else submit();
  };

  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    cmd.touched();
    setter(value);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-labelledby="moderation-form-heading">
      <h2 id="moderation-form-heading" className="text-xl font-semibold">조치</h2>
      <p className="text-sm text-muted-foreground">검토한 미처리 신고 {reportIds.length}건에 적용됩니다.</p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="moderation-action">조치 유형</Label>
        <select
          id="moderation-action"
          value={action}
          disabled={cmd.pending}
          onChange={(event) => {
            edit(setAction)(event.target.value as ModerationAction);
            cmd.setErrors({});
          }}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {isSanction ? (
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">제재 대상: {authorName}</p>
        ) : null}
      </div>

      <ReasonField
        id="moderation-reason"
        label={operative ? '조치 사유 (내부)' : '처리 메모 (내부)'}
        hint="관리자만 볼 수 있습니다."
        value={reason}
        error={cmd.errors.reason}
        required={operative}
        onChange={edit(setReason)}
        disabled={cmd.pending}
      />

      {operative ? (
        <ReasonField
          id="moderation-reason-public"
          label="공개 사유"
          hint={action === 'blind' ? '독자와 작가에게 표시됩니다.' : '대상 사용자에게 표시됩니다.'}
          value={publicReason}
          error={cmd.errors.publicReason}
          required
          onChange={edit(setPublicReason)}
          disabled={cmd.pending}
        />
      ) : null}

      {action === 'suspend' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="moderation-ends-at">
            정지 종료 시각<span className="text-destructive"> (필수)</span>
          </Label>
          <p id="moderation-ends-at-zone" className="text-sm text-muted-foreground" suppressHydrationWarning>
            시간대: {localTimeZone()}
          </p>
          <input
            id="moderation-ends-at"
            type="datetime-local"
            value={endsAtLocal}
            disabled={cmd.pending}
            aria-invalid={cmd.errors.endsAt ? true : undefined}
            aria-describedby={cmd.errors.endsAt ? 'moderation-ends-at-zone moderation-ends-at-error' : 'moderation-ends-at-zone'}
            onChange={(event) => edit(setEndsAtLocal)(event.target.value)}
            className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
          />
          <FieldError id="moderation-ends-at-error" message={cmd.errors.endsAt} />
        </div>
      ) : null}

      {action === 'permanent_suspend' ? (
        <p className="text-sm font-medium text-destructive">종료 시각 없이 영구 정지됩니다.</p>
      ) : null}

      <StatusMessage status={cmd.status} onRefresh={cmd.refresh} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={cmd.pending} label={option.submit} destructive={NEEDS_CONFIRM.has(action)} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={option.submit}
        targetName={isSanction ? `${authorName} (${targetName})` : targetName}
        effect={action === 'blind' ? BLIND_EFFECT : SUSPEND_EFFECT}
        reason={publicReason.trim()}
        confirmLabel={option.submit}
        pending={cmd.pending}
        onConfirm={submit}
      />
    </form>
  );
}

/* ------------------------------------------------------------------------- */

export function UnblindForm({
  workId,
  chapterId,
  targetVersion,
}: {
  workId: string;
  chapterId: string | null;
  targetVersion: string;
}) {
  const cmd = useCommand({ reason: 'unblind-reason' });
  const [reason, setReason] = useState('');

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (cmd.pending) return;
    if (!reason.trim()) {
      cmd.setErrors({ reason: REASON_REQUIRED });
      return;
    }
    cmd.setErrors({});
    cmd.run(
      (idempotencyKey) => unblindTargetAction({ idempotencyKey, workId, chapterId, targetVersion, reason: reason.trim() }),
      '블라인드가 해제되었습니다.',
      () => setReason('')
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-labelledby="unblind-form-heading">
      <h2 id="unblind-form-heading" className="text-xl font-semibold">블라인드 해제</h2>
      <ReasonField
        id="unblind-reason"
        label="해제 사유 (내부)"
        value={reason}
        error={cmd.errors.reason}
        required
        onChange={(value) => {
          cmd.touched();
          setReason(value);
        }}
        disabled={cmd.pending}
      />
      <StatusMessage status={cmd.status} onRefresh={cmd.refresh} />
      <div>
        <SubmitButton pending={cmd.pending} label="블라인드 해제" />
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------------- */

export function ReviewDecisionForm({ requestId, targetVersion }: { requestId: string; targetVersion: string }) {
  const cmd = useCommand({ reason: 'review-reason' });
  const [reason, setReason] = useState('');
  const [chosen, setChosen] = useState<ReviewOutcome | null>(null);

  const decide = (outcome: ReviewOutcome) => {
    if (cmd.pending) return;
    if (!reason.trim()) {
      cmd.setErrors({ reason: REASON_REQUIRED });
      return;
    }
    // A different outcome is a different operation.
    if (chosen !== outcome) cmd.touched();
    setChosen(outcome);
    cmd.setErrors({});
    cmd.run(
      (idempotencyKey) =>
        resolveReviewRequestAction({ idempotencyKey, requestId, outcome, targetVersion, reason: reason.trim() }),
      outcome === 'unblinded' ? '블라인드가 해제되었습니다.' : '블라인드를 유지했습니다.',
      () => setReason('')
    );
  };

  return (
    <form
      onSubmit={(event) => event.preventDefault()}
      noValidate
      className="flex flex-col gap-4"
      aria-labelledby="review-form-heading"
    >
      <h2 id="review-form-heading" className="text-xl font-semibold">재검토 결정</h2>
      <ReasonField
        id="review-reason"
        label="결정 사유 (내부)"
        hint="관리자만 볼 수 있습니다."
        value={reason}
        error={cmd.errors.reason}
        required
        onChange={(value) => {
          cmd.touched();
          setReason(value);
        }}
        disabled={cmd.pending}
      />
      <StatusMessage status={cmd.status} onRefresh={cmd.refresh} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={cmd.pending} className="min-h-11 w-full sm:w-auto" onClick={() => decide('unblinded')}>
          <LoaderCircle aria-hidden="true" className={cn('animate-spin', cmd.pending && chosen === 'unblinded' ? 'visible' : 'invisible')} />
          블라인드 해제
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={cmd.pending}
          className="min-h-11 w-full sm:w-auto"
          onClick={() => decide('maintained')}
        >
          <LoaderCircle aria-hidden="true" className={cn('animate-spin', cmd.pending && chosen === 'maintained' ? 'visible' : 'invisible')} />
          유지
        </Button>
      </div>
    </form>
  );
}

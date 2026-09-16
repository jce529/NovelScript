'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { acknowledgeWarningAction, getAccountNoticesAction } from '@/lib/moderation/actions';
import {
  NOTICE_ACK_ERROR, NOTICE_ACK_LABEL, NOTICE_LOAD_ERROR, NOTICE_TITLE,
  type WarningNotice,
} from '@/lib/moderation/user-actions';

/*
 * D-09 shared notice. Mounted once in the root layout so it never blocks rendering, login or
 * logout: loading happens after hydration through a Server Action, and any failure only shows a
 * retry line. Each warning is acknowledged individually and only disappears after the server
 * confirms persistence; there is no dismiss-on-navigation.
 */

type LoadState =
  | { status: 'idle' | 'loading' | 'anonymous' }
  | { status: 'error' }
  | { status: 'ready'; warnings: WarningNotice[] };

export function AccountNotices() {
  const pathname = usePathname();
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const lastStatus = useRef<LoadState['status']>('idle');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await getAccountNoticesAction();
      const next: LoadState = result.ok
        ? { status: 'ready', warnings: result.warnings }
        : result.code === 'unauthenticated' ? { status: 'anonymous' } : { status: 'error' };
      lastStatus.current = next.status;
      setState(next);
    } catch {
      lastStatus.current = 'error';
      setState({ status: 'error' });
    }
  }, []);

  // First access loads; later navigations only re-check when we had no session yet (login).
  useEffect(() => {
    if (lastStatus.current === 'idle' || lastStatus.current === 'anonymous') {
      void load();
    }
  }, [pathname, load]);

  if (state.status === 'error') {
    return (
      <div role="status" className="flex items-center justify-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm">
        <span>{NOTICE_LOAD_ERROR}</span>
        <Button variant="outline" size="sm" onClick={() => void load()}>다시 시도</Button>
      </div>
    );
  }
  if (state.status !== 'ready' || state.warnings.length === 0) return null;

  return (
    <section aria-label={NOTICE_TITLE} className="flex flex-col gap-2 border-b border-border bg-muted px-4 py-3">
      {state.warnings.map((warning) => (
        <WarningItem
          key={warning.id}
          warning={warning}
          onAcknowledged={() => setState((current) => current.status === 'ready'
            ? { status: 'ready', warnings: current.warnings.filter((w) => w.id !== warning.id) }
            : current)}
        />
      ))}
    </section>
  );
}

function WarningItem({ warning, onAcknowledged }: { warning: WarningNotice; onAcknowledged: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function acknowledge() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await acknowledgeWarningAction(warning.id);
        if (result.ok) onAcknowledged();
        else setError(result.error);
      } catch {
        setError(NOTICE_ACK_ERROR);
      }
    });
  }

  return (
    <div role="alert" className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center">
      <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <strong className="text-sm">{NOTICE_TITLE}</strong>
        <p className="text-sm whitespace-pre-wrap break-words">{warning.publicReason}</p>
        {warning.createdAt && (
          <time dateTime={warning.createdAt} className="text-xs text-muted-foreground">
            {new Date(warning.createdAt).toLocaleString()}
          </time>
        )}
        {error && <p className="text-sm text-destructive" aria-live="polite">{error}</p>}
      </div>
      <Button size="sm" disabled={pending} onClick={acknowledge} className="min-h-11 sm:min-h-7">
        {pending ? '처리 중…' : NOTICE_ACK_LABEL}
      </Button>
    </div>
  );
}

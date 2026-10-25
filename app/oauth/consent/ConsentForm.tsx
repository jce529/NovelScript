'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { approveConsent, denyConsent } from './actions';

const FAILURE_COPY = '연결을 완료하지 못했어요. 잠시 뒤 다시 시도해 주세요. 계속되면 Claude에서 커넥터를 다시 추가해 주세요.';

export function FocusHeading({ children, className = '' }: { children: ReactNode; className?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <h1 ref={heading} tabIndex={-1} className={`text-2xl font-semibold leading-tight break-keep outline-none ${className}`}>{children}</h1>;
}

export function ConsentForm({ authorizationId, readerOnly = false }: { authorizationId: string; readerOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState<'approve' | 'deny' | null>(null);
  const [failed, setFailed] = useState(false);
  const busyRef = useRef(false);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (failed) alertRef.current?.focus(); }, [failed]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const choice = submitter?.value === 'approve' && !readerOnly ? 'approve' : 'deny';
    busyRef.current = true;
    setBusy(true);
    setDecision(choice);
    setFailed(false);
    try {
      const result = choice === 'approve' ? await approveConsent(authorizationId) : await denyConsent(authorizationId);
      if (result?.ok === false) throw new Error('consent failed');
    } catch {
      // Server errors stay on this page; no identifiers or internal errors are displayed.
      setFailed(true);
      busyRef.current = false;
      setBusy(false);
      setDecision(null);
    }
  }

  return (
    <>
      {failed && <div ref={alertRef} tabIndex={-1} role="alert" className="rounded-md border border-destructive/40 p-4 text-sm text-destructive outline-none">{FAILURE_COPY}</div>}
      <form onSubmit={submit} className="flex flex-col-reverse justify-end gap-2 pt-1 sm:flex-row">
        <Button type="submit" name="decision" value="deny" variant="outline" disabled={busy} className="min-h-11 w-full font-semibold sm:w-auto sm:min-w-28">
          {readerOnly ? '돌아가기' : '거부'}
        </Button>
        {!readerOnly && <Button type="submit" name="decision" value="approve" disabled={busy} className="min-h-11 w-full font-semibold sm:w-auto sm:min-w-28">
          {busy && decision === 'approve' ? <span role="status">연결하는 중…</span> : '승인하고 연결'}
        </Button>}
      </form>
    </>
  );
}

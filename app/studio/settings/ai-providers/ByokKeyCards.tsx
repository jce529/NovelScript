'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { deleteByokKeyAction, recheckByokKeyAction, registerByokKeyAction } from './actions';
import { BYOK_COPY, PROVIDER_LABEL } from '@/lib/ai/providers/byok-copy';
import type { ProviderId } from '@/lib/ai/providers/types';

type RegisteredKey = { maskedHint: string; status: 'connected' | 'failed'; registeredAtLabel: string; modelCount: number };
export type ByokCardData = {
  providerId: ProviderId;
  label: string;
  registered: RegisteredKey | null;
  deleteImpact: { modelCount: number; defaultReplacementLabel: string | null };
};
type Props = { cards: ByokCardData[] };
type Result = { ok: boolean; message?: string; reason?: string; modelCount?: number };
const initial: Result = { ok: false };

function ProviderCard({ card }: { card: ByokCardData }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [registration, registerAction, registering] = useActionState(registerByokKeyAction, initial);
  const [recheck, recheckAction, rechecking] = useActionState(recheckByokKeyAction, initial);
  const [deletion, deleteAction, deleting] = useActionState(async (previous: Result, formData: FormData) => {
    const result = await deleteByokKeyAction(previous, formData);
    if (result.ok) setDialogOpen(false);
    return result;
  }, initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (registration.message && !registration.ok) inputRef.current?.form?.reset(); }, [registration]);
  const busy = rechecking || deleting;

  return (
    <section className="rounded-lg border border-border p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">{card.label}</h3>
          {card.registered ? <>
            <p className="text-sm">끝 4자리 {card.registered.maskedHint}</p>
            <p className="text-sm">등록일 {card.registered.registeredAtLabel}</p>
            <Badge variant={card.registered.status === 'failed' ? 'destructive' : 'secondary'}>{card.registered.status === 'failed' ? '검증 실패' : '연결됨'}</Badge>
            <p className="text-sm text-muted-foreground">{BYOK_COPY.replacementHelp}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <form action={recheckAction}>
                <input type="hidden" name="provider" value={card.providerId} />
                <Button type="submit" aria-label={`${card.label} 다시 확인`} disabled={busy}>{rechecking ? <span role="status">{BYOK_COPY.loading}</span> : '다시 확인'}</Button>
              </form>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger render={<Button ref={triggerRef} type="button" variant="destructive" aria-label={`${card.label} 삭제`} disabled={busy} onClick={() => setDialogOpen(true)}>삭제</Button>} />
                <DialogContent initialFocus={cancelRef} finalFocus={triggerRef}>
                  <DialogHeader><DialogTitle>{card.label} API 키 삭제</DialogTitle></DialogHeader>
                  <DialogDescription>
                    <span className="block">BYOK 모델 {card.deleteImpact.modelCount}개가 모델 선택 목록에서 사라져요.</span>
                    {card.deleteImpact.defaultReplacementLabel && <span className="block">기본 모델이 {card.deleteImpact.defaultReplacementLabel}로 바뀌어요.</span>}
                    <span className="block">삭제한 키는 복구할 수 없어요. 다른 키를 사용하려면 삭제 후 다시 등록하세요.</span>
                  </DialogDescription>
                  {deletion.message && !deletion.ok && <p role="alert">{deletion.message}</p>}
                  <DialogFooter>
                    <DialogClose render={<Button ref={cancelRef} type="button" variant="outline">취소</Button>} />
                    <form action={deleteAction} className="contents">
                      <input type="hidden" name="provider" value={card.providerId} />
                      <Button type="submit" variant="destructive" aria-label={`${card.label} 삭제 확인`} disabled={busy}>{deleting ? <span role="status">{BYOK_COPY.loading}</span> : '삭제'}</Button>
                    </form>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            {recheck.message && !recheck.ok && <p role="alert">{recheck.message}</p>}
            {recheck.message && recheck.ok && <p role="status">{recheck.message}</p>}
          </> : <>
            <Badge variant="secondary">{BYOK_COPY.emptyHeading}</Badge>
            <form action={registerAction} className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <input type="hidden" name="provider" value={card.providerId} />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor={`${card.providerId}-api-key`}>{BYOK_COPY.inputLabel(card.label)}</Label>
                <Input ref={inputRef} id={`${card.providerId}-api-key`} name="apiKey" type="password" autoComplete="off" placeholder={BYOK_COPY.inputPlaceholder} aria-describedby={registration.message && !registration.ok ? `${card.providerId}-error` : undefined} />
                {registration.message && !registration.ok && <p id={`${card.providerId}-error`} role="alert">{registration.message}</p>}
              </div>
              <Button type="submit" aria-label={`${card.label} API 키 등록`} disabled={registering}>{registering ? <span role="status">{BYOK_COPY.loading}</span> : '등록'}</Button>
            </form>
            <p className="mt-2 text-sm text-muted-foreground">{BYOK_COPY.emptyBody}</p>
            {registration.message && registration.ok && <p role="status">{registration.message}</p>}
          </>}
      </div>
      </div>
    </section>
  );
}

export default function ByokKeyCards({ cards }: Props) {
  const order: ProviderId[] = ['openai', 'anthropic', 'gemini'];
  const byProvider = new Map(cards.map((card) => [card.providerId, card]));
  return <div className="flex flex-col gap-4">{order.map((providerId) => {
    const card = byProvider.get(providerId);
    return card ? <ProviderCard key={providerId} card={{ ...card, label: PROVIDER_LABEL[providerId] }} /> : null;
  })}</div>;
}

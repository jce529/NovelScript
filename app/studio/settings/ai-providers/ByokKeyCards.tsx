'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { deleteByokKeyAction, recheckByokKeyAction, registerByokKeyAction } from './actions';
import { BYOK_COPY, PROVIDER_LABEL } from '@/lib/ai/providers/byok-copy';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';
import type { ProviderId } from '@/lib/ai/providers/types';

type RegisteredKey = { maskedHint: string; status: 'connected' | 'failed'; registeredAtLabel: string; modelCount: number };
type UsageModel = { model: string; calls: number; inputTokens: number; outputTokens: number };
type Usage = { status: 'empty' | 'error' } | { status: 'ready'; total: Omit<UsageModel, 'model'>; models: UsageModel[] };
export type ByokCardData = {
  providerId: ProviderId;
  label: string;
  registered: RegisteredKey | null;
  usage?: Usage;
  deleteImpact: { modelCount: number; defaultReplacementLabel: string | null };
};
type Props = { cards: ByokCardData[] };
type Result = { ok: boolean; message?: string; reason?: string; modelCount?: number };
const initial: Result = { ok: false };

function ProviderCard({ card }: { card: ByokCardData }) {
  const [modelsOpen, setModelsOpen] = useState(false);
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
            {card.usage && <div className="min-w-0 space-y-2">
              <h4 className="text-sm font-medium">이번 달 사용량</h4>
              {card.usage.status === 'ready' ? <>
                <p className="text-sm tabular-nums" aria-label={`호출 ${card.usage.total.calls}회, 입력 ${card.usage.total.inputTokens} 토큰, 출력 ${card.usage.total.outputTokens} 토큰`}>
                  {card.usage.total.calls.toLocaleString('ko-KR')}회 · 입력 {card.usage.total.inputTokens.toLocaleString('ko-KR')} · 출력 {card.usage.total.outputTokens.toLocaleString('ko-KR')} 토큰
                </p>
                <p className="text-xs text-muted-foreground">매월 1일 00시(한국 시간)부터 집계해요.</p>
                {card.usage.models.length > 0 && <>
                  <Button type="button" variant="ghost" size="sm" aria-label={`${card.label} 모델별 사용량 ${modelsOpen ? '접기' : '보기'}`} aria-expanded={modelsOpen} aria-controls={`${card.providerId}-usage-models`} onClick={() => setModelsOpen((open) => !open)}>
                    {modelsOpen ? '모델별 접기' : '모델별 보기'} <ChevronDown className={`size-4 transition-transform motion-reduce:transition-none ${modelsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </Button>
                  {modelsOpen && <ul id={`${card.providerId}-usage-models`} className="space-y-1 text-sm">
                    {card.usage.models.map((model) => {
                      const label = PROVIDER_MODELS[card.providerId].find((item) => item.id === model.model)?.displayName ?? model.model;
                      return <li key={model.model} className="flex flex-wrap justify-between gap-x-3 tabular-nums" aria-label={`${label}: 호출 ${model.calls}회, 입력 ${model.inputTokens} 토큰, 출력 ${model.outputTokens} 토큰`}>
                        <span>{label}</span><span>{model.calls.toLocaleString('ko-KR')}회 · 입력 {model.inputTokens.toLocaleString('ko-KR')} · 출력 {model.outputTokens.toLocaleString('ko-KR')} 토큰</span>
                      </li>;
                    })}
                  </ul>}
                </>}
              </> : card.usage.status === 'empty'
                ? <p className="text-sm text-muted-foreground">이번 달에는 아직 사용 기록이 없어요.</p>
                : <p role="alert" className="text-sm text-destructive">사용량을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>}
            </div>}
            <p className="text-sm text-muted-foreground">{BYOK_COPY.replacementHelp}</p>
            <div className="flex flex-wrap gap-2">
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

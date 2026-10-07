'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';
import { FALLBACK_COPY, PROVIDER_LABEL } from '@/lib/ai/providers/byok-copy';
import type { DefaultFallback } from '@/lib/ai/providers/settings';
import type { Selection } from '@/lib/ai/providers/selection';

const SETTINGS_HREF = '/studio/settings/ai-providers';

function modelLabel(s: Selection): string {
  return `${PROVIDER_LABEL[s.providerId]} ${PROVIDER_MODELS[s.providerId].find((entry) => entry.id === s.model)?.displayName ?? s.model}`;
}

export interface DefaultFallbackNoticeProps {
  fallback: DefaultFallback;
  onConsent: () => void;
  onPickOther: () => void;
  onDismiss: () => void;
}

/** BUG-02: 계정 기본 모델을 쓸 수 없어 대체됐을 때의 이유·해결 링크·선택지.
 * 비용 주체가 바뀌는 대체(requiresConsent)는 동의 카드로, 그 외는 닫을 수 있는 안내 배너로 보여 준다. */
export function DefaultFallbackNotice({ fallback, onConsent, onPickOther, onDismiss }: DefaultFallbackNoticeProps) {
  const { reason, original, suggested, requiresConsent } = fallback;
  const originalLabel = original ? modelLabel(original) : '';
  const reasonText = reason === 'byok_key_missing' || reason === 'byok_model_unavailable'
    ? FALLBACK_COPY.reason[reason](originalLabel)
    : FALLBACK_COPY.reason[reason]();

  return (
    <div role="alert" data-fallback-reason={reason} className="rounded-lg border border-border bg-muted p-3">
      <div className="flex items-start gap-2">
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-sm font-medium break-keep">{requiresConsent ? FALLBACK_COPY.consentTitle : FALLBACK_COPY.bannerTitle}</p>
          <p className="text-sm break-keep">{reasonText}</p>
          {requiresConsent && <p className="text-sm break-keep">{FALLBACK_COPY.consentBody(modelLabel(suggested))}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {requiresConsent ? (
              <>
                <Button type="button" size="sm" onClick={onConsent}>{FALLBACK_COPY.consent}</Button>
                <Button type="button" size="sm" variant="outline" onClick={onPickOther}>{FALLBACK_COPY.pickOther}</Button>
              </>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={onDismiss}>{FALLBACK_COPY.dismiss}</Button>
            )}
            <Link className="text-xs underline" href={SETTINGS_HREF}>{FALLBACK_COPY.fixLink}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

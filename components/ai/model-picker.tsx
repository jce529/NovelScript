'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';
import {
  decodeSelection, encodeSelection, KEY_SOURCE_LABEL, SERVICE_KEY_UNAVAILABLE_REASON,
  type ModelChoice, type Selection,
} from '@/lib/ai/providers/selection';
import type { ProviderId } from '@/lib/ai/providers/types';

export const PICKER_PROVIDER_LABELS: Record<ProviderId, string> = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic' };
export const PICKER_LOADING_MESSAGE = '사용 가능 여부를 확인하는 중이에요.';
export const PICKER_ERROR_MESSAGE = '사용 가능 여부를 확인하지 못했어요. 다시 확인해 주세요.';
export const KEY_MANAGEMENT_HREF = '/studio/settings/ai-providers';
export const PICKER_DESCRIBED_BY_ID = 'ai-model-select-help';
const SHORT_REASON = '서비스 키 미설정';

/** Service rows are forced disabled while availability is unknown (loading / failed). */
export function resolvePickerChoices(choices: ModelChoice[], loading = false, loadFailed = false): ModelChoice[] {
  if (!loading && !loadFailed) return choices;
  const reason = loading ? PICKER_LOADING_MESSAGE : PICKER_ERROR_MESSAGE;
  return choices.map((choice) => (choice.keySource === 'service' ? { ...choice, disabled: true, unavailableReason: reason } : choice));
}

/**
 * Pure selection gate: returns a Selection only for a known, enabled choice. Disabled or unknown
 * values (forged, stale) yield null so the caller's callback is never invoked.
 */
export function pickEnabledSelection(choices: ModelChoice[], value: string | null | undefined): Selection | null {
  if (!value) return null;
  const selection = decodeSelection(value);
  if (!selection) return null;
  const choice = choices.find((item) => item.value === encodeSelection(selection));
  if (!choice || choice.disabled) return null;
  return selection;
}

interface ModelPickerProps {
  choices: ModelChoice[];
  value: string;
  onSelection: (selection: Selection) => void;
  loading?: boolean;
  loadFailed?: boolean;
  onRetry?: () => void;
}

export function ModelPicker({ choices: rawChoices, value, onSelection, loading = false, loadFailed = false, onRetry }: ModelPickerProps) {
  const choices = resolvePickerChoices(rawChoices, loading, loadFailed);
  const disabledProviders = (Object.keys(PROVIDER_MODELS) as ProviderId[]).filter((pid) =>
    choices.some((choice) => choice.providerId === pid && choice.keySource === 'service' && choice.disabled));
  const hasUnavailable = disabledProviders.length > 0;
  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <Select value={value} onValueChange={(next) => {
        const selection = pickEnabledSelection(choices, next);
        if (selection) onSelection(selection);
      }}>
        <SelectTrigger id="ai-model-select" className="w-full" aria-describedby={hasUnavailable ? PICKER_DESCRIBED_BY_ID : undefined}>
          <SelectValue>
            {(current: string) => {
              const selection = decodeSelection(current);
              const choice = choices.find((item) => item.value === current);
              return selection && choice
                ? <>{PICKER_PROVIDER_LABELS[selection.providerId]} {'·'} {choice.displayName} <Badge variant={selection.keySource === 'byok' ? 'secondary' : 'outline'}>{KEY_SOURCE_LABEL[selection.keySource]}</Badge></>
                : current;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(PROVIDER_MODELS) as ProviderId[]).map((pid, index) => {
            const group = choices.filter((choice) => choice.providerId === pid);
            return <div key={pid} role="group" aria-label={PICKER_PROVIDER_LABELS[pid]} className={index ? 'border-t border-border mt-1' : ''}>
              <div className="flex justify-between bg-muted px-2 py-1 text-xs font-semibold"><span>{PICKER_PROVIDER_LABELS[pid]}</span><span>{group.length}개</span></div>
              {group.map((choice) => <SelectItem
                key={choice.value} value={choice.value} disabled={choice.disabled}
                aria-label={`${PICKER_PROVIDER_LABELS[pid]} ${choice.displayName} ${choice.badge}${choice.disabled ? ` 사용할 수 없음 ${choice.unavailableReason ?? ''}` : ''}`}
                aria-describedby={choice.disabled ? PICKER_DESCRIBED_BY_ID : undefined}
              >
                {choice.displayName} <Badge variant={choice.keySource === 'byok' ? 'secondary' : 'outline'}>{choice.badge}</Badge>
                {choice.disabled && <span className="text-xs text-muted-foreground">{loading || loadFailed ? '확인 필요' : SHORT_REASON}</span>}
              </SelectItem>)}
            </div>;
          })}
        </SelectContent>
      </Select>
      {(hasUnavailable || loading || loadFailed) && (
        <div id={PICKER_DESCRIBED_BY_ID} role={loadFailed ? 'alert' : 'status'} className="flex flex-col gap-1 text-xs text-muted-foreground">
          {loading && <p>{PICKER_LOADING_MESSAGE}</p>}
          {loadFailed && !loading && (
            <p>{PICKER_ERROR_MESSAGE}{onRetry && <>{' '}<button type="button" className="underline" onClick={onRetry}>다시 확인</button></>}</p>
          )}
          {!loading && !loadFailed && disabledProviders.map((pid) => (
            <p key={pid}>
              {PICKER_PROVIDER_LABELS[pid]} [서비스 키]: {choices.find((c) => c.providerId === pid && c.keySource === 'service' && c.disabled)?.unavailableReason ?? SERVICE_KEY_UNAVAILABLE_REASON}
              {' '}<Link className="underline" href={KEY_MANAGEMENT_HREF}>키 관리</Link>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

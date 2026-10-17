'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { getServiceAvailabilityAction } from '@/app/studio/settings/ai-providers/model-availability-actions';
import type { Selection, ServiceAvailability } from './selection';

export type ServiceAvailabilityStatus = 'loading' | 'ready' | 'error';

const PROVIDER_IDS = ['gemini', 'openai', 'anthropic'] as const;

/** Accepts only a complete DTO with three real booleans; anything else is treated as unknown (fail closed). */
export function parseServiceAvailability(value: unknown): ServiceAvailability | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  for (const id of PROVIDER_IDS) if (typeof record[id] !== 'boolean') return null;
  return { gemini: record.gemini as boolean, openai: record.openai as boolean, anthropic: record.anthropic as boolean };
}

/**
 * Pure guard: service selections need a confirmed true flag (null/incomplete DTO => false).
 * BYOK eligibility (connected, verified model) is judged elsewhere and is independent of service keys.
 */
export function canUseSelectionWith(availability: ServiceAvailability | null, selection: Selection): boolean {
  if (selection.keySource === 'byok') return true;
  return parseServiceAvailability(availability)?.[selection.providerId] === true;
}

export interface UseServiceAvailabilityResult {
  availability: ServiceAvailability | null;
  status: ServiceAvailabilityStatus;
  reload: () => void;
  canUseSelection: (selection: Selection) => boolean;
}

/** Reads service-key availability from the shared server action on mount/reload. No polling. */
export function useServiceAvailability(): UseServiceAvailabilityResult {
  const [availability, setAvailability] = useState<ServiceAvailability | null>(null);
  const [status, setStatus] = useState<ServiceAvailabilityStatus>('loading');
  const requestId = useRef(0);
  const mounted = useRef(true);

  const reload = useCallback(() => {
    const id = ++requestId.current;
    setStatus('loading');
    startTransition(async () => {
      let parsed: ServiceAvailability | null = null;
      try {
        const result = await getServiceAvailabilityAction();
        parsed = result.ok ? parseServiceAvailability(result.availability) : null;
      } catch {
        parsed = null;
      }
      if (!mounted.current || id !== requestId.current) return;
      setAvailability(parsed);
      setStatus(parsed ? 'ready' : 'error');
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; };
  }, [reload]);

  const canUseSelection = useCallback(
    (selection: Selection) => (status === 'ready' ? canUseSelectionWith(availability, selection) : selection.keySource === 'byok'),
    [availability, status],
  );

  return { availability, status, reload, canUseSelection };
}

import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) => createElement('div', { 'data-selected-model': value }, children),
  SelectTrigger: ({ children, id, ...rest }: { children: ReactNode; id?: string; 'aria-describedby'?: string }) => createElement('button', { id, 'aria-describedby': rest['aria-describedby'] }, children),
  SelectValue: ({ children }: { children: (value: string) => ReactNode }) => children('openai:gpt-4o-mini:byok'),
  SelectContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectItem: ({ value, children, disabled, ...rest }: { value: string; children: ReactNode; disabled?: boolean; 'aria-describedby'?: string }) =>
    createElement('div', { 'data-model': value, 'data-disabled': disabled ? 'true' : undefined, disabled: disabled || undefined, 'aria-describedby': rest['aria-describedby'] }, children),
}));
vi.mock('@/app/studio/settings/ai-providers/model-availability-actions', () => ({ getServiceAvailabilityAction: vi.fn() }));

import {
  ModelPicker, pickEnabledSelection, resolvePickerChoices, PICKER_ERROR_MESSAGE, PICKER_LOADING_MESSAGE,
} from '@/components/ai/model-picker';
import { canUseSelectionWith, parseServiceAvailability } from '@/lib/ai/providers/use-service-availability';
import { buildModelChoices, SERVICE_KEY_UNAVAILABLE_REASON, type ServiceAvailability } from '@/lib/ai/providers/selection';
import { PROVIDER_MODELS } from '@/lib/ai/providers/catalog';

const allTrue: ServiceAvailability = { gemini: true, openai: true, anthropic: true };
const byok = { openai: ['gpt-4o-mini'] };
const render = (props: Partial<Parameters<typeof ModelPicker>[0]> = {}, availability: ServiceAvailability | undefined = allTrue) =>
  renderToStaticMarkup(createElement(ModelPicker, {
    choices: buildModelChoices(byok, availability), value: 'gemini:gemini-3.5-flash:service', onSelection: () => {}, ...props,
  }));

describe('ModelPicker with all service keys available (render parity with the AiPanel block)', () => {
  const html = render();
  it('keeps the trigger id and shows every catalog model plus the connected BYOK row', () => {
    expect(html).toContain('id="ai-model-select"');
    const total = Object.values(PROVIDER_MODELS).flat().length + 1;
    expect([...html.matchAll(/data-model="/g)]).toHaveLength(total);
    expect(html).not.toContain('data-disabled');
    expect(html).not.toContain('aria-describedby');
  });
  it('orders groups Gemini -> OpenAI -> Anthropic with matching counts', () => {
    const order = ['Google Gemini', 'OpenAI', 'Anthropic'].map((label) => html.indexOf(`<span>${label}</span>`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const counts = [...html.matchAll(/<span>(\d+)개<\/span>/g)].map((m) => Number(m[1]));
    expect(counts).toHaveLength(3);
    expect(counts.reduce((a, b) => a + b, 0)).toBe([...html.matchAll(/data-model="/g)].length);
  });
  it('places the BYOK row right after the same service row with badges/variants', () => {
    const service = html.indexOf('data-model="openai:gpt-4o-mini:service"');
    const own = html.indexOf('data-model="openai:gpt-4o-mini:byok"');
    expect(service).toBeGreaterThan(-1);
    expect(own).toBeGreaterThan(service);
    const between = html.slice(service, own);
    expect(between.match(/data-model="/g)).toHaveLength(1);
    expect(html).toContain('>서비스 키</span>');
    expect(html).toContain('>BYOK</span>');
  });
});

describe('ModelPicker disabled service rows', () => {
  const none: ServiceAvailability = { gemini: true, openai: false, anthropic: false };
  const html = render({ choices: buildModelChoices(byok, none) }, none);
  it('keeps disabled rows visible with model name, badge, text reason and key-management link', () => {
    const row = html.match(/<div data-model="openai:gpt-4o-mini:service"[^>]*>.*?<\/div>/)?.[0] ?? '';
    expect(row).toContain('data-disabled="true"');
    expect(row).toContain('GPT-4o mini');
    expect(row).toContain('서비스 키');
    expect(row).toContain('서비스 키 미설정');
    expect(html).toContain(SERVICE_KEY_UNAVAILABLE_REASON);
    expect(html).toContain('href="/studio/settings/ai-providers"');
    expect(html).toContain('aria-describedby="ai-model-select-help"');
    expect(html).toContain('id="ai-model-select-help"');
  });
  it('keeps the same-model BYOK row and enabled providers selectable', () => {
    expect(html).toMatch(/<div data-model="openai:gpt-4o-mini:byok"(?![^>]*data-disabled)/);
    expect(html).toMatch(/<div data-model="gemini:gemini-3.5-flash:service"(?![^>]*data-disabled)/);
  });
  it('callback gate ignores disabled and unknown values but allows active BYOK', () => {
    const choices = buildModelChoices(byok, none);
    expect(pickEnabledSelection(choices, 'openai:gpt-4o-mini:service')).toBeNull();
    expect(pickEnabledSelection(choices, 'openai:gpt-4o-mini')).toBeNull();
    expect(pickEnabledSelection(choices, 'openai:unknown-model:byok')).toBeNull();
    expect(pickEnabledSelection(choices, 'garbage')).toBeNull();
    expect(pickEnabledSelection(choices, null)).toBeNull();
    expect(pickEnabledSelection(choices, 'openai:gpt-4o-mini:byok')).toEqual({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
    expect(pickEnabledSelection(choices, 'gemini:gemini-3.5-flash:service')).toMatchObject({ keySource: 'service' });
  });
});

describe('ModelPicker fail-closed states', () => {
  it('loading disables every service row, announces text, keeps BYOK', () => {
    const html = render({ loading: true });
    expect(html).toContain(PICKER_LOADING_MESSAGE);
    expect(html).toContain('data-model="gemini:gemini-3.5-flash:service" data-disabled="true"');
    expect(html).toMatch(/<div data-model="openai:gpt-4o-mini:byok"(?![^>]*data-disabled)/);
  });
  it('failed lookup shows the retry message and retry button', () => {
    const html = render({ loadFailed: true, onRetry: () => {} });
    expect(html).toContain(PICKER_ERROR_MESSAGE);
    expect(html).toContain('다시 확인');
    expect(html).toContain('role="alert"');
    expect(resolvePickerChoices(buildModelChoices({}, allTrue), false, true).filter((c) => c.keySource === 'service').every((c) => c.disabled)).toBe(true);
  });
});

describe('service availability guard', () => {
  const svc = { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' } as const;
  it('fails closed for null/incomplete DTOs but not for BYOK', () => {
    expect(canUseSelectionWith(null, svc)).toBe(false);
    expect(canUseSelectionWith({ gemini: true, openai: true } as never, svc)).toBe(false);
    expect(canUseSelectionWith({ gemini: true, openai: 'yes', anthropic: true } as never, svc)).toBe(false);
    expect(canUseSelectionWith(null, { ...svc, keySource: 'byok' })).toBe(true);
  });
  it('allows a service selection only when its flag is true', () => {
    expect(canUseSelectionWith({ gemini: true, openai: true, anthropic: false }, svc)).toBe(true);
    expect(canUseSelectionWith({ gemini: true, openai: false, anthropic: true }, svc)).toBe(false);
    expect(parseServiceAvailability({ gemini: true, openai: true, anthropic: true, extra: 1 })).toEqual(allTrue);
  });
});

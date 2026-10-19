import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) => createElement('div', { 'data-preset-select': value }, children),
  SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => createElement('button', { id }, children),
  SelectValue: ({ children }: { children: (value: string) => ReactNode }) => children(''),
  SelectContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => createElement('div', { 'data-preset': value }, children),
}));

import {
  AiInstructionControls, CUSTOM_INSTRUCTION_LABEL, CUSTOM_INSTRUCTION_PLACEHOLDER,
  SYSTEM_INSTRUCTION_BUTTON_LABEL, SYSTEM_INSTRUCTION_BEGINNER_HINT, customInstructionForPayload,
} from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/AiInstructionControls';
import type { PresetLevel } from '@/lib/ai/prompt';

function render(presetLevel: PresetLevel, customInstruction = '짧게 써줘') {
  return renderToStaticMarkup(createElement(AiInstructionControls, {
    presetLevel, onPresetChange: () => {}, customInstruction,
    onCustomInstructionChange: () => {}, onOpenSystemInstruction: () => {},
  }));
}

const gearTag = (html: string) => {
  const match = html.match(new RegExp(`<button[^>]*aria-label="${SYSTEM_INSTRUCTION_BUTTON_LABEL}"[^>]*>`));
  if (!match) throw new Error('gear button missing');
  return match[0];
};

describe('AiInstructionControls (04-10 Task 1)', () => {
  it('renders the preset as a labeled dropdown with all three levels', () => {
    const html = render('intermediate');
    expect(html).toContain('AI 지시 프리셋');
    expect(html).toContain('data-preset-select="intermediate"');
    for (const level of ['beginner', 'intermediate', 'freeform']) expect(html).toContain(`data-preset="${level}"`);
  });

  it('shows the inline custom instruction textarea only for freeform', () => {
    const html = render('freeform');
    expect(html).toContain(CUSTOM_INSTRUCTION_LABEL);
    expect(html).toContain(`placeholder="${CUSTOM_INSTRUCTION_PLACEHOLDER}"`);
    expect(html).toMatch(/<textarea[^>]*maxLength="4000"/);
    expect(html).toContain('짧게 써줘');
    // textarea comes after the preset dropdown (inline, directly below the preset row)
    expect(html.indexOf('<textarea')).toBeGreaterThan(html.indexOf('data-preset-select'));
  });

  it.each(['beginner', 'intermediate'] as const)('renders no textarea for %s', (level) => {
    const html = render(level);
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain(CUSTOM_INSTRUCTION_LABEL);
  });

  it('has a separate gear button that is disabled with a reason only for beginner', () => {
    const beginner = render('beginner');
    expect(gearTag(beginner)).toMatch(/\sdisabled=""/);
    expect(beginner).toContain(SYSTEM_INSTRUCTION_BEGINNER_HINT);
    expect(gearTag(beginner)).toContain('aria-describedby=');
    for (const level of ['intermediate', 'freeform'] as const) {
      const html = render(level);
      expect(gearTag(html)).not.toMatch(/\sdisabled=""/);
      expect(html).not.toContain(SYSTEM_INSTRUCTION_BEGINNER_HINT);
    }
  });

  it('customInstructionForPayload sends the value only for a non-blank freeform input', () => {
    expect(customInstructionForPayload('freeform', '대사 위주로')).toBe('대사 위주로');
    expect(customInstructionForPayload('freeform', '   ')).toBeNull();
    expect(customInstructionForPayload('intermediate', '대사 위주로')).toBeNull();
    expect(customInstructionForPayload('beginner', '대사 위주로')).toBeNull();
  });
});

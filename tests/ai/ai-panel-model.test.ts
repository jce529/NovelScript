import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => createElement('div', { 'data-model': value }, children),
}));
vi.mock('@/components/ui/dropdown-menu', () => Object.fromEntries([
  'DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuContent', 'DropdownMenuLabel',
  'DropdownMenuGroup', 'DropdownMenuRadioGroup', 'DropdownMenuRadioItem', 'DropdownMenuSeparator',
].map((name) => [name, ({ children }: { children?: ReactNode }) => createElement('div', null, children)])));
vi.mock('@/app/studio/[workId]/chapters/[chapterId]/actions', () => ({ chatAction: vi.fn() }));

import { AiPanel } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel';

describe('AI panel model picker', () => {
  it('shows every configured provider and real model name with a per-send hint', () => {
    const html = renderToStaticMarkup(createElement(AiPanel, {
      workId: 'work', chapterId: 'chapter', content: '', defaultGenre: null,
      mentionedNodes: [], onRemoveMention: () => {}, onAddMention: () => {}, onInsertText: () => {},
    }));
    expect(html).toContain('data-model="gemini:gemini-3.5-flash"');
    expect(html).toContain('data-model="openai:gpt-4o-mini"');
    expect(html).toContain('data-model="anthropic:claude-sonnet-5"');
    expect(html).toContain('이번 전송에만 적용돼요');
    expect(html).toContain('입력 1,000 + 출력 1,000 토큰 기준');
  });
});

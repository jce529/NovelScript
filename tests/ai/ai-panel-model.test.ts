import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value }: { children: ReactNode; value: string }) => createElement('div', { 'data-selected-model': value }, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  SelectValue: ({ children }: { children: (value: string) => ReactNode }) => children('openai:gpt-4o-mini:byok'),
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
      defaultProviderId: 'gemini', defaultModel: 'gemini-3.5-flash', defaultKeySource: 'service', byokModels: {},
      mentionedNodes: [], onRemoveMention: () => {}, onAddMention: () => {}, onInsertText: () => {},
    }));
    expect(html).toContain('data-model="gemini:gemini-3.5-flash:service"');
    expect(html).toContain('data-model="openai:gpt-4o-mini:service"');
    expect(html).toContain('data-model="anthropic:claude-sonnet-5:service"');
    expect(html).toContain('이 대화가 끝날 때까지 유지돼요');
    expect(html).toContain('입력 1,000 + 출력 1,000 토큰 기준');
  });

  it('starts with the saved account default and shows its settings link', () => {
    const html = renderToStaticMarkup(createElement(AiPanel, {
      workId: 'work', chapterId: 'chapter', content: '', defaultGenre: null,
      defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'service', byokModels: {},
      mentionedNodes: [], onRemoveMention: () => {}, onAddMention: () => {}, onInsertText: () => {},
    }));
    expect(html).toContain('data-selected-model="openai:gpt-4o-mini:service"');
    expect(html).toContain('계정 기본값');
    expect(html).toContain('/studio/settings/ai-providers');
  });
  const baseProps = {
    workId: 'work', chapterId: 'chapter', content: '', defaultGenre: null,
    mentionedNodes: [], onRemoveMention: () => {}, onAddMention: () => {}, onInsertText: () => {},
  };
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(AiPanel, { ...baseProps, ...props } as never));
  const serviceDefault = { defaultProviderId: 'gemini', defaultModel: 'gemini-3.5-flash', defaultKeySource: 'service' };
  const withKey = { byokModels: { openai: ['gpt-4o-mini'] } };

  it('renders the three provider group headers and their item counts match the rendered items', () => {
    const html = render({ ...serviceDefault, ...withKey });
    for (const label of ['Google Gemini', 'OpenAI', 'Anthropic']) expect(html).toContain(`<span>${label}</span>`);
    const counts = [...html.matchAll(/<span>(\d+)개<\/span>/g)].map((m) => Number(m[1]));
    expect(counts).toHaveLength(3);
    expect(counts.reduce((a, b) => a + b, 0)).toBe([...html.matchAll(/data-model="(?:gemini|openai|anthropic):/g)].length);
  });

  it('shows only service-key items when no BYOK key is connected', () => {
    const html = render({ ...serviceDefault, byokModels: {} });
    expect(html).not.toContain(':byok"');
    expect(html).toContain('서비스 키');
    expect(html).not.toContain('>BYOK<');
  });

  it('adds a BYOK item right after the same model service item, kept as a separate entry', () => {
    const html = render({ ...serviceDefault, ...withKey });
    const service = html.indexOf('data-model="openai:gpt-4o-mini:service"');
    const byok = html.indexOf('data-model="openai:gpt-4o-mini:byok"');
    expect(service).toBeGreaterThan(-1);
    expect(byok).toBeGreaterThan(service);
    const between = html.slice(service, byok);
    expect(between.match(/data-model="(?:gemini|openai|anthropic):/g)).toHaveLength(1);
  });

  it('never offers a BYOK item for a model outside the connected key intersection', () => {
    const html = render({ ...serviceDefault, byokModels: { openai: ['not-in-catalog'] } });
    expect(html).not.toContain(':byok"');
  });

  it('shows the Phase 10 send boundary hint only while a BYOK model is selected', () => {
    const byokHtml = render({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok', ...withKey });
    expect(byokHtml).toContain('BYOK 모델 호출은 아직 준비 중이에요');
    expect(render({ ...serviceDefault, ...withKey })).not.toContain('BYOK 모델 호출은 아직 준비 중이에요');
  });
});

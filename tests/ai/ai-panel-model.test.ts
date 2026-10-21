import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * 04-10 Task 3: a tiny hook harness. While `hooks.harness` is set, AiPanel's useState/useRef/
 * useEffect run against stable slots so the test can call its real handlers (send, Enter,
 * retry, explicit service-key consent) and re-render to read the resulting props. SSR tests
 * (harness null) delegate to the real React hooks.
 */
const hooks = vi.hoisted(() => ({ harness: null as null | Record<string, (...args: never[]) => unknown> }));
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  const wrap = <K extends 'useState' | 'useRef' | 'useEffect'>(name: K) =>
    ((...args: unknown[]) => (hooks.harness ? hooks.harness[name](...(args as never[])) : (real[name] as (...a: unknown[]) => unknown)(...args))) as typeof real[K];
  return { ...real, default: real, useState: wrap('useState'), useRef: wrap('useRef'), useEffect: wrap('useEffect') };
});

const avail = vi.hoisted(() => ({
  status: 'ready' as 'loading' | 'ready' | 'error',
  availability: { gemini: true, openai: true, anthropic: true } as { gemini: boolean; openai: boolean; anthropic: boolean } | null,
  reload: (() => {}) as () => void,
}));
vi.mock('@/lib/ai/providers/use-service-availability', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/providers/use-service-availability')>();
  return {
    ...real,
    useServiceAvailability: () => ({
      availability: avail.status === 'ready' ? avail.availability : null,
      status: avail.status,
      reload: avail.reload,
      canUseSelection: (selection: Parameters<typeof real.canUseSelectionWith>[1]) =>
        (avail.status === 'ready' ? real.canUseSelectionWith(avail.availability, selection) : selection.keySource === 'byok'),
    }),
  };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));
vi.mock('@/app/studio/[workId]/ai-settings-actions', () => ({
  loadWorkSystemInstructionAction: vi.fn(), saveWorkSystemInstructionAction: vi.fn(),
}));
vi.mock('@/app/studio/settings/ai-providers/model-availability-actions', () => ({ getServiceAvailabilityAction: vi.fn() }));
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
import { ChatMessageBubble } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/ChatMessageBubble';
import { AiPanelNotice } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice';
import { AiInstructionControls } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/AiInstructionControls';
import { chatAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';
import { ModelPicker, PICKER_ERROR_MESSAGE, PICKER_LOADING_MESSAGE } from '@/components/ai/model-picker';
import { toast } from 'sonner';
import { CAPPED_COPY, type ChatResult } from '@/lib/ai/chat-result';

type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function walk(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => walk(child, out));
  else if (node && typeof node === 'object' && 'props' in node) {
    out.push(node as El);
    walk((node as El).props.children, out);
  }
  return out;
}

function mountPanel(props: Record<string, unknown>) {
  const states: unknown[] = [];
  const refs: { current: unknown }[] = [];
  let si = 0;
  let ri = 0;
  const harness = {
    useState: (init: unknown) => {
      const idx = si++;
      if (!(idx in states)) states[idx] = typeof init === 'function' ? (init as () => unknown)() : init;
      const set = (value: unknown) => { states[idx] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(states[idx]) : value; };
      return [states[idx], set];
    },
    useRef: (init: unknown) => { const idx = ri++; return (refs[idx] ??= { current: init }); },
    useEffect: () => {},
  };
  const render = () => {
    si = 0; ri = 0;
    hooks.harness = harness as never;
    try { return walk(AiPanel({ ...baseHarnessProps, ...props } as never)); } finally { hooks.harness = null; }
  };
  const find = (pred: (el: El) => boolean) => render().filter(pred);
  const input = () => find((el) => el.props.placeholder === 'AI에게 메시지 보내기')[0];
  const sendButton = () => find((el) => el.props.children === '보내기')[0];
  return {
    render, find, input, sendButton,
    type(text: string) { (input().props.onChange as (e: unknown) => void)({ target: { value: text } }); },
    pressEnter() { (input().props.onKeyDown as (e: unknown) => void)({ key: 'Enter' }); },
    picker: () => find((el) => el.type === ModelPicker)[0],
    bubbles: () => find((el) => el.type === ChatMessageBubble),
    notice: () => find((el) => el.type === AiPanelNotice)[0],
    controls: () => find((el) => el.type === AiInstructionControls)[0],
    blocked: () => find((el) => el.props['data-selection-blocked'] !== undefined)[0],
  };
}
const baseHarnessProps = {
  workId: 'work', chapterId: 'chapter', content: '', defaultGenre: null, byokModels: { openai: ['gpt-4o-mini'] },
  defaultProviderId: 'gemini', defaultModel: 'gemini-3.5-flash', defaultKeySource: 'service',
  mentionedNodes: [], onRemoveMention: () => {}, onAddMention: () => {}, onInsertText: () => {},
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const chatMock = vi.mocked(chatAction);
const completed = (extra: Partial<ChatResult> = {}): ChatResult => ({ ok: true, status: 'completed', reply: '응답', ...extra });

beforeEach(() => {
  avail.status = 'ready';
  avail.availability = { gemini: true, openai: true, anthropic: true };
  chatMock.mockReset();
  vi.mocked(toast).mockClear();
});

describe('AiPanel consumes the Phase 10 picker/availability contract (04-10 Task 3)', () => {
  it('passes loading / error state to ModelPicker and keeps the account default box', () => {
    avail.status = 'loading';
    let html = renderToStaticMarkup(createElement(AiPanel, baseHarnessProps as never));
    expect(html).toContain(PICKER_LOADING_MESSAGE);
    avail.status = 'error';
    html = renderToStaticMarkup(createElement(AiPanel, baseHarnessProps as never));
    expect(html).toContain(PICKER_ERROR_MESSAGE);
    expect(html).toContain('계정 기본값');
    const panel = mountPanel({});
    expect(panel.picker().props).toMatchObject({ loading: false, loadFailed: true, value: 'gemini:gemini-3.5-flash:service' });
  });

  it.each([
    ['loading', null],
    ['error', null],
    ['ready', { gemini: false, openai: true, anthropic: true }],
  ] as const)('blocks send button and Enter for an unusable service selection (%s)', (status, availability) => {
    avail.status = status;
    if (availability) avail.availability = { ...availability };
    const panel = mountPanel({});
    panel.type('이어줘');
    expect(panel.sendButton().props.disabled).toBe(true);
    panel.pressEnter();
    expect(chatMock).not.toHaveBeenCalled();
    expect(panel.blocked()).toBeDefined();
  });

  it('BYOK selection is independent of service availability', async () => {
    avail.status = 'error';
    chatMock.mockResolvedValueOnce(completed());
    const panel = mountPanel({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok' });
    panel.type('이어줘');
    expect(panel.sendButton().props.disabled).toBe(false);
    panel.pressEnter();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(chatMock.mock.calls[0][0]).toMatchObject({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
  });

  it('picker selection updates the panel selection (provider/model/keySource)', () => {
    const panel = mountPanel({});
    (panel.picker().props.onSelection as (s: unknown) => void)({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
    expect(panel.picker().props.value).toBe('openai:gpt-4o-mini:byok');
  });

  it('retry checks the frozen attempt selection, not the current UI selection', async () => {
    chatMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind: 'unavailable' });
    const panel = mountPanel({});
    panel.type('이어줘');
    panel.pressEnter();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(1);
    const key = chatMock.mock.calls[0][0].idempotencyKey;
    // The service key for the frozen selection disappears, and the writer switches the UI to a BYOK model.
    avail.availability = { gemini: false, openai: true, anthropic: true };
    (panel.picker().props.onSelection as (s: unknown) => void)({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
    (panel.notice().props.onRetry as () => void)();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(panel.blocked()).toBeDefined();
    expect(panel.picker().props.value).toBe('openai:gpt-4o-mini:byok');
    // Availability returns: the retry replays the frozen gemini/service snapshot with the same key.
    avail.availability = { gemini: true, openai: true, anthropic: true };
    chatMock.mockResolvedValueOnce(completed());
    (panel.notice().props.onRetry as () => void)();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[1][0]).toMatchObject({ providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service', idempotencyKey: key });
  });

  it('a frozen BYOK attempt still retries while the current UI service selection is unavailable', async () => {
    chatMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind: 'unavailable' });
    const panel = mountPanel({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok' });
    panel.type('이어줘');
    panel.pressEnter();
    await flush();
    avail.availability = { gemini: false, openai: false, anthropic: false };
    (panel.picker().props.onSelection as (s: unknown) => void)({ providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' });
    chatMock.mockResolvedValueOnce(completed());
    (panel.notice().props.onRetry as () => void)();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[1][0]).toMatchObject({ keySource: 'byok' });
  });

  it('explicit service-key replacement checks the replacement service and changes nothing while unavailable', async () => {
    chatMock.mockResolvedValueOnce({
      ok: false, status: 'failed', kind: 'replacement_required', failureKind: 'unavailable',
      original: { providerId: 'openai', model: 'gpt-4o-mini' },
      replacement: { providerId: 'anthropic', model: 'claude-sonnet-5', keySource: 'service' },
    });
    const panel = mountPanel({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok' });
    panel.type('이어줘');
    panel.pressEnter();
    await flush();
    avail.availability = { gemini: true, openai: true, anthropic: false };
    (panel.notice().props.onUseServiceKey as () => void)();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(panel.picker().props.value).toBe('openai:gpt-4o-mini:byok');
    expect(panel.blocked()).toBeDefined();
    avail.availability = { gemini: true, openai: true, anthropic: true };
    chatMock.mockResolvedValueOnce(completed());
    (panel.notice().props.onUseServiceKey as () => void)();
    await flush();
    expect(chatMock).toHaveBeenCalledTimes(2);
    expect(chatMock.mock.calls[1][0]).toMatchObject({
      providerId: 'openai', keySource: 'byok', replacementConsent: true,
      replacementSelection: { providerId: 'anthropic', model: 'claude-sonnet-5', keySource: 'service' },
    });
  });
});

describe('AiPanel consumes the Phase 11 capped result contract (04-10 Task 3)', () => {
  async function sendWith(result: ChatResult, props: Record<string, unknown> = {}) {
    chatMock.mockResolvedValueOnce(result);
    const panel = mountPanel(props);
    panel.type('이어줘');
    panel.pressEnter();
    await flush();
    return panel;
  }

  it.each(['balance', 'thinking', 'request_limit'] as const)('%s: reason reaches the bubble and the reason-specific toast', async (reason) => {
    const panel = await sendWith(completed({ wasCapped: true, cappedReason: reason }));
    const [bubble] = panel.bubbles();
    expect(bubble.props).toMatchObject({ wasCapped: true, cappedReason: reason });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(CAPPED_COPY[reason].toast);
  });

  it('BYOK 8192 request limit uses the request_limit copy, not the balance copy', async () => {
    const panel = await sendWith(completed({ wasCapped: true, cappedReason: 'request_limit' }),
      { defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok' });
    expect(panel.bubbles()[0].props).toMatchObject({ wasCapped: true, cappedReason: 'request_limit' });
    expect(toast).toHaveBeenCalledWith(CAPPED_COPY.request_limit.toast);
    expect(toast).not.toHaveBeenCalledWith(CAPPED_COPY.balance.toast);
  });

  it('a normal stop has no cap marker and no toast', async () => {
    const panel = await sendWith(completed({ wasCapped: false }));
    expect(panel.bubbles()[0].props.wasCapped).toBe(false);
    expect(panel.bubbles()[0].props.cappedReason).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe('AiPanel freeform instruction snapshot through real handlers (04-10 Task 1)', () => {
  it('sends the current freeform input, retries the frozen one, and drops it for other presets', async () => {
    chatMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind: 'unavailable' });
    const panel = mountPanel({});
    (panel.controls().props.onPresetChange as (l: string) => void)('freeform');
    (panel.controls().props.onCustomInstructionChange as (v: string) => void)('1인칭으로');
    panel.type('이어줘');
    panel.pressEnter();
    await flush();
    expect(chatMock.mock.calls[0][0]).toMatchObject({ presetLevel: 'freeform', customInstruction: '1인칭으로' });
    (panel.controls().props.onCustomInstructionChange as (v: string) => void)('3인칭으로');
    chatMock.mockResolvedValueOnce(completed());
    (panel.notice().props.onRetry as () => void)();
    await flush();
    expect(chatMock.mock.calls[1][0]).toMatchObject({ customInstruction: '1인칭으로' });
    (panel.controls().props.onPresetChange as (l: string) => void)('intermediate');
    expect(panel.controls().props.customInstruction).toBe('3인칭으로');
    chatMock.mockResolvedValueOnce(completed());
    panel.type('다음');
    panel.pressEnter();
    await flush();
    expect(chatMock.mock.calls[2][0]).toMatchObject({ presetLevel: 'intermediate', customInstruction: null });
  });
});

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

  it('shows the no-wallet BYOK hint and hides example wallet cost only while BYOK is selected', () => {
    const byokHtml = render({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok', ...withKey });
    expect(byokHtml).toContain('내 키로 호출해요 · 지갑 토큰은 차감되지 않아요');
    expect(byokHtml).not.toContain('입력 1,000 + 출력 1,000 토큰 기준');
    const serviceHtml = render({ ...serviceDefault, ...withKey });
    expect(serviceHtml).not.toContain('내 키로 호출해요 · 지갑 토큰은 차감되지 않아요');
    expect(serviceHtml).toContain('입력 1,000 + 출력 1,000 토큰 기준');
  });

  describe('default model fallback notice (BUG-02)', () => {
    const svc = { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' };
    const consent = { reason: 'byok_key_missing', original: { ...svc, keySource: 'byok' }, suggested: svc, requiresConsent: true };
    const sendDisabled = (html: string) => /<input[^>]*\sdisabled(=""|\s|>)/.test(html);

    it('shows nothing when there is no fallback', () => {
      const html = render({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'service', byokModels: {}, defaultFallback: null });
      expect(html).not.toContain('data-fallback-reason');
      expect(sendDisabled(html)).toBe(false);
    });

    it('shows reason, settings link and a consent choice, and blocks sending until resolved', () => {
      const html = render({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'service', byokModels: {}, defaultFallback: consent });
      expect(html).toContain('data-fallback-reason="byok_key_missing"');
      expect(html).toContain('[내 키]를 쓸 수 없어요');
      expect(html).toContain('서비스 키로 계속 (지갑 토큰 차감)');
      expect(html).toContain('다른 모델 고르기');
      expect(html).toContain('href="/studio/settings/ai-providers"');
      expect(sendDisabled(html)).toBe(true);
    });

    it('keeps the account default box on the original BYOK setting while the notice is shown', () => {
      const html = render({ defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'service', byokModels: {}, defaultFallback: consent });
      const box = html.slice(html.indexOf('계정 기본값'), html.indexOf('설정에서 변경'));
      expect(box).toContain('BYOK');
      expect(box).not.toContain('서비스 키');
    });

    it('shows a dismissable banner without blocking when no cost owner change is involved', () => {
      const html = render({ ...serviceDefault, byokModels: {}, defaultFallback: { reason: 'model_retired', original: null, suggested: { providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' }, requiresConsent: false } });
      expect(html).toContain('data-fallback-reason="model_retired"');
      expect(html).toContain('기본 모델이 바뀌어 있어요');
      expect(html).not.toContain('서비스 키로 계속');
      expect(sendDisabled(html)).toBe(false);
    });
  });
});

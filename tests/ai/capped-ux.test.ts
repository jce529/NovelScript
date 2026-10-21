import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 11-13 Task 1 (PROV-06/BYOK-05/BYOK-09): real chat() result -> chatAction -> real AiPanel send handler
 * -> ChatMessageBubble props + sonner toast. The chat result is produced by the real chat() (fake ledger
 * admin + mock provider); the Server Action is replaced by a passthrough of that result. Hook harness as in
 * ai-panel-model.test.ts (vi.mock('react') pass-through of useState/useRef/useEffect).
 */
const hooks = vi.hoisted(() => ({ harness: null as null | Record<string, (...args: never[]) => unknown> }));
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  const wrap = <K extends 'useState' | 'useRef' | 'useEffect'>(name: K) =>
    ((...args: unknown[]) => (hooks.harness ? hooks.harness[name](...(args as never[])) : (real[name] as (...a: unknown[]) => unknown)(...args))) as typeof real[K];
  return { ...real, default: real, useState: wrap('useState'), useRef: wrap('useRef'), useEffect: wrap('useEffect') };
});

const adminState = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminState.client }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: async () => [] }));
vi.mock('@/lib/ai/usage', () => ({ recordAiUsage: async () => ({ ok: true }) }));

vi.mock('@/lib/ai/providers/use-service-availability', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/providers/use-service-availability')>();
  return {
    ...real,
    useServiceAvailability: () => ({
      availability: { gemini: true, openai: true, anthropic: true }, status: 'ready', reload: () => {},
      canUseSelection: () => true,
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
import { chatAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';
import { toast } from 'sonner';
import { chat, type ChatInput } from '@/lib/ai/chat';
import { CAPPED_COPY, type CappedReason, type ChatResult } from '@/lib/ai/chat-result';
import type { GenerateResult, ProviderClient } from '@/lib/ai/providers/types';
import type { GenerationRoute } from '@/lib/ai/providers/byok';
import { createFakeLedgerAdmin } from '../helpers/fake-ledger-admin';
import { createMockProvider, okResult } from '../helpers/mock-provider';

type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function walk(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => walk(child, out));
  else if (node && typeof node === 'object' && 'props' in node) {
    out.push(node as El);
    walk((node as El).props.children, out);
  }
  return out;
}

const baseHarnessProps = {
  workId: 'work', chapterId: 'chapter', content: '', defaultGenre: null, byokModels: { openai: ['gpt-4o-mini'] },
  defaultProviderId: 'gemini', defaultModel: 'gemini-3.5-flash', defaultKeySource: 'service',
  mentionedNodes: [], onRemoveMention: () => {}, onAddMention: () => {}, onInsertText: () => {},
};

function mountPanel(props: Record<string, unknown> = {}) {
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
  return {
    bubbles: () => find((el) => el.type === ChatMessageBubble),
    notices: () => find((el) => el.type === AiPanelNotice),
    type(text: string) { (input().props.onChange as (e: unknown) => void)({ target: { value: text } }); },
    pressEnter() { (input().props.onKeyDown as (e: unknown) => void)({ key: 'Enter' }); },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const chatMock = vi.mocked(chatAction);

// ── real chat() ─────────────────────────────────────────────────────────────
const OWNER = '10000000-0000-4000-8000-000000000013';
const chatBase: ChatInput = {
  ownerId: OWNER, workId: '20000000-0000-4000-8000-000000000013', chapterId: '30000000-0000-4000-8000-000000000013',
  providerId: 'gemini', model: 'gemini-3.5-flash', mentionedNodeIds: [], presetLevel: 'beginner', styleId: 'concise-hemingway',
  genre: '판타지', precedingText: '어느 날', chatHistory: [{ role: 'user', content: '이어서 써줘' }], idempotencyKey: '',
};
const session = {
  rpc: async () => ({ data: { can_write: true, reason: 'ok', sanctioned_until: null }, error: null }),
} as unknown as SupabaseClient;
const gen = (finishReason: GenerateResult['finishReason'], outputTokens: number, thoughtsTokens: number | null): GenerateResult =>
  ({ ...okResult('[REPLY]\n잘린 응답', 10, outputTokens, thoughtsTokens), finishReason });

async function realChat(kind: 'service' | 'byok', balance: number, result: GenerateResult): Promise<ChatResult> {
  adminState.client = createFakeLedgerAdmin({ balances: { [OWNER]: balance } }).client;
  const input = { ...chatBase, idempotencyKey: crypto.randomUUID() };
  if (kind === 'service') {
    const provider = createMockProvider({ generateContent: async () => result });
    return (await chat(session, provider as unknown as ProviderClient, input)) as ChatResult;
  }
  const route: GenerationRoute = {
    kind: 'byok', keyId: 'key-1', selection: { providerId: 'gemini', model: 'gemini-3.5-flash' } as never,
    client: createMockProvider({ generateContent: async () => result }) as unknown as ProviderClient,
  };
  return (await chat(session, createMockProvider() as unknown as ProviderClient, { ...input, route })) as ChatResult;
}

async function sendResult(chatResult: ChatResult, props: Record<string, unknown> = {}) {
  chatMock.mockResolvedValueOnce(chatResult as never);
  const panel = mountPanel(props);
  panel.type('이어줘');
  panel.pressEnter();
  await flush();
  expect(chatMock).toHaveBeenCalledTimes(1);
  return panel;
}

beforeEach(() => {
  chatMock.mockReset();
  vi.mocked(toast).mockClear();
});

describe('chat() capped result -> AiPanel bubble + toast (11-13 Task 1)', () => {
  it.each([
    ['service', 1, gen('max_tokens', 5, 50), 'balance'],
    ['service', 100000, gen('max_tokens', 300, 300), 'thinking'],
    ['service', 100000, gen('max_tokens', 2048, null), 'request_limit'],
    ['byok', 0, gen('max_tokens', 8192, 0), 'request_limit'],
    ['byok', 0, gen('max_tokens', 100, 8000), 'thinking'],
  ] as const)('%s balance %i -> %s reaches the real bubble and reason-specific toast', async (kind, balance, result, reason: CappedReason) => {
    const chatResult = await realChat(kind, balance, result);
    expect(chatResult).toMatchObject({ status: 'completed', wasCapped: true, cappedReason: reason });
    const panel = await sendResult(chatResult, kind === 'byok'
      ? { defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok' } : {});
    const [bubble] = panel.bubbles();
    expect(bubble.props).toMatchObject({ wasCapped: true, cappedReason: reason });
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(CAPPED_COPY[reason].toast);
    if (reason !== 'balance') expect(toast).not.toHaveBeenCalledWith(CAPPED_COPY.balance.toast);
  });

  it.each([['service', 1], ['byok', 0]] as const)('%s normal stop has no cap marker, no toast and no notice', async (kind, balance) => {
    const chatResult = await realChat(kind, balance, gen('stop', 10, 500));
    expect(chatResult.wasCapped).toBe(false);
    const panel = await sendResult(chatResult, kind === 'byok'
      ? { defaultProviderId: 'openai', defaultModel: 'gpt-4o-mini', defaultKeySource: 'byok' } : {});
    expect(panel.bubbles()[0].props.wasCapped).toBe(false);
    expect(panel.bubbles()[0].props.cappedReason).toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
    expect(panel.notices()).toHaveLength(0);
  });

  it('an old capped result without a reason falls back to the balance copy', async () => {
    const panel = await sendResult({ ok: true, status: 'completed', reply: '응답', wasCapped: true });
    expect(toast).toHaveBeenCalledWith(CAPPED_COPY.balance.toast);
    expect(panel.bubbles()[0].props.wasCapped).toBe(true);
  });

  it('an insufficient-balance failure keeps its failure notice and shows no capped toast or bubble', async () => {
    const panel = await sendResult({ ok: false, status: 'failed', failureKind: 'insufficient_balance' });
    expect(toast).not.toHaveBeenCalled();
    expect(panel.notices().length).toBeGreaterThan(0);
    expect(panel.bubbles().every((b) => !b.props.wasCapped)).toBe(true);
  });
});

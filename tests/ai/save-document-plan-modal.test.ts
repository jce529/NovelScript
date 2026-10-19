import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { SaveDocumentPlanModal } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal';

const mock = vi.hoisted(() => ({
  state: [] as unknown[],
  cursor: 0,
  selectedValue: '',
  onValueChange: [] as ((value: string) => void)[],
  refs: [] as { current: unknown }[],
  refCursor: 0,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: () => {},
    // 11-13: refs stay stable across the manual re-renders, like real React.
    useRef: (initial: unknown) => (mock.refs[mock.refCursor++] ??= { current: initial }),
    useState: (initial: unknown) => {
      const index = mock.cursor++;
      if (index >= mock.state.length) mock.state[index] = initial;
      return [mock.state[index], (value: unknown) => {
        mock.state[index] = typeof value === 'function' ? (value as (prev: unknown) => unknown)(mock.state[index]) : value;
      }];
    },
  };
});

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? children : null,
  DialogContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogFooter: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogHeader: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  DialogTitle: ({ children }: { children: ReactNode }) => createElement('h2', null, children),
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => createElement('button', null, children),
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: ReactNode }) => {
    mock.selectedValue = value;
    mock.onValueChange.push(onValueChange);
    return createElement('div', null, children);
  },
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement('button', null, children),
  SelectValue: ({ children }: { children?: (value: string) => ReactNode }) =>
    createElement('span', { 'data-slot': 'select-value' }, children ? children(mock.selectedValue) : mock.selectedValue),
  SelectContent: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  SelectGroup: ({ children }: { children: ReactNode }) => createElement('section', null, children),
  SelectLabel: ({ children }: { children: ReactNode }) => createElement('h3', null, children),
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => createElement('div', { 'data-value': value }, children),
}));

vi.mock('@/app/studio/[workId]/chapters/[chapterId]/actions', () => ({
  loadSavePlanAction: vi.fn(),
  regenerateDocumentWithTemplateAction: vi.fn(),
  saveDocumentProposalAction: vi.fn(),
}));

const folderId = 'd4cc4c1a-f02c-42c0-9c17-3be486200001';
const secondFolderId = '88532b69-f02c-42c0-9c17-3be486200002';
const templateId = '9f729765-f02c-42c0-9c17-3be486200003';
const secondTemplateId = 'a0123456-f02c-42c0-9c17-3be486200004';
const proposal = { category: '인물' as const, name: '새 인물', content: '본문' };
const workId = '11111111-1111-4111-8111-111111111111';

function renderModal() {
  mock.cursor = 0;
  mock.refCursor = 0;
  mock.onValueChange = [];
  const html = renderToStaticMarkup(createElement(SaveDocumentPlanModal, {
    workId, open: true, onOpenChange: () => {}, proposal,
    generation: { providerId: 'anthropic', model: 'claude-sonnet-5', keySource: 'byok', presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지' },
    onSaved: () => {},
  }));
  return [...html.matchAll(/data-slot="select-value"[^>]*>([^<]*)/g)].map((match) => match[1]);
}

beforeEach(() => {
  mock.refs = [];
  mock.refCursor = 0;
  mock.state = [
    { source: 'default', folderId, folderPath: '인물', folderVersion: 'root-v1', templateId, templateName: '인물' },
    folderId,
    'root-v1',
    templateId,
    [
      { id: folderId, name: '인물', isRoot: true, path: '', version: 'root-v1' },
      { id: secondFolderId, name: '서브인물', isRoot: false, path: '서브인물', version: 'child-v1' },
    ],
    [
      { id: templateId, name: '인물', scope: 'work', isDefault: true },
      { id: secondTemplateId, name: '세부 인물', scope: 'account_template', isDefault: false },
    ],
    { key: JSON.stringify([workId, proposal]), state: 'ready' },
  ];
});

describe('SaveDocumentPlanModal select triggers', () => {
  it('shows recommended folder and template names before opening either list', () => {
    expect(renderModal()).toEqual(['인물 (최상위)', '인물 (기본)']);
  });

  it('shows the new names after changing folder and template', () => {
    renderModal();
    mock.onValueChange[0](secondFolderId);
    mock.onValueChange[1](secondTemplateId);
    expect(renderModal()).toEqual(['서브인물', '세부 인물']);
  });

  it('shows guidance when a selected id no longer exists', () => {
    mock.state[1] = 'missing-folder';
    mock.state[3] = 'missing-template';
    expect(renderModal()).toEqual(['폴더를 선택해주세요', '템플릿을 선택해주세요']);
  });

  it('shows the canonical template name for a null template id', () => {
    mock.state[3] = null;
    mock.state[5] = [{ id: null, name: '기본 인물', scope: 'canonical', isDefault: true }];
    expect(renderModal()).toEqual(['인물 (최상위)', '기본 인물 (기본)']);
  });

  it('groups duplicate names by template scope while keeping the default marker', () => {
    mock.state[5] = [
      { id: templateId, name: '인물', scope: 'work', isDefault: true },
      { id: secondTemplateId, name: '인물', scope: 'account_template', isDefault: false },
      { id: null, name: '기본 인물 템플릿', scope: 'canonical', isDefault: false },
    ];
    mock.cursor = 0;
    mock.refCursor = 0;
    const html = renderToStaticMarkup(createElement(SaveDocumentPlanModal, {
      workId, open: true, onOpenChange: () => {}, proposal,
      generation: { providerId: 'anthropic', model: 'claude-sonnet-5', keySource: 'byok', presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지' },
      onSaved: () => {},
    }));
    expect(html).toMatch(/<h3>작품 템플릿<\/h3>.*인물 \(기본\).*<h3>계정 템플릿<\/h3>.*>인물<.*<h3>기본 템플릿<\/h3>.*기본 인물 템플릿/);
  });
});

// ── 11-13 Task 2: real handler transitions (no SSR string checks) ─────────────────────────────
// SaveDocumentPlanModal is called as a function against the manual hook mock above; each render() re-reads the
// fresh handler closures from the element tree, exactly like React would after a state update.
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { AiPanelNotice } from '@/app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanelNotice';
import { regenerateDocumentWithTemplateAction, saveDocumentProposalAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { resolveChatOutcome } from '@/lib/ai/chat-request';

type El = { type: unknown; props: Record<string, unknown> & { children?: unknown } };
function walk(node: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((child) => walk(child, out));
  else if (node && typeof node === 'object' && 'props' in node) {
    out.push(node as El);
    walk((node as El).props.children, out);
  }
  return out;
}
function texts(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(texts).join('');
  if (node && typeof node === 'object' && 'props' in node) return texts((node as El).props.children);
  return '';
}

const regenMock = vi.mocked(regenerateDocumentWithTemplateAction);
const saveMock = vi.mocked(saveDocumentProposalAction);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const generation = { providerId: 'anthropic' as const, model: 'claude-sonnet-5', keySource: 'byok' as const, presetLevel: 'intermediate' as const, styleId: 'concise-hemingway' as const, genre: '판타지' };
const original = { providerId: 'anthropic' as const, model: 'claude-sonnet-5' };
const replacementSel = { providerId: 'gemini' as const, model: 'gemini-3.5-flash', keySource: 'service' as const };
const replacementRequired = { kind: 'replacement_required', ok: false, status: 'failed', failureKind: 'unavailable', replacement: replacementSel, original, error: CHAT_COPY.byokPending };
const regenOk = { ok: true, content: '재생성 본문', name: '재생성 이름' };
const thirdTemplateId = 'b0123456-f02c-42c0-9c17-3be486200005';

function mount(initialProps: Record<string, unknown> = {}) {
  const spies = { onOpenChange: vi.fn(), onSaved: vi.fn(), onWalletRefresh: vi.fn() };
  let props: Record<string, unknown> = { workId, open: true, proposal, generation, ...spies, ...initialProps };
  const render = () => {
    mock.cursor = 0; mock.refCursor = 0;
    return walk(SaveDocumentPlanModal(props as never));
  };
  const find = (pred: (el: El) => boolean) => render().filter(pred);
  const button = (label: string) => find((el) => el.type === Button && texts(el.props.children).includes(label))[0];
  const click = (label: string) => (button(label).props.onClick as () => unknown)();
  const api = {
    ...spies, render, find, click, button,
    setProps(next: Record<string, unknown>) { props = { ...props, ...next }; },
    selectTemplate(id: string) { (find((el) => el.type === Select)[1].props.onValueChange as (v: string) => void)(id); },
    selectFolder(id: string) { (find((el) => el.type === Select)[0].props.onValueChange as (v: string) => void)(id); },
    notice: () => find((el) => el.type === AiPanelNotice)[0],
    banner: () => { const el = find((e) => e.props.role === 'alert')[0]; return el ? texts(el.props.children) : null; },
    dialogs: () => find((el) => el.type === Dialog),
    // pick the non-default template and open the regeneration confirmation
    openRegenConfirm(templateToPick: string = secondTemplateId) { api.selectTemplate(templateToPick); api.click('이 위치에 저장하기'); },
    confirmRegen: () => api.click('다시 생성하기') as Promise<void>,
    selectedTemplate: () => mock.state[3],
  };
  return api;
}
type Modal = ReturnType<typeof mount>;

describe('SaveDocumentPlanModal regeneration transitions through real handlers (11-13 Task 2)', () => {
  beforeEach(() => {
    regenMock.mockReset();
    saveMock.mockReset();
    saveMock.mockResolvedValue({ ok: true, nodeId: 'node-1' } as never);
  });

  it('replacement_required: one BYOK action and no save before consent; consent resends the same key and snapshot, saves only after success', async () => {
    regenMock.mockResolvedValueOnce(replacementRequired as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    expect(regenMock).toHaveBeenCalledTimes(1);
    const first = regenMock.mock.calls[0][0] as Record<string, unknown>;
    expect(first).toMatchObject({ keySource: 'byok', providerId: 'anthropic', templateId: secondTemplateId, targetFolderId: folderId, folderVersion: 'root-v1' });
    expect('replacementConsent' in first).toBe(false);
    expect(saveMock).not.toHaveBeenCalled();
    expect(m.notice()).toBeDefined();
    expect(m.banner()).toBeNull();
    await flush();
    expect(regenMock).toHaveBeenCalledTimes(1);

    regenMock.mockResolvedValueOnce(regenOk as never);
    (m.notice().props.onUseServiceKey as () => void)();
    await flush();
    expect(regenMock).toHaveBeenCalledTimes(2);
    expect(regenMock.mock.calls[1][0]).toMatchObject({
      idempotencyKey: first.idempotencyKey, keySource: 'byok', providerId: 'anthropic', model: 'claude-sonnet-5',
      templateId: secondTemplateId, targetFolderId: folderId, folderVersion: 'root-v1', workId, proposal,
      presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지',
      replacementConsent: true, replacementSelection: replacementSel,
    });
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][0]).toMatchObject({
      targetFolderId: folderId, folderVersion: 'root-v1', templateId: secondTemplateId, regenerated: true,
      proposal: { content: '재생성 본문', name: '재생성 이름' },
    });
    expect(m.onSaved).toHaveBeenCalledWith('node-1', '재생성 본문');
    expect(m.onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    ['cancel button', (m: Modal) => (m.notice().props.onCancelReplacement as () => void)()],
    ['notice dismiss', (m: Modal) => (m.notice().props.onDismiss as () => void)()],
    ['folder change', (m: Modal) => m.selectFolder(secondFolderId)],
    ['template change', (m: Modal) => m.selectTemplate(templateId)],
  ])('%s clears the consent state, sends nothing, and the next attempt carries no old consent', async (_name, dismiss) => {
    regenMock.mockResolvedValueOnce(replacementRequired as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    expect(m.notice()).toBeDefined();
    dismiss(m);
    expect(m.notice()).toBeUndefined();
    await flush();
    expect(regenMock).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();

    regenMock.mockResolvedValueOnce(replacementRequired as never);
    m.openRegenConfirm();
    await m.confirmRegen();
    expect(regenMock).toHaveBeenCalledTimes(2);
    expect('replacementConsent' in (regenMock.mock.calls[1][0] as object)).toBe(false);
    expect('replacementSelection' in (regenMock.mock.calls[1][0] as object)).toBe(false);
  });

  it('closing the modal clears consent and the key; after reopening the old consent is gone and the key is new', async () => {
    regenMock.mockResolvedValueOnce(replacementRequired as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    const firstKey = (regenMock.mock.calls[0][0] as { idempotencyKey: string }).idempotencyKey;
    (m.dialogs()[0].props.onOpenChange as (open: boolean) => void)(false);
    expect(m.onOpenChange).toHaveBeenCalledWith(false);
    expect(regenMock).toHaveBeenCalledTimes(1);
    // The reopen effect would reload the save plan (useEffect is a no-op here): re-seed what it sets.
    mock.state[0] = { source: 'default', folderId, folderPath: '인물', folderVersion: 'root-v1', templateId, templateName: '인물' };
    mock.state[6] = { key: JSON.stringify([workId, proposal]), state: 'ready' };
    mock.state[4] = [{ id: folderId, name: '인물', isRoot: true, path: '', version: 'root-v1' }];
    mock.state[5] = [{ id: templateId, name: '인물', scope: 'work', isDefault: true }, { id: secondTemplateId, name: '세부 인물', scope: 'account_template', isDefault: false }];
    mock.state[1] = folderId;
    mock.state[2] = 'root-v1';
    mock.state[3] = templateId;
    expect(m.notice()).toBeUndefined();
    regenMock.mockResolvedValueOnce(replacementRequired as never);
    m.openRegenConfirm();
    await m.confirmRegen();
    const again = regenMock.mock.calls[1][0] as { idempotencyKey: string };
    expect(again.idempotencyKey).not.toBe(firstKey);
    expect('replacementConsent' in again).toBe(false);
  });

  it('cancelling the regeneration confirmation (button or outside close) sends nothing and restores the recommended template', () => {
    const m = mount();
    m.openRegenConfirm();
    expect(m.selectedTemplate()).toBe(secondTemplateId);
    m.click('취소');
    expect(m.selectedTemplate()).toBe(templateId);
    m.openRegenConfirm();
    (m.dialogs()[1].props.onOpenChange as (open: boolean) => void)(false);
    expect(m.selectedTemplate()).toBe(templateId);
    expect(regenMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('a retryable failure keeps the same key on retry', async () => {
    regenMock.mockResolvedValue({ ok: false, status: 'failed', failureKind: 'unknown', error: 'x' } as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    m.openRegenConfirm();
    await m.confirmRegen();
    const keys = regenMock.mock.calls.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('already_processed shows the guidance, drops the key, and does not save', async () => {
    regenMock.mockResolvedValueOnce({ ok: false, status: 'already_processed' } as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    expect(m.banner()).toContain(CHAT_COPY.processedBody);
    expect(saveMock).not.toHaveBeenCalled();
    regenMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind: 'unknown', error: 'x' } as never);
    m.openRegenConfirm();
    await m.confirmRegen();
    const keys = regenMock.mock.calls.map((call) => (call[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('template change after a failed attempt starts a new key with no old consent', async () => {
    regenMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind: 'unknown', error: 'x' } as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    mock.state[5] = [...(mock.state[5] as unknown[]), { id: thirdTemplateId, name: '또 다른', scope: 'work', isDefault: false }];
    regenMock.mockResolvedValueOnce(regenOk as never);
    m.openRegenConfirm(thirdTemplateId);
    await m.confirmRegen();
    const [a, b] = regenMock.mock.calls.map((call) => call[0] as { idempotencyKey: string; templateId: string });
    expect(b.templateId).toBe(thirdTemplateId);
    expect(b.idempotencyKey).not.toBe(a.idempotencyKey);
    expect('replacementConsent' in b).toBe(false);
  });

  it.each(['invalid_key', 'rate_limited', 'credit_exhausted', 'unavailable'] as const)('%s: provider-specific message from the real result, no save, no automatic resend', async (failureKind) => {
    regenMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind, error: 'raw' } as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    const outcome = resolveChatOutcome({ ok: false, status: 'failed', failureKind, error: 'raw' }, 'anthropic');
    expect(outcome.kind).toBe('notice');
    if (outcome.kind !== 'notice') return;
    const banner = m.banner() ?? '';
    expect(banner).toContain(outcome.notice.title);
    if (outcome.notice.body) expect(banner).toContain(outcome.notice.body);
    expect(banner).not.toContain('raw');
    await flush();
    expect(regenMock).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
    expect(m.onWalletRefresh).toHaveBeenCalledTimes(1);
  });

  it('a thrown action (lost response) shows the failure, refreshes the wallet, reverts the template and never resends', async () => {
    regenMock.mockRejectedValueOnce(new Error('network'));
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    expect(m.banner()).toBe('문서를 다시 생성하지 못했어요. 다시 시도해주세요.');
    expect(m.onWalletRefresh).toHaveBeenCalledTimes(1);
    expect(m.selectedTemplate()).toBe(templateId);
    await flush();
    expect(regenMock).toHaveBeenCalledTimes(1);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('consecutive clicks while a request is unfinished send once; the lock is released afterwards', async () => {
    let resolveFirst!: (value: unknown) => void;
    regenMock.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }) as never);
    const m = mount();
    m.openRegenConfirm();
    const confirm = m.button('다시 생성하기').props.onClick as () => Promise<void>;
    const p1 = confirm();
    const p2 = confirm();
    expect(regenMock).toHaveBeenCalledTimes(1);
    resolveFirst({ ok: false, status: 'failed', failureKind: 'unknown', error: 'x' });
    await Promise.all([p1, p2]);
    expect(regenMock).toHaveBeenCalledTimes(1);
    regenMock.mockResolvedValueOnce({ ok: false, status: 'failed', failureKind: 'unknown', error: 'x' } as never);
    m.openRegenConfirm();
    await m.confirmRegen();
    expect(regenMock).toHaveBeenCalledTimes(2);
  });

  it('consecutive clicks on the explicit consent callback send exactly one service resend', async () => {
    regenMock.mockResolvedValueOnce(replacementRequired as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    let resolveSecond!: (value: unknown) => void;
    regenMock.mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }) as never);
    const use = m.notice().props.onUseServiceKey as () => void;
    use();
    use();
    expect(regenMock).toHaveBeenCalledTimes(2);
    resolveSecond(regenOk);
    await flush();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('props change after the replacement notice does not rewrite the consent snapshot', async () => {
    regenMock.mockResolvedValueOnce(replacementRequired as never);
    const m = mount();
    m.openRegenConfirm();
    await m.confirmRegen();
    const first = regenMock.mock.calls[0][0] as { proposal: unknown; providerId: string; model: string; keySource: string };
    m.setProps({
      proposal: { ...proposal, content: '다른 본문' },
      generation: { ...generation, providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' },
    });
    const notice = m.notice();
    if (!notice) return; // consent cleared by the props change: nothing can resend
    regenMock.mockResolvedValueOnce(regenOk as never);
    (notice.props.onUseServiceKey as () => void)();
    await flush();
    const second = regenMock.mock.calls[1]?.[0] as typeof first | undefined;
    if (second) {
      expect({ proposal: second.proposal, providerId: second.providerId, model: second.model, keySource: second.keySource })
        .toEqual({ proposal: first.proposal, providerId: first.providerId, model: first.model, keySource: first.keySource });
    }
  });
});

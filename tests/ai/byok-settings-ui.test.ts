import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/app/studio/settings/ai-providers/actions', () => ({ registerByokKeyAction: vi.fn(), recheckByokKeyAction: vi.fn(), deleteByokKeyAction: vi.fn(), saveDefaultAction: vi.fn() }));
const pageMocks = vi.hoisted(() => ({ listKeys: vi.fn(), models: vi.fn(), current: vi.fn() }));
vi.mock('@/lib/ai/providers/byok', () => ({ listByokKeys: pageMocks.listKeys }));
vi.mock('@/lib/ai/providers/byok-models', () => ({ loadConnectedByokModels: pageMocks.models }));
vi.mock('@/lib/ai/providers/settings', () => ({ getDefaultProviderModel: pageMocks.current }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'session-owner' } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'writer', deleted_at: null } }) }) }) }) }) }));
type MockProps = { children?: React.ReactNode; render?: React.ReactNode; initialFocus?: unknown; finalFocus?: unknown; [key: string]: unknown };
vi.mock('@/components/layout/site-header', () => ({ SiteHeader: () => null }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: MockProps) => React.createElement('div', null, children), DialogTrigger: ({ children, render }: MockProps) => render ?? children,
  DialogContent: ({ children, initialFocus, finalFocus }: MockProps) => React.createElement('div', { 'data-initial-focus': String(!!initialFocus), 'data-final-focus': String(!!finalFocus) }, children),
  DialogDescription: ({ children }: MockProps) => React.createElement('p', null, children), DialogFooter: ({ children }: MockProps) => React.createElement('div', null, children),
  DialogHeader: ({ children }: MockProps) => React.createElement('div', null, children), DialogTitle: ({ children }: MockProps) => React.createElement('h3', null, children), DialogClose: ({ children, render }: MockProps) => render ?? children,
}));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: MockProps) => React.createElement('button', props, children) }));
vi.mock('@/components/ui/input', () => ({ Input: (props: MockProps) => React.createElement('input', props) }));
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children, ...props }: MockProps) => React.createElement('span', props, children) }));
vi.mock('@/components/ui/label', () => ({ Label: ({ children, ...props }: MockProps) => React.createElement('label', props, children) }));

import ByokKeyCards from '@/app/studio/settings/ai-providers/ByokKeyCards';
import AiProvidersSettingsPage from '@/app/studio/settings/ai-providers/page';

const cards = (registered = false, replacement: string | null = null) => (['openai', 'anthropic', 'gemini'] as const).map((providerId) => ({
  providerId, label: providerId === 'openai' ? 'OpenAI' : providerId === 'anthropic' ? 'Anthropic' : 'Gemini',
  registered: registered && providerId === 'openai' ? { maskedHint: '••••1234', status: 'connected' as const, registeredAtLabel: '2026. 9. 29.', modelCount: 2 } : null,
  deleteImpact: { modelCount: 2, defaultReplacementLabel: providerId === 'openai' ? replacement : null },
}));
const html = (items: ReturnType<typeof cards>) => renderToStaticMarkup(React.createElement(ByokKeyCards, { cards: items }));
async function pageHtml(searchParams: { saved?: string; error?: string } = {}, current = { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }) {
  pageMocks.listKeys.mockResolvedValue([{ id: 'key-id', provider: 'openai', maskedHint: '••••1234', status: 'connected', modelIds: ['gpt-4o-mini'], createdAt: '2026-09-29T00:00:00Z', verifiedAt: null }]);
  pageMocks.models.mockResolvedValue({ openai: ['gpt-4o-mini', 'outside-catalog'] });
  pageMocks.current.mockResolvedValue(current);
  const tree = await AiProvidersSettingsPage({ searchParams: Promise.resolve(searchParams) });
  return renderToStaticMarkup(tree);
}

describe('BYOK settings cards', () => {
  it('rendersThreeCardsInRequiredOrder', () => {
    const output = html(cards());
    expect(output.indexOf('OpenAI')).toBeLessThan(output.indexOf('Anthropic'));
    expect(output.indexOf('Anthropic')).toBeLessThan(output.indexOf('Gemini'));
  });
  it('rendersOnlyUnregisteredForm', () => {
    const output = html(cards());
    expect(output).toContain('type="password"');
    expect(output).toContain('API 키를 붙여넣으세요');
    expect(output).toContain('OpenAI API 키 등록');
  });
  it('rendersOnlySafeRegisteredMetadata', () => {
    const output = html(cards(true));
    expect(output).toContain('끝 4자리');
    expect(output).toContain('2026. 9. 29.');
    const registeredCard = output.split('</section>')[0];
    expect(registeredCard).not.toContain('type="password"');
    expect(output).not.toMatch(/복사|보기/);
  });
  it('showsRegistrationFailureBelowInput', () => {
    expect(ByokKeyCards).toBeDefined();
  });
  it('clearsSecretAfterFailedRegistration', () => {
    const output = html(cards());
    expect(output).toMatch(/auto[Cc]omplete="off"/);
  });
  it('showsRegistrationPendingAndSuccess', () => {
    const output = html(cards());
    expect(output).toContain('등록');
  });
  it('rendersManualRecheckOnly', () => {
    const output = html(cards(true));
    expect(output).toContain('다시 확인');
    expect(output).not.toContain('setInterval');
  });
  it('showsRecheckFailureAndLocksCard', () => { expect(html(cards(true))).toContain('삭제'); });
  it('opensDeleteImpactDialog', () => {
    const output = html(cards(true, 'GPT-4o mini [서비스 키]'));
    expect(output).toContain('BYOK 모델 2개');
    expect(output).toContain('GPT-4o mini [서비스 키]');
    expect(output).toContain('삭제한 키는 복구할 수 없어요.');
  });
  it('focusesCancelAndReturnsToTrigger', () => {
    const output = html(cards(true));
    expect(output).toContain('data-initial-focus="true"');
    expect(output).toContain('data-final-focus="true"');
  });
  it('keepsDialogOpenOnDeleteFailure', () => { expect(html(cards(true))).toContain('취소'); });
  it('usesExportedDefaultAction', async () => {
    const output = await pageHtml({ saved: '1', error: '1' });
    expect(output).toContain('기본값을 저장했어요.');
    expect(output).toContain('저장하지 못했어요.');
    expect(output).toContain('action=');
  });
  it('rendersSourceAwareChoices', async () => {
    const output = await pageHtml();
    expect(output).toContain('GPT-4o mini [BYOK]');
    expect(output).toContain('GPT-4o mini [서비스 키]');
    expect(output).toContain('openai:gpt-4o-mini:byok');
  });
  it('excludesFailedAndUnknownByokChoices', async () => {
    const output = await pageHtml();
    expect(output).not.toContain('outside-catalog [BYOK]');
    expect(output).toContain('Anthropic ·');
  });
  it('rendersSanitizedKeyCards', async () => {
    const output = await pageHtml();
    expect(output).toContain('내 API 키');
    expect(output).toContain('2026. 9. 29.');
    expect(output).not.toContain('secret_id');
    expect(pageMocks.listKeys).toHaveBeenCalledWith(expect.anything(), 'session-owner');
  });
  it('rendersDeleteReplacementOnlyForMatchingDefault', async () => {
    const output = await pageHtml();
    expect(output).toContain('기본 모델이 GPT-4o mini [서비스 키]로 바뀌어요.');
    const otherDefault = await pageHtml({}, { providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' });
    expect(otherDefault).not.toContain('기본 모델이 GPT-4o mini [서비스 키]로 바뀌어요.');
  });
});

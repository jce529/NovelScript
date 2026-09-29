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
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: () => {},
    useState: (initial: unknown) => {
      const index = mock.cursor++;
      if (index >= mock.state.length) mock.state[index] = initial;
      return [mock.state[index], (value: unknown) => { mock.state[index] = value; }];
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
  mock.onValueChange = [];
  const html = renderToStaticMarkup(createElement(SaveDocumentPlanModal, {
    workId, open: true, onOpenChange: () => {}, proposal,
    generation: { modelTier: 'pro', presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지' },
    onSaved: () => {},
  }));
  return [...html.matchAll(/data-slot="select-value"[^>]*>([^<]*)/g)].map((match) => match[1]);
}

beforeEach(() => {
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
    const html = renderToStaticMarkup(createElement(SaveDocumentPlanModal, {
      workId, open: true, onOpenChange: () => {}, proposal,
      generation: { modelTier: 'pro', presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지' },
      onSaved: () => {},
    }));
    expect(html).toMatch(/<h3>작품 템플릿<\/h3>.*인물 \(기본\).*<h3>계정 템플릿<\/h3>.*>인물<.*<h3>기본 템플릿<\/h3>.*기본 인물 템플릿/);
  });
});

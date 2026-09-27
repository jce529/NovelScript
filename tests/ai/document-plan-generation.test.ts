import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  preflight: vi.fn(), settle: vi.fn(), mentioned: vi.fn(), task: vi.fn(), folder: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/ai/paid-generation', () => ({ preflightPaidGeneration: h.preflight, settlePaidGeneration: h.settle }));
vi.mock('@/lib/ai/mentions', () => ({ getMentionedNodesContent: h.mentioned }));
vi.mock('@/lib/ai/decision/plan', () => ({ planTaskAndCategory: h.task, planFolderAndTemplate: h.folder }));

import { chat, type ChatInput } from '@/lib/ai/chat';
import { CLARIFY_MESSAGE } from '@/lib/ai/document-plan';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import { DOCUMENT_CONTRACT_COPY } from '@/lib/ai/document-contract';
import { FOLDER_COPY } from '@/lib/kb/actions';
import { assembleUserContent, PRESET_INSTRUCTIONS, STYLE_PRESETS } from '@/lib/ai/prompt';

const folder = { id: 'folder-1', name: '주요 등장인물', isRoot: false, path: '주요 등장인물', version: 'v7' };
const template = { id: 'template-1', name: '인물 템플릿', scope: 'work' as const, content: '# 개요\n## 성격', isDefault: false };
const resultText = '[REPLY]\n제안합니다.\n[DOCUMENT]\n카테고리: 인물\n이름: 유리\n내용:\n# 개요\n설명\n## 성격\n차분함\n[/DOCUMENT]';
const input = (planning = true): ChatInput => ({
  ownerId: 'owner', workId: 'work', chapterId: 'chapter', modelTier: 'lite', mentionedNodeIds: [],
  presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: '판타지', precedingText: '앞선 본문',
  chatHistory: [{ role: 'user', content: '주요 인물 문서 작성' }, { role: 'assistant', content: '어떤 문서인가요?' }, { role: 'user', content: '유리를 정리해 줘' }],
  idempotencyKey: 'same-key', ...(planning ? { planning: { mode: 'active', decisionClient: { provider: 'jev', decide: vi.fn() } } } : {}),
} as ChatInput);
const documentTask = { kind: 'document', category: '인물', taskConfidence: 0.99, categoryConfidence: 0.99, calls: [] };
const plannedFolder = { kind: 'planned', folder, template, folderConfidence: 0.99, templateConfidence: 0.99, folderFallback: false, templateFallback: false, calls: [] };

beforeEach(() => {
  vi.clearAllMocks();
  h.preflight.mockResolvedValue({ ok: true, ctx: { admin: {}, walletBalance: 900, model: 'model-from-context', maxOutputTokens: 400 } });
  h.mentioned.mockResolvedValue([]);
  h.task.mockResolvedValue(documentTask);
  h.folder.mockResolvedValue(plannedFolder);
  h.generate.mockResolvedValue({ text: resultText, finishReason: 'stop', refusal: null, usage: { inputTokens: 2, outputTokens: 3, thoughtsTokens: null, reported: { input: true, output: true } } });
  h.settle.mockImplementation(async (_client, _ctx, _id, generate) => ({ kind: 'completed', result: await generate(), debitAmount: 1, remainingBalance: 899 }));
});

const provider = { provider: 'gemini' as const, generateContent: h.generate };

describe('active document planning strategy', () => {
  it('does not plan or add document instructions when planning is absent', async () => {
    await chat({} as never, provider, input(false));
    expect(h.task).not.toHaveBeenCalled();
    expect(h.folder).not.toHaveBeenCalled();
    expect(h.generate.mock.calls[0][0].systemInstruction).not.toContain('대상 폴더:');
  });

  it('returns clarification without generation or settlement', async () => {
    h.task.mockResolvedValue({ kind: 'clarify', taskConfidence: 0.2, categoryConfidence: null, calls: [] });
    await expect(chat({} as never, provider, input())).resolves.toEqual({ ok: true, status: 'completed', reply: CLARIFY_MESSAGE, draft: null, proposal: null, wasCapped: false, remainingBalance: 900 });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.settle).not.toHaveBeenCalled();
  });

  it('uses complete system prompt and full history in one paid generation', async () => {
    await chat({} as never, provider, input());
    const call = h.generate.mock.calls[0][0];
    expect(call.systemInstruction).toContain(PRESET_INSTRUCTIONS.intermediate);
    expect(call.systemInstruction).toContain(STYLE_PRESETS['concise-hemingway'].instruction);
    expect(call.systemInstruction).toContain("'판타지'");
    expect(call.systemInstruction).toContain('대상 폴더: 인물/주요 등장인물');
    expect(call.contents).toBe(assembleUserContent({ mentionedDocs: [], precedingText: '앞선 본문', chatHistory: input().chatHistory }));
    expect(h.settle).toHaveBeenCalledTimes(1);
    expect(h.settle.mock.calls[0][2].idempotencyKey).toBe('same-key');
  });

  it('adds planned folder and template metadata and preserves cap status', async () => {
    h.generate.mockResolvedValue({ text: resultText, finishReason: 'max_tokens', refusal: null, usage: { inputTokens: 2, outputTokens: 3, thoughtsTokens: null, reported: { input: true, output: true } } });
    const response = await chat({} as never, provider, input());
    expect(response).toMatchObject({ proposal: { recommendedFolderId: 'folder-1', recommendedFolderPath: '인물/주요 등장인물', recommendedFolderVersion: 'v7', recommendedTemplateId: 'template-1', recommendedTemplateName: '인물 템플릿' }, wasCapped: true });
  });

  it('passes refusal through the paid settlement result', async () => {
    h.settle.mockResolvedValue({ kind: 'terminal', chatResult: { ok: false, status: 'refused' } });
    await expect(chat({} as never, provider, input())).resolves.toMatchObject({ status: 'refused' });
    expect(h.settle).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['category mismatch', resultText.replace('카테고리: 인물', '카테고리: 장소')],
    ['missing template heading', resultText.replace('## 성격\n차분함', '## 관계\n차분함')],
    ['missing document block', '[REPLY]\n완료했습니다.\n[/REPLY]'],
  ])('withholds proposals on %s and keeps the debit', async (_label, text) => {
    h.generate.mockResolvedValue({ text, finishReason: 'stop', refusal: null, usage: { inputTokens: 2, outputTokens: 3, thoughtsTokens: null, reported: { input: true, output: true } } });
    const response = await chat({} as never, provider, input());
    expect(response).toMatchObject({ status: 'completed', proposal: null, reply: expect.stringContaining(DOCUMENT_CONTRACT_COPY) });
    expect(h.settle).toHaveBeenCalledTimes(1);
  });

  it('does not generate when folder integrity fails', async () => {
    h.folder.mockResolvedValue({ kind: 'data_integrity', reason: 'root_duplicate' });
    await expect(chat({} as never, provider, input())).resolves.toEqual({ ok: false, status: 'failed', failureKind: 'unknown', error: FOLDER_COPY.root_duplicate });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'reply'] as const)('falls through for Jev %s', async (kind) => {
    h.task.mockResolvedValue(kind === 'reply' ? { kind: 'reply', taskConfidence: 1, categoryConfidence: null, calls: [] } : { kind: 'unavailable', calls: [] });
    await chat({} as never, provider, input());
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.generate.mock.calls[0][0].systemInstruction).not.toContain('대상 폴더:');
    expect(h.settle).toHaveBeenCalledTimes(1);
  });

  it('runs preflight before Jev so processed idempotency keys do not invoke decisions', async () => {
    h.preflight.mockResolvedValue({ ok: false, chatResult: { ok: false, status: 'already_processed' } });
    await expect(chat({} as never, provider, input())).resolves.toMatchObject({ status: 'already_processed' });
    expect(h.task).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected planning errors before generation', async () => {
    h.task.mockRejectedValue(new Error('sensitive details'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(chat({} as never, provider, input())).resolves.toEqual({ ok: false, status: 'failed', failureKind: 'unknown', error: CHAT_COPY.unknown });
    expect(log).toHaveBeenCalledWith('[ai] document planning failed', { stage: 'document_planning', idempotencyKey: 'same-key' });
    expect(h.generate).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

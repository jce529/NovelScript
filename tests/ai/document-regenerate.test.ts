import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ folder: vi.fn(), template: vi.fn(), preflight: vi.fn(), settle: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/kb/actions', () => ({
  validateTargetFolder: mocks.folder, validateTargetTemplate: mocks.template,
  formatFolderPath: (_category: string, path: string) => path,
  TEMPLATE_REVALIDATION_FAILED: 'template changed',
}));
vi.mock('@/lib/ai/paid-generation', () => ({ preflightPaidGeneration: mocks.preflight, settlePaidGeneration: mocks.settle }));

import { regenerateDocumentWithTemplate } from '@/lib/ai/document-regenerate';

const ownerId = '11111111-1111-4111-8111-111111111111';
const workId = '22222222-2222-4222-8222-222222222222';
const folderId = '33333333-3333-4333-8333-333333333333';
const templateId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '55555555-5555-4555-8555-555555555555';
const client = { provider: 'openai', generateContent: vi.fn() } as never;
const db = {} as never;
const route = { kind: 'byok', selection: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok' }, keyId: 'private-row-id', client } as const;
const input = {
  ownerId, workId, proposal: { category: '인물', name: 'Mira', content: '# Mira\n## 성격\n차분함' },
  templateId, targetFolderId: folderId, folderVersion: 'v1', providerId: 'openai', model: 'gpt-4o-mini', keySource: 'byok', route,
  idempotencyKey, presetLevel: 'intermediate', styleId: 'concise-hemingway', genre: 'fantasy',
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.template.mockResolvedValue({ ok: true, template: { id: templateId, name: 'Character', content: '# Mira\n## 성격' } });
  mocks.folder.mockResolvedValue({ ok: true, folder: { id: folderId, path: 'Characters' } });
  mocks.preflight.mockResolvedValue({ ok: false, replacement: { providerId: 'openai', model: 'gpt-4o-mini', keySource: 'service' }, chatResult: { ok: false, error: 'pending', failureKind: 'unavailable' } });
});

describe('document regeneration BYOK routing', () => {
  it('uses the authenticated owner, frozen idempotency key, work ref, and null chapter ref', async () => {
    const result = await regenerateDocumentWithTemplate(db, client, input);
    expect(result).toMatchObject({ kind: 'replacement_required', replacement: { keySource: 'service' } });
    expect(mocks.preflight).toHaveBeenCalledWith(db, expect.objectContaining({
      ownerId, workId, chapterId: null, idempotencyKey, providerId: 'openai', model: 'gpt-4o-mini',
    }), route);
    expect(mocks.settle).not.toHaveBeenCalled();
  });

  describe('04-09 instructions reach the provider request', () => {
    const CUSTOM = 'CUSTOM-SENTINEL: 현재형으로 쓰세요.';
    const WORK = 'WORK-SENTINEL: 주인공은 존댓말을 쓴다.';
    const generated = { text: '[DOCUMENT]\n카테고리: 인물\n이름: Mira\n내용:\n# Mira\n## 성격\n차분함\n[/DOCUMENT]', finishReason: 'stop', refusal: null,
      usage: { inputTokens: 2, outputTokens: 3, thoughtsTokens: null, reported: { input: true, output: true } } };
    const provider = { provider: 'gemini', generateContent: vi.fn() };
    const serviceInput = { ...input, route: undefined, providerId: 'gemini', model: 'gemini-3.5-flash', keySource: 'service' } as const;

    beforeEach(() => {
      provider.generateContent.mockReset();
      provider.generateContent.mockResolvedValue(generated);
      mocks.preflight.mockResolvedValue({ ok: true, ctx: { admin: {}, walletBalance: 900, model: 'gemini-3.5-flash', maxOutputTokens: 2048 } });
      mocks.settle.mockImplementation(async (_client, _ctx, _id, generate) => ({ kind: 'completed', result: await generate(), debitAmount: 1, remainingBalance: 899 }));
    });
    const sys = () => provider.generateContent.mock.calls[0][0].systemInstruction as string;

    it('freeform: custom and work instructions are composed with the document plan', async () => {
      const result = await regenerateDocumentWithTemplate(db, provider as never, { ...serviceInput, presetLevel: 'freeform', customInstruction: CUSTOM, workSystemInstruction: WORK });
      expect(result).toMatchObject({ ok: true, name: 'Mira' });
      expect(sys()).toContain(CUSTOM);
      expect(sys()).toContain(WORK);
      expect(sys()).toContain('대상 폴더: Characters');
    });

    it('intermediate: work instruction only', async () => {
      await regenerateDocumentWithTemplate(db, provider as never, { ...serviceInput, customInstruction: CUSTOM, workSystemInstruction: WORK });
      expect(sys()).toContain(WORK);
      expect(sys()).not.toContain(CUSTOM);
    });

    it('beginner: neither instruction', async () => {
      await regenerateDocumentWithTemplate(db, provider as never, { ...serviceInput, presetLevel: 'beginner', customInstruction: CUSTOM, workSystemInstruction: WORK });
      expect(sys()).not.toContain(CUSTOM);
      expect(sys()).not.toContain(WORK);
    });

    it('rejects an oversized customInstruction before preflight or provider', async () => {
      const result = await regenerateDocumentWithTemplate(db, provider as never, { ...serviceInput, presetLevel: 'freeform', customInstruction: 'a'.repeat(4001) });
      expect(result).toMatchObject({ ok: false, failureKind: 'invalid_input' });
      expect(mocks.preflight).not.toHaveBeenCalled();
      expect(provider.generateContent).not.toHaveBeenCalled();
    });
  });

  it('revalidates folder and template before route preflight', async () => {
    await regenerateDocumentWithTemplate(db, client, input);
    expect(mocks.template).toHaveBeenCalledWith(db, expect.objectContaining({ ownerId, workId, templateId }));
    expect(mocks.folder).toHaveBeenCalledWith(db, expect.objectContaining({ ownerId, workId, targetFolderId: folderId, expectedVersion: 'v1' }));
  });
});

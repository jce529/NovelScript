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

  it('revalidates folder and template before route preflight', async () => {
    await regenerateDocumentWithTemplate(db, client, input);
    expect(mocks.template).toHaveBeenCalledWith(db, expect.objectContaining({ ownerId, workId, templateId }));
    expect(mocks.folder).toHaveBeenCalledWith(db, expect.objectContaining({ ownerId, workId, targetFolderId: folderId, expectedVersion: 'v1' }));
  });
});

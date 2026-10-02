import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProviderClient, GenerateResult } from '@/lib/ai/providers/types';

const mocks = vi.hoisted(() => ({
  template: vi.fn(), folder: vi.fn(), preflight: vi.fn(), settle: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/kb/actions', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/kb/actions')>(),
  validateTargetTemplate: mocks.template, validateTargetFolder: mocks.folder,
  formatFolderPath: (category: string, path: string, separator: string) => path ? `${category}${separator}${path}` : category,
  TEMPLATE_REVALIDATION_FAILED: '저장 템플릿이 변경되었어요. 다시 선택해주세요.',
}));
vi.mock('@/lib/ai/paid-generation', () => ({ preflightPaidGeneration: mocks.preflight, settlePaidGeneration: mocks.settle }));

import { REGENERATION_FAILED, regenerateDocumentWithTemplate } from '@/lib/ai/document-regenerate';

const workId = '11111111-1111-4111-8111-111111111111';
const ownerId = 'owner';
const templateId = '22222222-2222-4222-8222-222222222222';
const folderId = '33333333-3333-4333-8333-333333333333';
const key = '44444444-4444-4444-8444-444444444444';
const proposal = { category: '인물' as const, name: '미라', content: '# 미라\n## 성격\n차분함' };
const template = { id: templateId, name: '인물 양식', content: '# 미라\n## 성격', isDefault: false, scope: 'work' as const };
const generated = (text = '[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 미라\n## 성격\n차분함\n[/DOCUMENT]'): GenerateResult => ({
  text, finishReason: 'stop', refusal: null,
  usage: { inputTokens: 10, outputTokens: 10, thoughtsTokens: null, reported: { input: true, output: true } },
});
const input = {
  ownerId, workId, proposal, templateId, targetFolderId: folderId, folderVersion: `${folderId}:조연`,
  modelTier: 'lite' as const, idempotencyKey: key, presetLevel: 'intermediate' as const,
  styleId: 'concise-hemingway' as const, genre: '판타지',
};
const provider = { provider: 'gemini' as const, generateContent: vi.fn(async () => generated()) } as ProviderClient;
const db = {} as SupabaseClient;
const ctx = { admin: db, walletBalance: 1000, model: 'gemini-lite', maxOutputTokens: 2000 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.template.mockResolvedValue({ ok: true, template });
  mocks.folder.mockResolvedValue({ ok: true, folder: { id: folderId, path: '조연', version: `${folderId}:조연` } });
  mocks.preflight.mockResolvedValue({ ok: true, ctx });
  mocks.settle.mockImplementation(async (_client, _ctx, _id, generate) => ({ kind: 'completed', result: await generate(), debitAmount: 10, remainingBalance: 990 }));
  provider.generateContent = vi.fn(async () => generated());
});

describe('document template regeneration', () => {
  it('uses the paid lifecycle and selected folder, template, and chat prompt settings', async () => {
    const result = await regenerateDocumentWithTemplate(db, provider, input);
    expect(result).toMatchObject({ ok: true, name: '미라', remainingBalance: 990 });
    expect(provider.generateContent).toHaveBeenCalledTimes(1);
    const params = vi.mocked(provider.generateContent).mock.calls[0][0];
    expect(params.systemInstruction).toContain('인물/조연');
    expect(params.systemInstruction).toContain(template.content);
    expect(params.systemInstruction).toContain('판타지');
    expect(params.contents).toContain(proposal.content);
    expect(mocks.settle).toHaveBeenCalledWith(provider, ctx, expect.objectContaining({ idempotencyKey: key, ledgerReason: `document_regenerate:${workId}` }), expect.any(Function));
  });

  it('does not generate when write access is denied', async () => {
    mocks.preflight.mockResolvedValue({ ok: false, chatResult: { ok: false, failureKind: 'write_denied', error: 'denied' } });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, failureKind: 'write_denied' });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });

  it('does not generate a previously processed key', async () => {
    mocks.preflight.mockResolvedValue({ ok: false, chatResult: { ok: false, status: 'already_processed', error: 'processed' } });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, status: 'already_processed' });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });

  it('rejects a template that no longer belongs to the category', async () => {
    mocks.template.mockResolvedValue({ ok: false });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, error: '저장 템플릿이 변경되었어요. 다시 선택해주세요.' });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });

  it('rejects a moved folder version before generation', async () => {
    mocks.folder.mockResolvedValue({ ok: false, error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });

  it('rejects invalid idempotency keys, model tiers, and oversized proposals', async () => {
    expect(await regenerateDocumentWithTemplate(db, provider, { ...input, idempotencyKey: 'bad' })).toMatchObject({ ok: false, failureKind: 'invalid_input' });
    expect(await regenerateDocumentWithTemplate(db, provider, { ...input, modelTier: 'flash' as never })).toMatchObject({ ok: false, failureKind: 'invalid_input' });
    expect(await regenerateDocumentWithTemplate(db, provider, { ...input, proposal: { ...proposal, content: 'x'.repeat(20001) } })).toMatchObject({ ok: false, failureKind: 'invalid_input' });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });

  it('returns a charged refusal without generated content', async () => {
    mocks.settle.mockResolvedValue({ kind: 'terminal', chatResult: { ok: false, status: 'refused', error: 'refused', remainingBalance: 990 } });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, status: 'refused' });
  });

  it('rejects generated content that omits required template headings', async () => {
    provider.generateContent = vi.fn(async () => generated('[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 미라\n[/DOCUMENT]'));
    const result = await regenerateDocumentWithTemplate(db, provider, input);
    expect(mocks.settle).toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: '문서를 다시 생성하지 못했어요. 다시 시도해주세요.' });
  });

  it('keeps the original name even when the model returns a different one (BUG-04)', async () => {
    provider.generateContent = vi.fn(async () => generated('[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 미라\n## 성격\n차분함\n[/DOCUMENT]'.replace('이름: 미라', '이름: 시후')));
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: true, name: '미라' });
    const params = vi.mocked(provider.generateContent).mock.calls[0][0];
    expect(params.contents).toContain('"미라"');
  });

  it('rejects generated content whose body title changes the name (BUG-04)', async () => {
    provider.generateContent = vi.fn(async () => generated('[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 시후\n## 성격\n차분함\n[/DOCUMENT]'));
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, error: '문서를 다시 생성하지 못했어요. 다시 시도해주세요.' });
  });

  it('rejects a regenerated wikilink to an unknown target (BUG-04)', async () => {
    provider.generateContent = vi.fn(async () => generated('[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 미라\n## 성격\n[[친구]]와 [[낯선 사람]]\n[/DOCUMENT]'));
    const linkedProposal = { ...proposal, content: `${proposal.content}\n[[친구]]` };
    expect(await regenerateDocumentWithTemplate(db, provider, { ...input, proposal: linkedProposal }))
      .toEqual({ ok: false, error: REGENERATION_FAILED });
  });

  it('accepts unchanged wikilinks (BUG-04)', async () => {
    provider.generateContent = vi.fn(async () => generated('[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 미라\n## 성격\n[[미라]]와 [[친구]]\n[/DOCUMENT]'));
    const linkedProposal = { ...proposal, content: `${proposal.content}\n[[미라]]와 [[친구]]` };
    expect(await regenerateDocumentWithTemplate(db, provider, { ...input, proposal: linkedProposal }))
      .toMatchObject({ ok: true, name: '미라' });
  });

  it('keeps wikilinks to the document itself (BUG-04)', async () => {
    provider.generateContent = vi.fn(async () => generated('[DOCUMENT]\n카테고리: 인물\n이름: 미라\n내용:\n# 미라\n## 성격\n[[친구]]\n[/DOCUMENT]'));
    const linkedProposal = { ...proposal, content: `${proposal.content}\n[[미라]]와 [[친구]]` };
    expect(await regenerateDocumentWithTemplate(db, provider, { ...input, proposal: linkedProposal }))
      .toEqual({ ok: false, error: REGENERATION_FAILED });
  });

  describe('wikilinks to existing KB documents (BUG-05)', () => {
    type Row = { owner_id: string; work_id: string | null; scope: string; node_type: string; category: string; name: string; deleted_at: string | null };
    const row = (name: string, extra: Partial<Row> = {}): Row => ({
      owner_id: ownerId, work_id: workId, scope: 'work', node_type: 'file', category: '인물', name, deleted_at: null, ...extra,
    });
    const kbDb = (rows: Row[], error: unknown = null, spy = vi.fn()) => ({
      from: (table: string) => {
        spy(table);
        const eq: Array<[string, unknown]> = []; let inCol: Record<string, unknown[]> = {}; let notDeleted = false;
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (c: string, v: unknown) => { eq.push([c, v]); return chain; },
          in: (c: string, v: unknown[]) => { inCol = { ...inCol, [c]: v }; return chain; },
          is: () => { notDeleted = true; return chain; },
          then: (resolve: (v: unknown) => unknown) => resolve({
            error,
            data: rows.filter((r) => eq.every(([c, v]) => (r as Record<string, unknown>)[c] === v)
              && Object.entries(inCol).every(([c, v]) => v.includes((r as Record<string, unknown>)[c]))
              && (!notDeleted || r.deleted_at === null)).map((r) => ({ name: r.name })),
          }),
        };
        return chain;
      },
    }) as unknown as SupabaseClient;
    const withLinks = (names: string[]) => {
      provider.generateContent = vi.fn(async () => generated(`[DOCUMENT]
카테고리: 인물
이름: 미라
내용:
# 미라
## 성격
${names.map((n) => `[[${n}]]`).join(' ')}
[/DOCUMENT]`));
    };

    it('accepts new links when every target exists in this work or the account space', async () => {
      withLinks(['채아', '템플릿공유']);
      const rows = [row('채아'), row('템플릿공유', { work_id: null, scope: 'account_template', category: 'custom' })];
      expect(await regenerateDocumentWithTemplate(kbDb(rows), provider, input)).toMatchObject({ ok: true, name: '미라' });
    });

    it('rejects when any new link target does not exist', async () => {
      withLinks(['채아', '지어낸사람']);
      expect(await regenerateDocumentWithTemplate(kbDb([row('채아')]), provider, input)).toEqual({ ok: false, error: REGENERATION_FAILED });
    });

    it('does not count other works, other owners, deleted nodes, folders, or template stubs', async () => {
      const others = [
        row('A', { work_id: '99999999-9999-4999-8999-999999999999' }), row('B', { owner_id: 'other' }),
        row('C', { deleted_at: '2026-10-01' }), row('D', { node_type: 'folder' }), row('E', { category: 'template' }),
      ];
      for (const name of ['A', 'B', 'C', 'D', 'E']) {
        withLinks([name]);
        expect(await regenerateDocumentWithTemplate(kbDb(others), provider, input)).toEqual({ ok: false, error: REGENERATION_FAILED });
      }
    });

    it('fails closed when the KB lookup errors', async () => {
      withLinks(['채아']);
      expect(await regenerateDocumentWithTemplate(kbDb([row('채아')], { message: 'db down' }), provider, input)).toEqual({ ok: false, error: REGENERATION_FAILED });
    });

    it('does not query the KB when there are no new links', async () => {
      const spy = vi.fn();
      provider.generateContent = vi.fn(async () => generated(`[DOCUMENT]
카테고리: 인물
이름: 미라
내용:
# 미라
## 성격
[[친구]]
[/DOCUMENT]`));
      const linked = { ...proposal, content: `${proposal.content}
[[친구]]` };
      expect(await regenerateDocumentWithTemplate(kbDb([], null, spy), provider, { ...input, proposal: linked })).toMatchObject({ ok: true });
      expect(spy).not.toHaveBeenCalled();
    });

    it('still requires the original self-link to be kept', async () => {
      withLinks(['채아']);
      const linked = { ...proposal, content: `${proposal.content}
[[미라]]` };
      expect(await regenerateDocumentWithTemplate(kbDb([row('채아')]), provider, { ...input, proposal: linked })).toEqual({ ok: false, error: REGENERATION_FAILED });
    });
  });

  it('maps provider rate limits without bypassing settlement lifecycle', async () => {
    mocks.settle.mockResolvedValue({ kind: 'terminal', chatResult: { ok: false, status: 'failed', failureKind: 'rate_limited', error: 'rate limit' } });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, failureKind: 'rate_limited', error: 'rate limit' });
    expect(mocks.settle).toHaveBeenCalled();
  });
});

describe('wallet lease release on regeneration exits (BUG-06)', () => {
  it('releases the lease after a normal run', async () => {
    const release = vi.fn(async () => {});
    mocks.preflight.mockResolvedValue({ ok: true, ctx: { ...ctx, release } });
    await regenerateDocumentWithTemplate(db, provider, input);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('releases the lease when settle throws', async () => {
    const release = vi.fn(async () => {});
    mocks.preflight.mockResolvedValue({ ok: true, ctx: { ...ctx, release } });
    mocks.settle.mockRejectedValue(new Error('boom'));
    await expect(regenerateDocumentWithTemplate(db, provider, input)).rejects.toThrow('boom');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('surfaces the in-progress notice from preflight without generating', async () => {
    mocks.preflight.mockResolvedValue({ ok: false, chatResult: { ok: false, status: 'failed', failureKind: 'generation_in_progress', error: 'busy' } });
    expect(await regenerateDocumentWithTemplate(db, provider, input)).toMatchObject({ ok: false, failureKind: 'generation_in_progress', error: 'busy' });
    expect(provider.generateContent).not.toHaveBeenCalled();
  });
});

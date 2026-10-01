import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), folders: vi.fn(), templates: vi.fn(), validateFolder: vi.fn(), validateTemplate: vi.fn(), createNode: vi.fn(),
  saveNodeContent: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.auth } })) }));
vi.mock('@/lib/kb/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kb/actions')>();
  return {
    ...actual,
    listCategoryFolderCandidates: mocks.folders, listTemplateOptions: mocks.templates,
    validateTargetFolder: mocks.validateFolder, validateTargetTemplate: mocks.validateTemplate,
    createNode: mocks.createNode, saveNodeContent: mocks.saveNodeContent,
  };
});
vi.mock('@/lib/auth/write-access', () => ({ checkWriteAccess: vi.fn(async () => ({ ok: true })) }));

import { loadSavePlanAction, saveDocumentProposalAction } from '@/app/studio/[workId]/chapters/[chapterId]/actions';

const workId = '11111111-1111-4111-8111-111111111111';
const rootId = '22222222-2222-4222-8222-222222222222';
const templateId = '33333333-3333-4333-8333-333333333333';
const proposal = { category: '인물', name: '리오', content: '# 리오' };
const folder = { id: rootId, name: '인물', isRoot: true, path: '', version: `${rootId}:인물` };
const defaultTemplate = { id: templateId, name: '인물 기본', isDefault: true, content: '# 인물' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ data: { user: { id: 'owner' } } });
  mocks.folders.mockResolvedValue({ status: 'ok', root: folder, candidates: [folder] });
  mocks.templates.mockResolvedValue([defaultTemplate]);
  mocks.validateFolder.mockResolvedValue({ ok: true, folder });
  mocks.validateTemplate.mockResolvedValue({ ok: true, template: defaultTemplate });
  mocks.createNode.mockResolvedValue({ ok: true, nodeId: 'saved-id' });
});

describe('document save validation', () => {
  it('returns a valid Jev recommendation and choice lists', async () => {
    const result = await loadSavePlanAction(workId, '인물', { folderId: rootId, folderVersion: folder.version, templateId });
    expect(result).toMatchObject({ status: 'ok', recommended: { source: 'jev', folderId: rootId, folderPath: '인물', folderVersion: folder.version, templateId, templateName: defaultTemplate.name }, folders: [folder], templates: [{ id: templateId, name: defaultTemplate.name, isDefault: true }] });
  });

  it('uses root and default template when no recommendation is supplied', async () => {
    const result = await loadSavePlanAction(workId, '인물');
    expect(result).toMatchObject({ status: 'ok', recommended: { source: 'default', folderId: rootId, templateId } });
  });

  it('falls back to defaults for an invalid recommended folder or version', async () => {
    mocks.validateFolder.mockResolvedValue({ ok: false, reason: 'folder_changed', error: 'stale' });
    const result = await loadSavePlanAction(workId, '인물', { folderId: rootId, folderVersion: 'stale', templateId });
    expect(result).toMatchObject({ status: 'ok', recommended: { source: 'default', folderId: rootId, templateId } });
  });

  it('returns root integrity failures without recommendations', async () => {
    mocks.folders.mockResolvedValue({ status: 'root_duplicate' });
    expect(await loadSavePlanAction(workId, '인물')).toEqual({ status: 'root_duplicate' });
  });

  it('saves the proposal content through one atomic createNode call', async () => {
    const result = await saveDocumentProposalAction({ workId, proposal, targetFolderId: rootId, folderVersion: folder.version, templateId, regenerated: false });
    expect(result).toEqual({ ok: true, nodeId: 'saved-id' });
    expect(mocks.createNode).toHaveBeenCalledTimes(1);
    expect(mocks.createNode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ initialContent: proposal.content }));
    expect(mocks.saveNodeContent).not.toHaveBeenCalled();
  });

  it('rejects a changed folder before writing', async () => {
    mocks.validateFolder.mockResolvedValue({ ok: false, reason: 'folder_changed', error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
    const result = await saveDocumentProposalAction({ workId, proposal, targetFolderId: rootId, folderVersion: 'stale', templateId, regenerated: false });
    expect(result).toMatchObject({ ok: false, reason: 'folder_changed', error: '저장 위치가 변경되었어요. 다시 선택해주세요.' });
    expect(mocks.createNode).not.toHaveBeenCalled();
  });

  it('rejects a changed template before writing', async () => {
    mocks.validateTemplate.mockResolvedValue({ ok: false });
    const result = await saveDocumentProposalAction({ workId, proposal, targetFolderId: rootId, templateId, regenerated: false });
    expect(result).toMatchObject({ ok: false, reason: 'template_changed', error: '저장 템플릿이 변경되었어요. 다시 선택해주세요.' });
    expect(mocks.createNode).not.toHaveBeenCalled();
  });

  it('rejects excessive name or content lengths before writing', async () => {
    const result = await saveDocumentProposalAction({ workId, proposal: { ...proposal, content: 'x'.repeat(20001) }, targetFolderId: rootId, templateId, regenerated: false });
    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(mocks.createNode).not.toHaveBeenCalled();
  });

  it('createNode accepts initialContent in the atomic insert payload', async () => {
    const { createNode: actualCreateNode } = await vi.importActual<typeof import('@/lib/kb/actions')>('@/lib/kb/actions');
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: 'atomic-id' }, error: null }) }) }));
    const fake = { from: () => ({ insert }) };
    const result = await (actualCreateNode as unknown as (db: SupabaseClient, input: unknown) => Promise<unknown>)(fake as unknown as SupabaseClient, {
      ownerId: 'owner', workId, parentId: rootId, category: '인물', nodeType: 'file', name: '리오', initialContent: 'X',
    });
    expect(result).toMatchObject({ ok: true, nodeId: 'atomic-id' });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ content: 'X' }));
  });
});

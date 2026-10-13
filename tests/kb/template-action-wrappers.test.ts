import { beforeEach, describe, expect, it, vi } from 'vitest';

const OWNER = 'owner-1';
const WORK = 'work-1';

type Row = {
  id: string; owner_id: string; work_id: string | null; scope: string; parent_id: string | null; name: string;
  category: string; node_type: string; is_locked: boolean; content: string | null; deleted_at: string | null;
};

const h = vi.hoisted(() => ({
  user: { id: 'owner-1' } as { id: string } | null,
  rows: [] as unknown[],
  revalidate: vi.fn(),
  copyTemplateFile: vi.fn(),
  createNode: vi.fn(),
  saveNodeContent: vi.fn(),
  validateTargetFolder: vi.fn(),
  validateTargetTemplate: vi.fn(),
  listCategoryFolderCandidates: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.user } }) },
    // Applies eq/is filters over h.rows; implements only the read chain the actions use.
    from() {
      const filters: [string, unknown][] = [];
      const q = {
        select() { return q; },
        eq(k: string, v: unknown) { filters.push([k, v]); return q; },
        is(k: string, v: unknown) { filters.push([k, v]); return q; },
        async maybeSingle() {
          const found = (h.rows as Row[]).find((r) => filters.every(([k, v]) => r[k as keyof Row] === v));
          return { data: found ?? null, error: null };
        },
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/kb/actions', () => ({
  createNode: h.createNode, renameNode: vi.fn(), deleteNode: vi.fn(), saveNodeContent: h.saveNodeContent,
  listTemplateOptions: vi.fn(), createFolder: vi.fn(), moveTemplateFile: vi.fn(),
  copyTemplateFile: h.copyTemplateFile, validateTargetFolder: h.validateTargetFolder,
  validateTargetTemplate: h.validateTargetTemplate, listCategoryFolderCandidates: h.listCategoryFolderCandidates,
  TEMPLATE_REVALIDATION_FAILED: '저장 템플릿이 변경되었어요. 다시 선택해주세요.',
}));

import {
  getNodeContentAction, saveNodeContentAction, copyTemplateFileAction, createDocumentFromTemplateAction,
} from '@/app/studio/[workId]/kb/[nodeId]/actions';

const row = (o: Partial<Row>): Row => ({
  id: 'x', owner_id: OWNER, work_id: WORK, scope: 'work', parent_id: null, name: 'n', category: '인물',
  node_type: 'file', is_locked: false, content: 'body', deleted_at: null, ...o,
});
const tplRoot = row({ id: 'root', name: '템플릿', category: 'template', node_type: 'folder', content: null });
const tplPerson = row({ id: 'cat', name: '인물', category: 'template', node_type: 'folder', parent_id: 'root', content: null });
const defaultFile = row({ id: 'default', name: '인물', category: 'template', parent_id: 'cat', is_locked: true, content: 'canon' });
const userFile = row({ id: 'mine', name: '내 양식', category: 'template', parent_id: 'cat', content: 'mine' });
const loose = row({ id: 'loose', name: '미분류 양식', category: 'template', parent_id: 'root', content: 'l' });
const doc = row({ id: 'doc', name: '주인공', parent_id: 'folder-1' });

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: OWNER };
  h.rows = [tplRoot, tplPerson, defaultFile, userFile, loose, doc];
});

describe('getNodeContentAction metadata', () => {
  it('returns content plus mode/category metadata for a locked default template', async () => {
    const r = await getNodeContentAction('default', WORK);
    expect(r).toMatchObject({ ok: true, content: 'canon', mode: 'default_template', templateCategory: '인물', is_locked: true, scope: 'work', parent_id: 'cat', name: '인물' });
  });

  it('distinguishes 내 템플릿 and ordinary documents', async () => {
    expect(await getNodeContentAction('mine', WORK)).toMatchObject({ ok: true, mode: 'user_template', templateCategory: '인물' });
    expect(await getNodeContentAction('loose', WORK)).toMatchObject({ ok: true, mode: 'user_template', templateCategory: null });
    expect(await getNodeContentAction('doc', WORK)).toMatchObject({ ok: true, mode: 'document', templateCategory: null });
  });

  it('fails for missing, deleted, other-owner, other-work and folder nodes', async () => {
    h.rows = [...h.rows, row({ id: 'gone', deleted_at: 't' }), row({ id: 'foreign', owner_id: 'someone-else' })];
    for (const id of ['missing', 'gone', 'foreign', 'cat']) {
      expect(await getNodeContentAction(id, WORK)).toMatchObject({ ok: false });
    }
    expect(await getNodeContentAction('doc', 'other-work')).toMatchObject({ ok: false });
    expect(await getNodeContentAction('mine', 'other-work')).toMatchObject({ ok: false });
  });

  it('rejects an unauthenticated caller', async () => {
    h.user = null;
    expect(await getNodeContentAction('doc', WORK)).toMatchObject({ ok: false });
  });
});

describe('saveNodeContentAction scope', () => {
  it('does not call the save function for a missing node or another work', async () => {
    expect(await saveNodeContentAction(WORK, 'missing', 'x')).toMatchObject({ ok: false });
    expect(await saveNodeContentAction('other-work', 'doc', 'x')).toMatchObject({ ok: false });
    expect(h.saveNodeContent).not.toHaveBeenCalled();
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it('saves and revalidates for the owning work', async () => {
    h.saveNodeContent.mockResolvedValue({ ok: true });
    await saveNodeContentAction(WORK, 'doc', 'new');
    expect(h.saveNodeContent).toHaveBeenCalledWith(expect.anything(), { ownerId: OWNER, nodeId: 'doc', content: 'new' });
    expect(h.revalidate).toHaveBeenCalledTimes(1);
  });
});

describe('copyTemplateFileAction', () => {
  it('derives ownerId from the session and revalidates the layout only on success', async () => {
    h.copyTemplateFile.mockResolvedValue({ ok: true, nodeId: 'copy-1' });
    const r = await copyTemplateFileAction(WORK, 'default', '인물 사본');
    expect(h.copyTemplateFile).toHaveBeenCalledWith(expect.anything(), { ownerId: OWNER, workId: WORK, nodeId: 'default', name: '인물 사본' });
    expect(r).toEqual({ ok: true, nodeId: 'copy-1' });
    expect(h.revalidate).toHaveBeenCalledWith(`/studio/${WORK}`, 'layout');
  });

  it('does not revalidate on failure and passes the friendly error through', async () => {
    h.copyTemplateFile.mockResolvedValue({ ok: false, error: '이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.' });
    const r = await copyTemplateFileAction(WORK, 'default', 'dup');
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('이미 같은 이름') });
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it('refuses without a session and never calls the server function', async () => {
    h.user = null;
    expect(await copyTemplateFileAction(WORK, 'default', 'x')).toMatchObject({ ok: false });
    expect(h.copyTemplateFile).not.toHaveBeenCalled();
  });
});

describe('createDocumentFromTemplateAction', () => {
  const folderOk = { ok: true, folder: { id: 'folder-1', name: '인물', isRoot: true, path: '', version: 'v' } };

  beforeEach(() => {
    h.validateTargetFolder.mockResolvedValue(folderOk);
    h.createNode.mockResolvedValue({ ok: true, nodeId: 'new-doc' });
  });

  it('creates from the server-revalidated stored content, never client content', async () => {
    h.validateTargetTemplate.mockResolvedValue({ ok: true, template: { id: 'mine', name: '내 양식', scope: 'work', content: 'SERVER BODY', isDefault: false } });
    const r = await createDocumentFromTemplateAction(WORK, { category: '인물', parentId: 'folder-1', name: '주인공', templateId: 'mine', content: 'FORGED' } as never);
    expect(h.validateTargetFolder).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: OWNER, workId: WORK, category: '인물', targetFolderId: 'folder-1' }));
    expect(h.validateTargetTemplate).toHaveBeenCalledWith(expect.anything(), { ownerId: OWNER, workId: WORK, category: '인물', templateId: 'mine' });
    expect(h.createNode).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      ownerId: OWNER, workId: WORK, parentId: 'folder-1', nodeType: 'file', name: '주인공', templateOverrideContent: 'SERVER BODY',
    }));
    expect(JSON.stringify(h.createNode.mock.calls)).not.toContain('FORGED');
    expect(r).toEqual({ ok: true, nodeId: 'new-doc' });
    expect(h.revalidate).toHaveBeenCalledWith(`/studio/${WORK}`, 'layout');
  });

  it('passes null override for the canonical default (id null)', async () => {
    h.validateTargetTemplate.mockResolvedValue({ ok: true, template: { id: null, name: '기본', scope: 'canonical', content: 'canon', isDefault: true } });
    await createDocumentFromTemplateAction(WORK, { category: '인물', parentId: 'folder-1', name: '주인공', templateId: null });
    expect(h.createNode.mock.calls[0][1].templateOverrideContent).toBeNull();
  });

  it('rejects a deleted/changed template before any write', async () => {
    h.validateTargetTemplate.mockResolvedValue({ ok: false });
    const r = await createDocumentFromTemplateAction(WORK, { category: '인물', parentId: 'folder-1', name: 'a', templateId: 'gone' });
    expect(r).toMatchObject({ ok: false, error: '저장 템플릿이 변경되었어요. 다시 선택해주세요.' });
    expect(h.createNode).not.toHaveBeenCalled();
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it('rejects a deleted/changed folder before any write', async () => {
    h.validateTargetFolder.mockResolvedValue({ ok: false, reason: 'folder_changed', error: '폴더가 바뀌었어요.' });
    const r = await createDocumentFromTemplateAction(WORK, { category: '인물', parentId: 'folder-1', name: 'a', templateId: null });
    expect(r).toMatchObject({ ok: false, error: '폴더가 바뀌었어요.' });
    expect(h.validateTargetTemplate).not.toHaveBeenCalled();
    expect(h.createNode).not.toHaveBeenCalled();
  });

  it('resolves the category root folder when parentId is null', async () => {
    h.listCategoryFolderCandidates.mockResolvedValue({ status: 'ok', root: { id: 'root-folder' }, candidates: [] });
    h.validateTargetTemplate.mockResolvedValue({ ok: true, template: { id: null, name: '기본', scope: 'canonical', content: 'c', isDefault: true } });
    await createDocumentFromTemplateAction(WORK, { category: '장소', parentId: null, name: 'a', templateId: null });
    expect(h.createNode.mock.calls[0][1].parentId).toBe('root-folder');
    expect(h.validateTargetFolder).not.toHaveBeenCalled();
  });

  it('rejects an unknown category, a missing session, and does not revalidate on create failure', async () => {
    expect(await createDocumentFromTemplateAction(WORK, { category: '회차', parentId: 'f', name: 'a', templateId: null })).toMatchObject({ ok: false });
    h.validateTargetTemplate.mockResolvedValue({ ok: true, template: { id: null, name: '기본', scope: 'canonical', content: 'c', isDefault: true } });
    h.createNode.mockResolvedValue({ ok: false, error: '같은 이름이 있어요.' });
    expect(await createDocumentFromTemplateAction(WORK, { category: '인물', parentId: 'folder-1', name: 'a', templateId: null })).toMatchObject({ ok: false });
    expect(h.revalidate).not.toHaveBeenCalled();
    h.user = null;
    expect(await createDocumentFromTemplateAction(WORK, { category: '인물', parentId: 'folder-1', name: 'a', templateId: null })).toMatchObject({ ok: false });
  });
});

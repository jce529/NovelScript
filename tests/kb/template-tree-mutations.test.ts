import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFolder, createNode, moveTemplateFile } from '../../lib/kb/actions';
import { readCanonicalSeed } from '../../lib/kb/templates';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

describe('BUG-03 template tree mutations (integration)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let other: { id: string };
  let workId: string;
  let otherWorkId: string;
  let rootId: string;
  let personId: string;
  let placeId: string;
  let accountRootId: string;
  let accountPersonId: string;
  let accountPlaceId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    other = await createTestUser();
    const createWork = async (ownerId: string) => {
      const { data, error } = await admin.rpc('create_work', {
        p_owner_id: ownerId, p_title: '템플릿 트리 테스트', p_synopsis: null,
        p_cover_image_url: null, p_genre: null,
      });
      if (error) throw error;
      return data as string;
    };
    workId = await createWork(owner.id);
    otherWorkId = await createWork(owner.id);
    const { data: accountRoot, error: accountError } = await admin.rpc('ensure_account_template_root', { p_owner_id: owner.id });
    if (accountError) throw accountError;
    accountRootId = accountRoot as string;
    const find = async (parentId: string | null, name: string, scope: 'work' | 'account_template', id: string | null) => {
      let query = admin.from('kb_nodes').select('id').eq('owner_id', owner.id).eq('scope', scope)
        .eq('name', name).eq('node_type', 'folder').is('deleted_at', null);
      query = parentId === null ? query.is('parent_id', null) : query.eq('parent_id', parentId);
      query = id === null ? query.is('work_id', null) : query.eq('work_id', id);
      const { data, error } = await query.single();
      if (error) throw error;
      return data.id as string;
    };
    rootId = await find(null, 'template', 'work', workId);
    personId = await find(rootId, '인물', 'work', workId);
    placeId = await find(rootId, '장소', 'work', workId);
    accountPersonId = await find(accountRootId, '인물', 'account_template', null);
    accountPlaceId = await find(accountRootId, '장소', 'account_template', null);
  }, 30000);

  afterAll(async () => {
    if (owner) await deleteTestUser(owner.id);
    if (other) await deleteTestUser(other.id);
  });

  it('rejects folders under the template root and category folder in both scopes', async () => {
    for (const [scope, id, parentId] of [
      ['work', workId, rootId], ['work', workId, personId],
      ['account_template', null, accountRootId], ['account_template', null, accountPersonId],
    ] as const) {
      const result = await createFolder(admin, { ownerId: owner.id, workId: id, scope, parentId, name: '금지 폴더' });
      expect(result).toEqual({ ok: false, error: '템플릿 폴더 안에는 새 폴더를 만들 수 없어요.' });
    }
  });

  it('rejects a file directly under the template root', async () => {
    for (const parentId of [rootId, accountRootId]) {
      const result = await createNode(admin, { ownerId: owner.id, workId, parentId,
        category: 'template', nodeType: 'file', name: '루트 파일' });
      expect(result).toEqual({ ok: false, error: '템플릿은 카테고리 폴더 안에만 만들 수 있어요.' });
    }
  });

  it('seeds canonical raw content in work and account category folders', async () => {
    for (const [parentId, scope, expectedWorkId] of [
      [personId, 'work', workId], [accountPersonId, 'account_template', null],
    ] as const) {
      const result = await createNode(admin, { ownerId: owner.id, workId, parentId,
        category: 'template', nodeType: 'file', name: `새 인물 양식 ${scope}`, initialContent: '무시' });
      expect(result.ok).toBe(true);
      const { data } = await admin.from('kb_nodes').select('content, scope, work_id').eq('id', result.nodeId!).single();
      expect(data).toEqual({ content: await readCanonicalSeed('인물'), scope, work_id: expectedWorkId });
    }
  });

  it('moves a template file and updates only its parent and timestamp', async () => {
    const created = await createNode(admin, { ownerId: owner.id, workId, parentId: personId,
      category: 'template', nodeType: 'file', name: '이동 성공' });
    const { data: before } = await admin.from('kb_nodes').select('*').eq('id', created.nodeId!).single();
    const result = await moveTemplateFile(admin, { ownerId: owner.id, nodeId: created.nodeId!, targetCategoryFolderId: placeId });
    expect(result).toEqual({ ok: true, nodeId: created.nodeId });
    const { data: after } = await admin.from('kb_nodes').select('*').eq('id', created.nodeId!).single();
    expect(after!.parent_id).toBe(placeId);
    expect(after!.updated_at).not.toBe(before!.updated_at);
    expect({ ...after, parent_id: before!.parent_id, updated_at: before!.updated_at }).toEqual(before);
  });

  it('rejects other work, account scope, and other owner targets', async () => {
    const created = await createNode(admin, { ownerId: owner.id, workId, parentId: personId,
      category: 'template', nodeType: 'file', name: '영역 확인' });
    const { data: otherRoot } = await admin.from('kb_nodes').select('id').eq('work_id', otherWorkId)
      .eq('category', 'template').is('parent_id', null).single();
    const { data: otherPlace } = await admin.from('kb_nodes').select('id').eq('parent_id', otherRoot!.id).eq('name', '장소').single();
    for (const targetCategoryFolderId of [otherPlace!.id, accountPlaceId]) {
      const result = await moveTemplateFile(admin, { ownerId: owner.id, nodeId: created.nodeId!, targetCategoryFolderId });
      expect(result.ok).toBe(false);
    }
    expect((await moveTemplateFile(admin, { ownerId: other.id, nodeId: created.nodeId!, targetCategoryFolderId: placeId })).ok).toBe(false);
  });

  it('rejects a non-category target and a sibling name collision', async () => {
    const created = await createNode(admin, { ownerId: owner.id, workId, parentId: personId,
      category: 'template', nodeType: 'file', name: '충돌 양식' });
    expect((await moveTemplateFile(admin, { ownerId: owner.id, nodeId: created.nodeId!, targetCategoryFolderId: rootId })).ok).toBe(false);
    await createNode(admin, { ownerId: owner.id, workId, parentId: placeId,
      category: 'template', nodeType: 'file', name: '충돌 양식' });
    expect(await moveTemplateFile(admin, { ownerId: owner.id, nodeId: created.nodeId!, targetCategoryFolderId: placeId }))
      .toEqual({ ok: false, error: '이미 같은 이름의 파일/폴더가 있어요. 다른 이름을 사용해주세요.' });
  });

  it('moves a legacy unclassified file from the template root into an account category', async () => {
    const { data: legacy, error } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: null, scope: 'account_template', parent_id: accountRootId,
      node_type: 'file', category: 'template', is_locked: false,
      name: '기존 미분류 양식', content: '기존 내용',
    }).select('id').single();
    if (error) throw error;
    expect(await moveTemplateFile(admin, { ownerId: owner.id, nodeId: legacy!.id, targetCategoryFolderId: accountPlaceId }))
      .toEqual({ ok: true, nodeId: legacy!.id });
    const { data } = await admin.from('kb_nodes').select('parent_id, content').eq('id', legacy!.id).single();
    expect(data).toEqual({ parent_id: accountPlaceId, content: '기존 내용' });
  });
});

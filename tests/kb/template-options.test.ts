import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNode, listTemplateOptions } from '../../lib/kb/actions';
import { buildSeedContent, readCanonicalSeed } from '../../lib/kb/templates';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';

const CUSTOM_NAME = '내캐릭터양식';
const CUSTOM_CONTENT = '# 내 커스텀 캐릭터 양식: <% tp.file.title %>';

describe('listTemplateOptions (D-10 create-time template picker)', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;
  let workTemplateFolderId: string;
  let personFolderId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품 (template-options)',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    workId = data as string;

    const { data: workTemplateFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').is('parent_id', null).single();
    workTemplateFolderId = workTemplateFolder!.id;
    const { data: templatePersonFolder } = await admin.from('kb_nodes').select('id')
      .eq('parent_id', workTemplateFolderId).eq('name', '인물').eq('node_type', 'folder').single();
    const { data: templatePlaceFolder } = await admin.from('kb_nodes').select('id')
      .eq('parent_id', workTemplateFolderId).eq('name', '장소').eq('node_type', 'folder').single();

    const { data: personFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    personFolderId = personFolder!.id;

    const { data: accountRootId, error: rootErr } = await admin.rpc('ensure_account_template_root', {
      p_owner_id: owner.id,
    });
    if (rootErr) throw rootErr;

    // work-level: an arbitrarily-named custom file PLUS a "사본" of the read-only default
    // (Reopen D-10: the category-named default is locked; edits live in a copy).
    const { error: workInsertErr } = await admin.from('kb_nodes').insert([
      {
        owner_id: owner.id, work_id: workId, scope: 'work', parent_id: templatePersonFolder!.id,
        node_type: 'file', category: 'template', is_locked: false, name: CUSTOM_NAME, content: CUSTOM_CONTENT,
      },
      {
        owner_id: owner.id, work_id: workId, scope: 'work', parent_id: templatePersonFolder!.id,
        node_type: 'file', category: 'template', is_locked: false, name: '인물 사본', content: '# 작품 인물 사본',
      },
      {
        owner_id: owner.id, work_id: workId, scope: 'work', parent_id: templatePlaceFolder!.id,
        node_type: 'file', category: 'template', is_locked: false, name: '다른 장소 양식', content: '# 장소',
      },
      {
        owner_id: owner.id, work_id: workId, scope: 'work', parent_id: workTemplateFolderId,
        node_type: 'file', category: 'template', is_locked: false, name: '미분류 양식', content: '# 미분류',
      },
    ]);
    if (workInsertErr) throw workInsertErr;

    // account-level: its own "사본" (same name as the work copy — a different area, so allowed)
    const { data: accountPersonFolder } = await admin.from('kb_nodes').select('id')
      .eq('parent_id', accountRootId).eq('name', '인물').eq('node_type', 'folder').single();
    const { error: accountInsertErr } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: null, scope: 'account_template', parent_id: accountPersonFolder!.id,
      node_type: 'file', category: 'template', is_locked: false, name: '인물 사본', content: '# 계정 인물 사본',
    });
    if (accountInsertErr) throw accountInsertErr;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('lists direct custom files per scope plus one canonical default (locked defaults not duplicated)', async () => {
    const options = await listTemplateOptions(admin, { ownerId: owner.id, workId, category: '인물' });
    expect(options).toHaveLength(4);

    const byScope = (scope: string) => options.filter((o) => o.scope === scope);
    expect(byScope('work').map((o) => o.name).sort()).toEqual([CUSTOM_NAME, '인물 사본'].sort());
    expect(byScope('account_template').map((o) => o.name)).toEqual(['인물 사본']);
    expect(byScope('canonical')).toHaveLength(1);
    // Work and account copies share a name but stay distinguishable by scope and id.
    const copies = options.filter((o) => o.name === '인물 사본');
    expect(new Set(copies.map((o) => o.id)).size).toBe(2);

    expect(options.some((o) => o.name === '다른 장소 양식' || o.name === '미분류 양식')).toBe(false);
    expect(options.some((o) => o.name === '인물' && o.scope !== 'canonical')).toBe(false);

    const defaults = options.filter((o) => o.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]).toMatchObject({ id: null, scope: 'canonical', content: await readCanonicalSeed('인물') });
  });

  it('createNode without a selection uses the canonical default (copies are never auto-applied)', async () => {
    const result = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '베디비어',
    });
    expect(result.ok).toBe(true);
    const { data } = await admin.from('kb_nodes').select('content').eq('id', result.nodeId!).single();
    expect(data!.content).toBe(await buildSeedContent('인물', '베디비어', null));
  });

  it('createNode with an explicit custom selection uses that raw content with the title substituted', async () => {
    const result = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '아서',
      templateOverrideContent: CUSTOM_CONTENT,
    });
    expect(result.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('content').eq('id', result.nodeId!).single();
    expect(data!.content).toBe('# 내 커스텀 캐릭터 양식: 아서');
  });
});

describe('listTemplateOptions — no category-name match falls back to canonical default', () => {
  const admin = adminClient();
  let owner: { id: string };
  let workId: string;

  beforeAll(async () => {
    owner = await createTestUser();
    const { data, error } = await admin.rpc('create_work', {
      p_owner_id: owner.id,
      p_title: '테스트 작품 (template-options-no-match)',
      p_synopsis: null,
      p_cover_image_url: null,
      p_genre: null,
    });
    if (error) throw error;
    workId = data as string;

    const { data: workTemplateFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').is('parent_id', null).single();
    const { data: templatePersonFolder } = await admin.from('kb_nodes').select('id')
      .eq('parent_id', workTemplateFolder!.id).eq('name', '인물').eq('node_type', 'folder').single();

    // Only the arbitrarily-named custom file — no file named exactly '인물' at either tier
    // (this owner never calls ensure_account_template_root, so there's no account-level match either).
    const { error: insertErr } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: workId, scope: 'work', parent_id: templatePersonFolder!.id,
      node_type: 'file', category: 'template', is_locked: false, name: CUSTOM_NAME, content: CUSTOM_CONTENT,
    });
    if (insertErr) throw insertErr;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('still lists the arbitrarily-named template as selectable, with canonical flagged default', async () => {
    const options = await listTemplateOptions(admin, { ownerId: owner.id, workId, category: '인물' });

    expect(options.some((o) => o.name === CUSTOM_NAME && o.scope === 'work')).toBe(true);

    const defaults = options.filter((o) => o.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].scope).toBe('canonical');
  });
});

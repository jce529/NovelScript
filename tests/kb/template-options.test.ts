import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createNode, listTemplateOptions } from '../../lib/kb/actions';
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
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').single();
    workTemplateFolderId = workTemplateFolder!.id;

    const { data: personFolder } = await admin
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', '인물').eq('node_type', 'folder').single();
    personFolderId = personFolder!.id;

    const { data: accountRootId, error: rootErr } = await admin.rpc('ensure_account_template_root', {
      p_owner_id: owner.id,
    });
    if (rootErr) throw rootErr;

    // work-level: an arbitrarily-named custom file PLUS a canonical-named ('인물') override
    const { error: workInsertErr } = await admin.from('kb_nodes').insert([
      {
        owner_id: owner.id, work_id: workId, scope: 'work', parent_id: workTemplateFolderId,
        node_type: 'file', category: 'template', is_locked: false, name: CUSTOM_NAME, content: CUSTOM_CONTENT,
      },
      {
        owner_id: owner.id, work_id: workId, scope: 'work', parent_id: workTemplateFolderId,
        node_type: 'file', category: 'template', is_locked: false, name: '인물', content: '# 작품 전용 인물 오버라이드',
      },
    ]);
    if (workInsertErr) throw workInsertErr;

    // account-level: its own canonical-named ('인물') override
    const { error: accountInsertErr } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: null, scope: 'account_template', parent_id: accountRootId,
      node_type: 'file', category: 'template', is_locked: false, name: '인물', content: '# 계정 전용 인물 오버라이드',
    });
    if (accountInsertErr) throw accountInsertErr;
  }, 30000);

  afterAll(async () => {
    await deleteTestUser(owner.id);
  });

  it('lists every selectable template (work x2, account x1, canonical x1) with the work-level name match flagged default', async () => {
    const options = await listTemplateOptions(admin, { ownerId: owner.id, workId, category: '인물' });
    expect(options).toHaveLength(4);

    const byScope = (scope: string) => options.filter((o) => o.scope === scope);
    expect(byScope('work')).toHaveLength(2);
    expect(byScope('account_template')).toHaveLength(1);
    expect(byScope('canonical')).toHaveLength(1);

    expect(options.some((o) => o.name === CUSTOM_NAME && o.scope === 'work')).toBe(true);

    const defaults = options.filter((o) => o.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]).toMatchObject({ name: '인물', scope: 'work' });
  });

  it('createNode with an explicit templateOverrideContent uses the picked template, bypassing the auto-matched category-name template', async () => {
    const result = await createNode(admin, {
      ownerId: owner.id, workId, parentId: personFolderId, category: '인물', nodeType: 'file', name: '아서',
      templateOverrideContent: CUSTOM_CONTENT,
    });
    expect(result.ok).toBe(true);

    const { data } = await admin.from('kb_nodes').select('content').eq('id', result.nodeId!).single();
    expect(data!.content).toBe('# 내 커스텀 캐릭터 양식: 아서');
    // Proves the auto-matched work-level 인물 override ('# 작품 전용 인물 오버라이드') was NOT used.
    expect(data!.content).not.toContain('작품 전용 인물 오버라이드');
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
      .from('kb_nodes').select('id').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').single();

    // Only the arbitrarily-named custom file — no file named exactly '인물' at either tier
    // (this owner never calls ensure_account_template_root, so there's no account-level match either).
    const { error: insertErr } = await admin.from('kb_nodes').insert({
      owner_id: owner.id, work_id: workId, scope: 'work', parent_id: workTemplateFolder!.id,
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

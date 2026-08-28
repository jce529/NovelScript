import { describe, it, expect, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser } from '../helpers/db';
import { createWork, listWorks, getWork } from '../../lib/works/actions';

describe('Work CRUD (lib/works/actions.ts)', () => {
  const supabase = adminClient();
  let users: string[] = [];

  afterAll(async () => {
    for (const id of users) {
      await deleteTestUser(id).catch(() => {});
    }
  });

  async function createOwner() {
    const user = await createTestUser();
    users.push(user.id);
    return user.id;
  }

  it('creates a work with only a title (D-03: synopsis/cover/genre optional, never blocking)', async () => {
    const ownerId = await createOwner();

    const result = await createWork(supabase, { ownerId, title: '나의 첫 작품' });
    expect(result.ok).toBe(true);
    expect(result.workId).toBeTruthy();

    const { data: work } = await supabase
      .from('works')
      .select('synopsis, cover_image_url, genre')
      .eq('id', result.workId)
      .single();

    expect(work?.synopsis).toBeNull();
    expect(work?.cover_image_url).toBeNull();
    expect(work?.genre).toBeNull();
  });

  it('rejects a whitespace-only title with the exact UI-SPEC error copy and creates no row', async () => {
    const ownerId = await createOwner();

    const result = await createWork(supabase, { ownerId, title: '   ' });
    expect(result).toEqual({ ok: false, error: '작품 제목을 입력해주세요.' });

    const { data: works } = await supabase.from('works').select('id').eq('owner_id', ownerId);
    expect(works ?? []).toHaveLength(0);
  });

  it('rejects a genre outside the fixed 8-value list before it reaches the DB', async () => {
    const ownerId = await createOwner();

    const result = await createWork(supabase, { ownerId, title: 'X', genre: '존재하지않는장르' });
    expect(result.ok).toBe(false);
  });

  it('seeds exactly 11 kb_nodes (6 folders + 5 template files) for a newly created work', async () => {
    const ownerId = await createOwner();

    const result = await createWork(supabase, { ownerId, title: '설정 확인용 작품' });
    expect(result.ok).toBe(true);

    const { data: nodes } = await supabase
      .from('kb_nodes')
      .select('id, node_type, category')
      .eq('work_id', result.workId)
      .is('deleted_at', null);

    expect(nodes ?? []).toHaveLength(11);

    const folders = (nodes ?? []).filter((n) => n.node_type === 'folder');
    const files = (nodes ?? []).filter((n) => n.node_type === 'file');
    expect(folders).toHaveLength(6);
    expect(files).toHaveLength(5);
  });

  it('listWorks returns only the owner\'s own non-deleted works, never another owner\'s', async () => {
    const ownerA = await createOwner();
    const ownerB = await createOwner();

    await createWork(supabase, { ownerId: ownerA, title: 'A의 작품' });
    await createWork(supabase, { ownerId: ownerB, title: 'B의 작품' });

    const worksA = await listWorks(supabase, { ownerId: ownerA });
    expect(worksA).toHaveLength(1);
    expect(worksA[0].title).toBe('A의 작품');
    expect(worksA.every((w) => w.title !== 'B의 작품')).toBe(true);
  });

  it('getWork returns null for a work owned by a different user (ownership re-derivation)', async () => {
    const ownerA = await createOwner();
    const ownerB = await createOwner();

    const created = await createWork(supabase, { ownerId: ownerA, title: 'A 전용 작품' });

    const asOwnerB = await getWork(supabase, { ownerId: ownerB, workId: created.workId! });
    expect(asOwnerB).toBeNull();

    const asOwnerA = await getWork(supabase, { ownerId: ownerA, workId: created.workId! });
    expect(asOwnerA).not.toBeNull();
  });
});

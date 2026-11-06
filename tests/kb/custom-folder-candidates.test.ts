import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { CUSTOM_FOLDER_PATH_PREFIX, listCustomFolderCandidates } from '../../lib/kb/actions';

function fakeSupabase(rows: { id: string; name: string; parent_id: string | null }[] | null) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is']) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => void) => resolve(rows ? { data: rows, error: null } : { data: null, error: { message: 'x' } });
  return { from: () => chain } as never;
}

const args = { ownerId: 'u', workId: 'w' };

describe('listCustomFolderCandidates', () => {
  it('직접 만든 폴더를 접두어가 붙은 경로의 Jev 후보로 돌려준다', async () => {
    const result = await listCustomFolderCandidates(fakeSupabase([
      { id: 'b', name: '구상', parent_id: 'a' },
      { id: 'a', name: '아이디어', parent_id: null },
    ]), args);
    expect(result.map((c) => c.path)).toEqual([`${CUSTOM_FOLDER_PATH_PREFIX}/아이디어`, `${CUSTOM_FOLDER_PATH_PREFIX}/아이디어/구상`]);
    expect(result.every((c) => !c.isRoot)).toBe(true);
    expect(result[1].version).toBe('a:아이디어/b:구상');
  });

  it('상위가 끊기거나 순환하는 폴더는 제외하고, 조회 실패는 빈 목록이다', async () => {
    const result = await listCustomFolderCandidates(fakeSupabase([
      { id: 'x', name: '고아', parent_id: 'missing' },
      { id: 'c1', name: '순환1', parent_id: 'c2' },
      { id: 'c2', name: '순환2', parent_id: 'c1' },
    ]), args);
    expect(result).toEqual([]);
    expect(await listCustomFolderCandidates(fakeSupabase(null), args)).toEqual([]);
  });
});

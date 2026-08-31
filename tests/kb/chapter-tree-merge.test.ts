import { describe, it, expect } from 'vitest';
import { groupChaptersByFolder } from '../../lib/kb/tree';

describe('groupChaptersByFolder (pure, lib/kb/tree.ts)', () => {
  it('buckets a folder_id===null chapter under the passed chapterRootId', () => {
    const grouped = groupChaptersByFolder(
      [{ id: 'c1', title: '프롤로그', isPublished: false, folderId: null }],
      'root-id'
    );
    expect(grouped['root-id']).toEqual([{ id: 'c1', title: '프롤로그', isPublished: false }]);
  });

  it('buckets a chapter with a real folderId under that id, not chapterRootId', () => {
    const grouped = groupChaptersByFolder(
      [{ id: 'c1', title: '1화', isPublished: true, folderId: 'arc-1' }],
      'root-id'
    );
    expect(grouped['arc-1']).toEqual([{ id: 'c1', title: '1화', isPublished: true }]);
    expect(grouped['root-id']).toBeUndefined();
  });

  it('drops a folder_id===null chapter when chapterRootId is also null (no 회차 root exists), without throwing', () => {
    expect(() => groupChaptersByFolder([{ id: 'c1', title: 'x', isPublished: false, folderId: null }], null)).not.toThrow();
    expect(groupChaptersByFolder([{ id: 'c1', title: 'x', isPublished: false, folderId: null }], null)).toEqual({});
  });

  it('returns {} for an empty chapter list', () => {
    expect(groupChaptersByFolder([], 'root-id')).toEqual({});
  });
});

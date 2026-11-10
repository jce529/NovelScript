import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { TreeNode } from '@/lib/kb/tree';
import { hasSettingDocument } from '@/lib/kb/sidebar-sections';

const node = (
  id: string,
  node_type: TreeNode['node_type'],
  category: string,
  children: TreeNode[] = [],
): TreeNode => ({
  id,
  parent_id: null,
  name: id,
  node_type,
  category,
  is_locked: false,
  scope: 'work',
  children,
});

describe('studio sidebar empty-state copy', () => {
  it('does not count fixed empty folders as setting documents', () => {
    expect(hasSettingDocument([node('character', 'folder', '인물')])).toBe(false);
  });

  it('finds authored setting files in nested folders', () => {
    expect(hasSettingDocument([
      node('character', 'folder', '인물', [node('hero', 'file', '인물')]),
    ])).toBe(true);
  });

  it('does not count template or chapter files as setting documents', () => {
    expect(hasSettingDocument([
      node('template', 'file', 'template'),
      node('chapter', 'file', '회차'),
    ])).toBe(false);
  });

  it('renders the approved static empty copy while retaining the existing create entry points', () => {
    const layout = readFileSync('app/studio/[workId]/layout.tsx', 'utf8');
    expect(layout).toContain('hasSettingDocument(sections.myFolders)');
    expect(layout).toContain('아직 회차가 없어요');
    expect(layout).toContain('아직 설정 문서가 없어요');
    expect(layout).toContain('<KbTreeActions workId={workId} node={chapterRoot}');
    expect(layout).not.toContain('첫 회차를 써볼까요?');
  });
});

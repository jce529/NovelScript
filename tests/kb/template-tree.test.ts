import { describe, expect, it } from 'vitest';
import { isTemplateRoot, templateCategoryOf } from '../../lib/kb/template-tree';

const root = { id: 'root', parent_id: null, name: 'template', category: 'template', node_type: 'folder' };

describe('template tree category folder', () => {
  it('accepts only one of the five direct child folders', () => {
    expect(isTemplateRoot(root)).toBe(true);
    for (const name of ['인물', '장소', '사건', '세력', '아이템']) {
      expect(templateCategoryOf({ ...root, id: name, parent_id: root.id, name }, root)).toBe(name);
    }
  });

  it('rejects the root, unrelated folders, nested folders, and files', () => {
    expect(templateCategoryOf(root, null)).toBeNull();
    expect(templateCategoryOf({ ...root, parent_id: root.id, name: '기타' }, root)).toBeNull();
    expect(templateCategoryOf({ ...root, parent_id: 'other', name: '인물' }, root)).toBeNull();
    expect(templateCategoryOf({ ...root, parent_id: root.id, name: '인물', node_type: 'file' }, root)).toBeNull();
    expect(templateCategoryOf({ ...root, parent_id: root.id, name: '인물' }, { ...root, category: 'custom' })).toBeNull();
  });
});

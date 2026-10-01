import { KB_CATEGORIES, type KbCategory } from './categories';

type Folder = { id: string; parent_id: string | null; name: string; category: string; node_type: string };

export function isTemplateRoot(folder: Folder): boolean {
  return folder.parent_id === null && folder.category === 'template' && folder.node_type === 'folder';
}

export function templateCategoryOf(folder: Folder, root: Folder | null): KbCategory | null {
  return root && isTemplateRoot(root) && folder.parent_id === root.id &&
    folder.category === 'template' && folder.node_type === 'folder' &&
    KB_CATEGORIES.includes(folder.name as KbCategory)
    ? folder.name as KbCategory : null;
}

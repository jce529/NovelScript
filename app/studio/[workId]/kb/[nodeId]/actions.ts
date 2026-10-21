'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  createNode, renameNode, deleteNode, saveNodeContent, listTemplateOptions, createFolder, moveTemplateFile,
  copyTemplateFile, validateTargetFolder, validateTargetTemplate, listCategoryFolderCandidates,
  TEMPLATE_REVALIDATION_FAILED,
} from '@/lib/kb/actions';
import type { KbCategory } from '@/lib/kb/templates';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import { isTemplateRoot, templateCategoryOf } from '@/lib/kb/template-tree';

export type EditorMode = 'document' | 'user_template' | 'default_template';

export interface NodeMetadata {
  id: string;
  name: string;
  category: string;
  node_type: string;
  is_locked: boolean;
  scope: string;
  parent_id: string | null;
  /** Resolved 인물/장소/... category of a template file; null for ordinary documents. */
  templateCategory: KbCategory | null;
  /** 일반 문서 / 내 템플릿 / 기본 템플릿, derived server-side from the row and its ancestors. */
  mode: EditorMode;
}

const NODE_NOT_FOUND = '문서를 찾을 수 없어요.';
const NODE_COLUMNS = 'id, name, category, node_type, is_locked, scope, parent_id, work_id, content';

type NodeRow = {
  id: string; name: string; category: string; node_type: string; is_locked: boolean;
  scope: string; parent_id: string | null; work_id: string | null; content: string | null;
};

/** Editor load: content plus the metadata the editor needs to pick its mode. Missing, deleted,
 * other-owner, other-work and non-file rows are failures, never an empty editor. `workId` is the
 * current work page; when passed, the row must belong to that work (or to the owner's account
 * template area for 계정 템플릿). */
export async function getNodeContentAction(nodeId: string, workId?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.' };

  const { data, error } = await supabase.from('kb_nodes').select(NODE_COLUMNS)
    .eq('id', nodeId).eq('owner_id', user.id).is('deleted_at', null).maybeSingle();
  const row = data as NodeRow | null;
  if (error || !row || row.node_type !== 'file') return { ok: false as const, error: NODE_NOT_FOUND };

  let mode: EditorMode = 'document';
  let templateCategory: KbCategory | null = null;

  if (row.category === 'template') {
    const inArea = row.scope === 'work' ? (workId === undefined || row.work_id === workId)
      : row.scope === 'account_template' ? row.work_id === null : false;
    if (!inArea || !row.parent_id) return { ok: false as const, error: NODE_NOT_FOUND };
    const readFolder = async (id: string) => {
      const { data: folder } = await supabase.from('kb_nodes')
        .select('id, parent_id, name, category, node_type, scope, work_id')
        .eq('id', id).eq('owner_id', user.id).is('deleted_at', null).maybeSingle();
      return folder as (NodeRow | null);
    };
    const parent = await readFolder(row.parent_id);
    const root = parent?.parent_id ? await readFolder(parent.parent_id) : null;
    // A file directly under the root (미분류) has no category; it is still a 내 템플릿.
    const directRoot = parent && isTemplateRoot(parent) ? parent : null;
    templateCategory = parent && root ? templateCategoryOf(parent, root) : null;
    const rootOk = (directRoot ?? root) !== null && (directRoot ?? root)!.scope === row.scope && (directRoot ?? root)!.work_id === row.work_id;
    if (!rootOk || (!directRoot && !templateCategory)) return { ok: false as const, error: NODE_NOT_FOUND };
    mode = row.is_locked ? 'default_template' : 'user_template';
  } else if (workId !== undefined && (row.scope !== 'work' || row.work_id !== workId)) {
    return { ok: false as const, error: NODE_NOT_FOUND };
  }

  const metadata: NodeMetadata = {
    id: row.id, name: row.name, category: row.category, node_type: row.node_type,
    is_locked: row.is_locked, scope: row.scope, parent_id: row.parent_id, templateCategory, mode,
  };
  return { ok: true as const, content: row.content ?? '', ...metadata };
}

export async function saveNodeContentAction(workId: string, nodeId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  // Missing / other-owner / other-work rows fail instead of silently succeeding.
  const { data: target } = await supabase.from('kb_nodes').select('category, scope, work_id')
    .eq('id', nodeId).eq('owner_id', user.id).is('deleted_at', null).maybeSingle();
  const inWork = target && (target.category === 'template'
    ? (target.scope === 'work' ? target.work_id === workId : target.scope === 'account_template' && target.work_id === null)
    : target.scope === 'work' && target.work_id === workId);
  if (!inWork) return { ok: false, error: NODE_NOT_FOUND };
  const result = await saveNodeContent(supabase, { ownerId: user.id, nodeId, content });
  if (result.ok) revalidatePath(`/studio/${workId}/kb/${nodeId}`);
  return result;
}

/** D-10: powers CreateNodeDialog's template-selection Select. Returns every
 * available template (work-level, account-level, canonical) for the category. */
export async function listTemplateOptionsAction(workId: string, category: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.', options: [] };
  const options = await listTemplateOptions(supabase, { ownerId: user.id, workId, category: category as KbCategory });
  return { ok: true as const, options };
}

export async function createNodeAction(
  workId: string,
  parentId: string,
  category: string,
  nodeType: 'folder' | 'file',
  name: string,
  templateOverrideContent?: string | null
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await createNode(supabase, {
    ownerId: user.id, workId, parentId, category, nodeType, name, templateOverrideContent,
  });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

/** Reopen D-10 "사본 만들어 수정": ownerId always comes from the session, never the client. */
export async function copyTemplateFileAction(workId: string, nodeId: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.' };
  const result = await copyTemplateFile(supabase, { ownerId: user.id, workId, nodeId, name });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

/** "이 템플릿으로 새 문서": the client only sends a template id. The folder and template are
 * re-validated server-side right before the write and the template's current stored content is
 * used — a client-supplied body is never accepted. `templateId: null` = canonical default;
 * `parentId: null` = the category's root folder. */
export async function createDocumentFromTemplateAction(
  workId: string,
  input: { category: string; parentId: string | null; name: string; templateId: string | null }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.' };
  if (!KB_CATEGORIES.includes(input.category as KbCategory)) {
    return { ok: false as const, error: '문서 영역을 확인해주세요.' };
  }

  let parentId = input.parentId;
  if (parentId === null) {
    const listed = await listCategoryFolderCandidates(supabase, { ownerId: user.id, workId, category: input.category });
    if (listed.status !== 'ok') return { ok: false as const, error: '문서를 만들 폴더를 찾을 수 없어요. 새로고침 후 다시 시도해주세요.' };
    parentId = listed.root.id;
  } else {
    const folder = await validateTargetFolder(supabase, { ownerId: user.id, workId, category: input.category, targetFolderId: parentId });
    if (!folder.ok) return { ok: false as const, error: folder.error };
  }

  const template = await validateTargetTemplate(supabase, {
    ownerId: user.id, workId, category: input.category, templateId: input.templateId,
  });
  if (!template.ok) return { ok: false as const, error: TEMPLATE_REVALIDATION_FAILED };

  const result = await createNode(supabase, {
    ownerId: user.id, workId, parentId, category: input.category, nodeType: 'file', name: input.name,
    templateOverrideContent: template.template.scope === 'canonical' ? null : template.template.content,
  });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

/** KB-03: `workId` is always the CURRENT work page's id, used only for
 * revalidation — even when scope='account_template' inserts a row with
 * work_id=null (RESEARCH.md §2/§5.3). `parentId: null` = create directly
 * under a root. */
export async function createFolderAction(
  workId: string,
  scope: 'work' | 'account_template',
  parentId: string | null,
  name: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await createFolder(supabase, {
    ownerId: user.id,
    workId: scope === 'work' ? workId : null,
    scope,
    parentId,
    name,
  });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

export async function moveTemplateFileAction(workId: string, nodeId: string, targetCategoryFolderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await moveTemplateFile(supabase, { ownerId: user.id, nodeId, targetCategoryFolderId });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

export async function renameNodeAction(workId: string, nodeId: string, name: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await renameNode(supabase, { ownerId: user.id, nodeId, name });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

export async function deleteNodeAction(workId: string, nodeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const result = await deleteNode(supabase, { ownerId: user.id, nodeId });
  if (result.ok) revalidatePath(`/studio/${workId}`, 'layout');
  return result;
}

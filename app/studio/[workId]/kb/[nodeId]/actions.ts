'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createNode, renameNode, deleteNode, saveNodeContent, listTemplateOptions, createFolder } from '@/lib/kb/actions';
import type { KbCategory } from '@/lib/kb/templates';

export async function getNodeContentAction(nodeId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: '로그인이 필요해요.' };
  const { data } = await supabase.from('kb_nodes').select('content').eq('id', nodeId).eq('owner_id', user.id).maybeSingle();
  return { ok: true as const, content: data?.content ?? '' };
}

export async function saveNodeContentAction(workId: string, nodeId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
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

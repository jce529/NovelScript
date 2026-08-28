import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlatKbNode } from './tree';
import { buildSeedContent, readCanonicalSeed, type KbCategory } from './templates';

/** KB-02: merges the caller's work-scoped nodes with their account-level
 * template/ root + descendants into one flat list for buildTree to nest. */
export async function getKbTree(
  supabase: SupabaseClient,
  { ownerId, workId }: { ownerId: string; workId: string }
): Promise<FlatKbNode[]> {
  const [workNodes, accountNodes] = await Promise.all([
    supabase
      .from('kb_nodes')
      .select('id, parent_id, name, node_type, category, is_locked, scope')
      .eq('owner_id', ownerId)
      .eq('work_id', workId)
      .eq('scope', 'work')
      .is('deleted_at', null),
    supabase
      .from('kb_nodes')
      .select('id, parent_id, name, node_type, category, is_locked, scope')
      .eq('owner_id', ownerId)
      .eq('scope', 'account_template')
      .is('deleted_at', null),
  ]);

  return [...(workNodes.data ?? []), ...(accountNodes.data ?? [])] as FlatKbNode[];
}

export interface NodeMutationResult {
  ok: boolean;
  error?: string;
  nodeId?: string;
}

const FRIENDLY_NAME_COLLISION = '이미 같은 이름의 파일/폴더가 있어요. 다른 이름을 사용해주세요.';
const FRIENDLY_LOCKED = '기본 폴더는 이름을 바꾸거나 삭제할 수 없어요.';

async function resolveTemplateOverride(
  supabase: SupabaseClient,
  { ownerId, workId, category }: { ownerId: string; workId: string; category: KbCategory }
): Promise<string | null> {
  // Pattern 3: work-local override > account-level override > canonical (null = canonical)
  const { data: workTemplateFolder } = await supabase
    .from('kb_nodes').select('id').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').is('deleted_at', null).maybeSingle();
  if (workTemplateFolder) {
    const { data: workOverride } = await supabase
      .from('kb_nodes').select('content').eq('parent_id', workTemplateFolder.id).eq('name', category).is('deleted_at', null).maybeSingle();
    if (workOverride?.content) return workOverride.content;
  }

  const { data: accountTemplateFolder } = await supabase
    .from('kb_nodes').select('id').eq('owner_id', ownerId).eq('scope', 'account_template').eq('category', 'template').eq('node_type', 'folder').is('deleted_at', null).maybeSingle();
  if (accountTemplateFolder) {
    const { data: accountOverride } = await supabase
      .from('kb_nodes').select('content').eq('parent_id', accountTemplateFolder.id).eq('name', category).is('deleted_at', null).maybeSingle();
    if (accountOverride?.content) return accountOverride.content;
  }

  return null;
}

export interface TemplateOption {
  id: string | null; // null = canonical seed (docs/Template file, no kb_nodes row)
  name: string;
  scope: 'work' | 'account_template' | 'canonical';
  content: string;
  isDefault: boolean;
}

/** D-10: full create-time template picker. Lists EVERY selectable template source
 * for a category — this work's local template/ files, the account-level template/
 * files, and the canonical docs/Template seed — regardless of filename. An
 * arbitrarily-named custom template (e.g. "내캐릭터양식") is fully listed and
 * selectable here, closing the gap where only an exact category-name match had
 * any effect. The category-name-matched file is flagged isDefault (work-level
 * match wins over account-level match wins over canonical), matching Pattern 3's
 * priority order for the case where the writer doesn't explicitly pick one. */
export async function listTemplateOptions(
  supabase: SupabaseClient,
  { ownerId, workId, category }: { ownerId: string; workId: string; category: KbCategory }
): Promise<TemplateOption[]> {
  const options: TemplateOption[] = [];

  const { data: workTemplateFolder } = await supabase
    .from('kb_nodes').select('id').eq('work_id', workId).eq('category', 'template').eq('node_type', 'folder').is('deleted_at', null).maybeSingle();
  if (workTemplateFolder) {
    const { data: workFiles } = await supabase
      .from('kb_nodes').select('id, name, content').eq('parent_id', workTemplateFolder.id).eq('node_type', 'file').is('deleted_at', null);
    for (const file of workFiles ?? []) {
      options.push({ id: file.id, name: file.name, scope: 'work', content: file.content ?? '', isDefault: false });
    }
  }

  const { data: accountTemplateFolder } = await supabase
    .from('kb_nodes').select('id').eq('owner_id', ownerId).eq('scope', 'account_template').eq('category', 'template').eq('node_type', 'folder').is('deleted_at', null).maybeSingle();
  if (accountTemplateFolder) {
    const { data: accountFiles } = await supabase
      .from('kb_nodes').select('id, name, content').eq('parent_id', accountTemplateFolder.id).eq('node_type', 'file').is('deleted_at', null);
    for (const file of accountFiles ?? []) {
      options.push({ id: file.id, name: file.name, scope: 'account_template', content: file.content ?? '', isDefault: false });
    }
  }

  options.push({
    id: null,
    name: `기본 ${category} 템플릿`,
    scope: 'canonical',
    content: await readCanonicalSeed(category),
    isDefault: false,
  });

  const workMatch = options.find((o) => o.scope === 'work' && o.name === category);
  const accountMatch = options.find((o) => o.scope === 'account_template' && o.name === category);
  const defaultOption = workMatch ?? accountMatch ?? options[options.length - 1];
  defaultOption.isDefault = true;

  return options;
}

export async function createNode(
  supabase: SupabaseClient,
  input: {
    ownerId: string;
    workId: string;
    parentId: string;
    category: string;
    nodeType: 'folder' | 'file';
    name: string;
    /** D-10: explicit create-time template selection (from listTemplateOptions).
     * `undefined` (not passed) = auto-resolve via Pattern 3 (resolveTemplateOverride),
     * preserving prior behavior. A defined value (including `null`, meaning the
     * writer explicitly picked the canonical option) BYPASSES auto-resolution. */
    templateOverrideContent?: string | null;
  }
): Promise<NodeMutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: '이름을 입력해주세요.' };

  let content: string | null = null;
  if (input.nodeType === 'file' && input.category !== 'template') {
    const category = input.category as KbCategory;
    const override = input.templateOverrideContent !== undefined
      ? input.templateOverrideContent
      : await resolveTemplateOverride(supabase, { ownerId: input.ownerId, workId: input.workId, category });
    content = await buildSeedContent(category, name, override);
  }

  const { data, error } = await supabase
    .from('kb_nodes')
    .insert({
      owner_id: input.ownerId,
      work_id: input.workId,
      scope: 'work',
      parent_id: input.parentId,
      node_type: input.nodeType,
      category: input.category,
      is_locked: false,
      name,
      content,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: FRIENDLY_NAME_COLLISION };
    return { ok: false, error: error.message };
  }
  return { ok: true, nodeId: data.id };
}

export async function renameNode(
  supabase: SupabaseClient,
  { ownerId, nodeId, name }: { ownerId: string; nodeId: string; name: string }
): Promise<NodeMutationResult> {
  const { error, data } = await supabase
    .from('kb_nodes')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', nodeId)
    .eq('owner_id', ownerId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.message.includes('locked_node_immutable')) return { ok: false, error: FRIENDLY_LOCKED };
    if (error.code === '23505') return { ok: false, error: FRIENDLY_NAME_COLLISION };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: '문서를 찾을 수 없어요.' };
  return { ok: true, nodeId: data.id };
}

export async function deleteNode(
  supabase: SupabaseClient,
  { ownerId, nodeId }: { ownerId: string; nodeId: string }
): Promise<NodeMutationResult> {
  const { error, data } = await supabase
    .from('kb_nodes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', nodeId)
    .eq('owner_id', ownerId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (error.message.includes('locked_node_immutable')) return { ok: false, error: FRIENDLY_LOCKED };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: '문서를 찾을 수 없어요.' };
  return { ok: true, nodeId: data.id };
}

export async function saveNodeContent(
  supabase: SupabaseClient,
  { ownerId, nodeId, content }: { ownerId: string; nodeId: string; content: string }
): Promise<NodeMutationResult> {
  const { error, data } = await supabase
    .from('kb_nodes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', nodeId)
    .eq('owner_id', ownerId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: '문서를 찾을 수 없어요.' };
  return { ok: true, nodeId: data.id };
}

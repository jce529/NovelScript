import type { SupabaseClient } from '@supabase/supabase-js';
import type { FlatKbNode } from './tree';
import { buildSeedContent, readCanonicalSeed, type KbCategory } from './templates';
import { checkWriteAccess, writeDenial, type WriteDenialCode } from '../auth/write-access';
import { FOLDER_COPY } from './folder-copy';
import { templateCategoryOf } from './template-tree';
export { FOLDER_COPY } from './folder-copy';

/** KB-04 §2 (RESEARCH.md): 작품 폴더 and 계정 공유 폴더 are two separate, explicit
 * tree sections in the UI (D-01) — each needs its own flat node list. Replaces
 * the old getKbTree, which merged both scopes into one array (breaking change,
 * intentional — see tests/kb/tree-query.test.ts, updated in this same plan). */
export async function getWorkKbNodes(
  supabase: SupabaseClient,
  { ownerId, workId }: { ownerId: string; workId: string }
): Promise<FlatKbNode[]> {
  const { data } = await supabase
    .from('kb_nodes')
    .select('id, parent_id, name, node_type, category, is_locked, scope')
    .eq('owner_id', ownerId)
    .eq('work_id', workId)
    .eq('scope', 'work')
    .is('deleted_at', null);
  return (data ?? []) as FlatKbNode[];
}

export async function getAccountSharedNodes(
  supabase: SupabaseClient,
  { ownerId }: { ownerId: string }
): Promise<FlatKbNode[]> {
  const { data } = await supabase
    .from('kb_nodes')
    .select('id, parent_id, name, node_type, category, is_locked, scope')
    .eq('owner_id', ownerId)
    .eq('scope', 'account_template')
    .is('deleted_at', null);
  return (data ?? []) as FlatKbNode[];
}

export interface NodeMutationResult {
  ok: boolean;
  error?: string;
  nodeId?: string;
  code?: WriteDenialCode;
}

const FRIENDLY_NAME_COLLISION = '이미 같은 이름의 파일/폴더가 있어요. 다른 이름을 사용해주세요.';
const FRIENDLY_LOCKED = '기본 폴더는 이름을 바꾸거나 삭제할 수 없어요.';
/** Reopen D-10 (2026-10-12): the 5 default templates are read-only; edits go to a copy. */
export const FRIENDLY_LOCKED_TEMPLATE = '기본 템플릿은 수정·이름 변경·삭제·이동할 수 없어요. 사본을 만들어 수정해주세요.';
/** 0023 kb_nodes_template_area_name_unique: template names are unique per owner + area. */
export const FRIENDLY_TEMPLATE_NAME_COLLISION = '이미 같은 이름의 템플릿이 있어요. 다른 이름을 사용해주세요.';
export const FRIENDLY_TEMPLATE_NAME_RESERVED = '기본 템플릿 이름은 사용할 수 없어요. 다른 이름을 사용해주세요.';
const FRIENDLY_NOT_FOUND = '문서를 찾을 수 없어요.';
const FRIENDLY_UNAVAILABLE = '지금은 이 작업을 처리할 수 없어요. 잠시 후 다시 시도해주세요.';

type DbError = { code?: string; message?: string } | null;
const dbMessageIncludes = (error: DbError, marker: string) => Boolean(error?.message?.includes(marker));
const isLockedGuardError = (error: DbError) =>
  dbMessageIncludes(error, 'locked_template_immutable') || dbMessageIncludes(error, 'locked_node_immutable');

type MutationSource = { id: string; category: string; node_type: string; is_locked: boolean };
const isTemplateFile = (node: { category: string; node_type: string }) =>
  node.category === 'template' && node.node_type === 'file';
const isLockedTemplate = (node: MutationSource) => isTemplateFile(node) && node.is_locked === true;

/** Maps template-name DB errors (0023 unique index / reserved-name guard) to friendly copy. */
function templateNameError(error: DbError): string | null {
  if (error?.code === '23505') return FRIENDLY_TEMPLATE_NAME_COLLISION;
  if (dbMessageIncludes(error, 'template_name_reserved')) return FRIENDLY_TEMPLATE_NAME_RESERVED;
  return null;
}

/** Owner-scoped, active-only read of a mutation target. Server Actions are untrusted entry
 * points, so the lock decision is made from the DB row, never from caller input. */
async function readMutationSource(
  supabase: SupabaseClient, ownerId: string, nodeId: string,
): Promise<{ ok: true; source: MutationSource } | { ok: false; error: string }> {
  const { data, error } = await supabase.from('kb_nodes')
    .select('id, category, node_type, is_locked')
    .eq('id', nodeId).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  if (error) return { ok: false, error: FRIENDLY_UNAVAILABLE };
  if (!data) return { ok: false, error: FRIENDLY_NOT_FOUND };
  return { ok: true, source: data as MutationSource };
}

async function findTemplateCategoryFolder(
  supabase: SupabaseClient, ownerId: string, rootId: string, category: KbCategory,
): Promise<string | null> {
  const { data } = await supabase.from('kb_nodes').select('id')
    .eq('owner_id', ownerId).eq('parent_id', rootId).eq('name', category).eq('category', 'template')
    .eq('node_type', 'folder').is('deleted_at', null).maybeSingle();
  return data?.id ?? null;
}

/** Unlocked (user-owned) template files directly under the owner's category folder of one area.
 * Locked rows are the read-only defaults — they are the canonical seed already, so listing them
 * again would show the default once per area. */
async function listCustomTemplateFiles(
  supabase: SupabaseClient, ownerId: string, rootId: string, category: KbCategory,
): Promise<{ id: string; name: string; content: string | null }[]> {
  const categoryFolderId = await findTemplateCategoryFolder(supabase, ownerId, rootId, category);
  if (!categoryFolderId) return [];
  const { data } = await supabase.from('kb_nodes').select('id, name, content, is_locked')
    .eq('owner_id', ownerId).eq('parent_id', categoryFolderId).eq('node_type', 'file').is('deleted_at', null);
  return ((data ?? []) as { id: string; name: string; content: string | null; is_locked: boolean }[])
    .filter((file) => file.is_locked !== true);
}

export interface TemplateOption {
  id: string | null; // null = canonical seed (docs/Template file, no kb_nodes row)
  name: string;
  scope: 'work' | 'account_template' | 'canonical';
  content: string;
  isDefault: boolean;
}

/** D-10 as revised by the Reopen decision (2026-10-12): the create-time template picker.
 * The default is always exactly one option — the read-only canonical docs/Template seed
 * (id null, isDefault). The locked per-area copies of that default are not listed again.
 * The writer's own unlocked templates (`내 템플릿`, e.g. "내캐릭터양식" or "인물 사본") are
 * listed per area (work vs account, distinguished by `scope` and id) for explicit selection;
 * a category-named file no longer overrides the default. Every read is owner-scoped, so
 * another owner's tree can never become selectable. Phase 15 consumers rely on
 * validateTargetTemplate(null) resolving to this canonical option. */
export async function listTemplateOptions(
  supabase: SupabaseClient,
  { ownerId, workId, category }: { ownerId: string; workId: string; category: KbCategory }
): Promise<TemplateOption[]> {
  const options: TemplateOption[] = [];

  const { data: workTemplateFolder } = await supabase
    .from('kb_nodes').select('id').eq('owner_id', ownerId).eq('work_id', workId).eq('scope', 'work')
    .eq('category', 'template').eq('node_type', 'folder').is('parent_id', null).is('deleted_at', null).maybeSingle();
  if (workTemplateFolder) {
    for (const file of await listCustomTemplateFiles(supabase, ownerId, workTemplateFolder.id, category)) {
      options.push({ id: file.id, name: file.name, scope: 'work', content: file.content ?? '', isDefault: false });
    }
  }

  const { data: accountTemplateFolder } = await supabase
    .from('kb_nodes').select('id').eq('owner_id', ownerId).eq('scope', 'account_template').eq('category', 'template').eq('node_type', 'folder').is('parent_id', null).is('deleted_at', null).maybeSingle();
  if (accountTemplateFolder) {
    for (const file of await listCustomTemplateFiles(supabase, ownerId, accountTemplateFolder.id, category)) {
      options.push({ id: file.id, name: file.name, scope: 'account_template', content: file.content ?? '', isDefault: false });
    }
  }

  options.push({
    id: null,
    name: `기본 ${category} 템플릿`,
    scope: 'canonical',
    content: await readCanonicalSeed(category),
    isDefault: true,
  });

  return options;
}

export const TEMPLATE_REVALIDATION_FAILED = '저장 템플릿이 변경되었어요. 다시 선택해주세요.';

export async function validateTargetTemplate(
  supabase: SupabaseClient,
  { ownerId, workId, category, templateId }: { ownerId: string; workId: string; category: string; templateId: string | null }
): Promise<{ ok: true; template: TemplateOption } | { ok: false }> {
  const templates = await listTemplateOptions(supabase, { ownerId, workId, category: category as KbCategory });
  const template = templateId === null
    ? templates.find((option) => option.isDefault)
    : templates.find((option) => option.id === templateId);
  return template ? { ok: true, template } : { ok: false };
}

export interface FolderCandidate {
  id: string;
  name: string;
  isRoot: boolean;
  /** 카테고리 루트를 제외한 경로. 루트는 ''. 예: '주요 등장인물/핵심' */
  path: string;
  /** 루트→자신 'id:name' 체인. 저장 직전 재검증에 쓴다. */
  version: string;
}

export type FolderCandidatesResult =
  | { status: 'ok'; root: FolderCandidate; candidates: FolderCandidate[] }
  | { status: 'root_missing' }
  | { status: 'root_duplicate' }
  | { status: 'query_failed' };

export const MAX_FOLDER_DEPTH = 32;

type CategoryFolderRow = { id: string; name: string; parent_id: string | null };

/** Returns only folders connected to the single explicit structural root. */
export async function listCategoryFolderCandidates(
  supabase: SupabaseClient,
  { ownerId, workId, category }: { ownerId: string; workId: string; category: string }
): Promise<FolderCandidatesResult> {
  const { data, error } = await supabase
    .from('kb_nodes')
    .select('id, name, parent_id')
    .eq('owner_id', ownerId)
    .eq('work_id', workId)
    .eq('scope', 'work')
    .eq('category', category)
    .eq('node_type', 'folder')
    .is('deleted_at', null);
  if (error || !data) return { status: 'query_failed' };

  const rows = data as CategoryFolderRow[];
  const roots = rows.filter((row) => row.parent_id === null);
  if (roots.length === 0) return { status: 'root_missing' };
  if (roots.length > 1) return { status: 'root_duplicate' };

  const rootRow = roots[0];
  const byId = new Map(rows.map((row) => [row.id, row]));

  function chainToRoot(row: CategoryFolderRow): CategoryFolderRow[] | null {
    const chain = [row];
    const visited = new Set([row.id]);
    let current = row;
    while (current.parent_id !== null) {
      if (chain.length > MAX_FOLDER_DEPTH) return null;
      const parent = byId.get(current.parent_id);
      if (!parent || visited.has(parent.id)) return null;
      visited.add(parent.id);
      chain.unshift(parent);
      current = parent;
    }
    return current.id === rootRow.id ? chain : null;
  }

  const toCandidate = (chain: CategoryFolderRow[]): FolderCandidate => {
    const self = chain[chain.length - 1];
    return {
      id: self.id,
      name: self.name,
      isRoot: chain.length === 1,
      path: chain.slice(1).map((row) => row.name).join('/'),
      version: chain.map((row) => `${row.id}:${row.name}`).join('/'),
    };
  };

  const root = toCandidate([rootRow]);
  const rest: FolderCandidate[] = [];
  for (const row of rows) {
    if (row.id === rootRow.id) continue;
    const chain = chainToRoot(row);
    if (chain) rest.push(toCandidate(chain));
  }
  rest.sort((a, b) => a.path.localeCompare(b.path) || a.id.localeCompare(b.id));
  return { status: 'ok', root, candidates: [root, ...rest] };
}

export function formatFolderPath(category: string, path: string, separator: string): string {
  return path ? `${category}${separator}${path}` : category;
}

export type TargetFolderValidation =
  | { ok: true; folder: FolderCandidate }
  | { ok: false; reason: keyof typeof FOLDER_COPY; error: string };

/** Rechecks the selected destination and its root-to-folder version before saving. */
export async function validateTargetFolder(
  supabase: SupabaseClient,
  { ownerId, workId, category, targetFolderId, expectedVersion }:
    { ownerId: string; workId: string; category: string; targetFolderId: string; expectedVersion?: string }
): Promise<TargetFolderValidation> {
  const listed = await listCategoryFolderCandidates(supabase, { ownerId, workId, category });
  if (listed.status !== 'ok') return { ok: false, reason: listed.status, error: FOLDER_COPY[listed.status] };
  const folder = listed.candidates.find((candidate) => candidate.id === targetFolderId);
  if (!folder || (expectedVersion !== undefined && folder.version !== expectedVersion)) {
    return { ok: false, reason: 'folder_changed', error: FOLDER_COPY.folder_changed };
  }
  return { ok: true, folder };
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
    /** D-10 (Reopen 2026-10-12): explicit create-time template selection (from
     * listTemplateOptions). A string is the picked `내 템플릿` raw content; `null` or
     * `undefined` both mean the canonical default — a category-named file no longer
     * overrides it automatically. */
    templateOverrideContent?: string | null;
    /** Persist generated content directly in the single node insert. */
    initialContent?: string;
  }
): Promise<NodeMutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: '이름을 입력해주세요.' };
  const access = await checkWriteAccess(supabase, input.ownerId);
  if (!access.ok) return writeDenial(access);

  let scope: 'work' | 'account_template' = 'work';
  let workId: string | null = input.workId;
  let templateCategory: KbCategory | null = null;
  if (input.category === 'template') {
    if (input.nodeType !== 'file') return { ok: false, error: '템플릿 폴더는 새로 만들 수 없어요.' };
    const { data: parent } = await supabase.from('kb_nodes')
      .select('id, parent_id, name, category, node_type, scope, work_id')
      .eq('id', input.parentId).eq('owner_id', input.ownerId).is('deleted_at', null).maybeSingle();
    if (!parent || (parent.scope === 'work' && parent.work_id !== input.workId)) {
      return { ok: false, error: '템플릿 카테고리 폴더를 찾을 수 없어요.' };
    }
    const { data: root } = parent.parent_id
      ? await supabase.from('kb_nodes').select('id, parent_id, name, category, node_type, scope, work_id')
        .eq('id', parent.parent_id).eq('owner_id', input.ownerId).is('deleted_at', null).maybeSingle()
      : { data: null };
    templateCategory = templateCategoryOf(parent, root);
    if (!templateCategory || !root || root.scope !== parent.scope || root.work_id !== parent.work_id) {
      return { ok: false, error: '템플릿은 카테고리 폴더 안에만 만들 수 있어요.' };
    }
    scope = parent.scope;
    workId = parent.work_id;
  }

  let content: string | null = null;
  if (templateCategory) {
    content = await readCanonicalSeed(templateCategory);
  } else if (input.initialContent !== undefined) {
    content = input.initialContent;
  } else if (input.nodeType === 'file' && input.category !== 'template') {
    content = await buildSeedContent(input.category as KbCategory, name, input.templateOverrideContent ?? null);
  }

  const { data, error } = await supabase
    .from('kb_nodes')
    .insert({
      owner_id: input.ownerId,
      work_id: workId,
      scope,
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
    if (templateCategory) {
      const friendly = templateNameError(error);
      if (friendly) return { ok: false, error: friendly };
    }
    if (error.code === '23505') return { ok: false, error: FRIENDLY_NAME_COLLISION };
    return { ok: false, error: error.message };
  }
  return { ok: true, nodeId: data.id };
}

/** KB-03: creates a folder anywhere below a root. `parentId: null` means
 * directly under a root (work root when scope='work', 계정 공유 폴더 root when
 * scope='account_template') — category is then 'custom' (RESEARCH.md §1). A
 * non-null parentId means nested creation — category is ALWAYS derived from
 * the resolved parent's own category server-side (RESEARCH.md Pitfall 2),
 * never trusted from the caller, so a malicious/buggy client can never plant
 * a folder with category='회차' outside the real 회차 subtree, or otherwise
 * fake a structural category it shouldn't have. */
export async function createFolder(
  supabase: SupabaseClient,
  input: {
    ownerId: string;
    workId: string | null; // null for scope='account_template'
    scope: 'work' | 'account_template';
    parentId: string | null;
    name: string;
  }
): Promise<NodeMutationResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: '이름을 입력해주세요.' };
  const access = await checkWriteAccess(supabase, input.ownerId);
  if (!access.ok) return writeDenial(access);

  let category = 'custom';
  if (input.parentId) {
    const { data: parent } = await supabase
      .from('kb_nodes')
      .select('category, node_type, scope, work_id')
      .eq('id', input.parentId)
      .eq('owner_id', input.ownerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!parent || parent.node_type !== 'folder' || parent.scope !== input.scope || parent.work_id !== input.workId) {
      return { ok: false, error: '상위 폴더를 찾을 수 없어요.' };
    }
    if (parent.category === 'template') return { ok: false, error: '템플릿 폴더 안에는 새 폴더를 만들 수 없어요.' };
    category = parent.category;
  }

  const { data, error } = await supabase
    .from('kb_nodes')
    .insert({
      owner_id: input.ownerId,
      work_id: input.workId,
      scope: input.scope,
      parent_id: input.parentId,
      node_type: 'folder',
      category,
      is_locked: false,
      name,
      content: null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: FRIENDLY_NAME_COLLISION };
    return { ok: false, error: error.message };
  }
  return { ok: true, nodeId: data.id };
}

export async function moveTemplateFile(
  supabase: SupabaseClient,
  { ownerId, nodeId, targetCategoryFolderId }: { ownerId: string; nodeId: string; targetCategoryFolderId: string }
): Promise<NodeMutationResult> {
  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return writeDenial(access);

  const { data: source } = await supabase.from('kb_nodes')
    .select('id, parent_id, category, node_type, scope, work_id, is_locked')
    .eq('id', nodeId).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  if (source && isLockedTemplate(source)) return { ok: false, error: FRIENDLY_LOCKED_TEMPLATE };
  if (!source || source.category !== 'template' || source.node_type !== 'file' || !source.parent_id) {
    return { ok: false, error: '이동할 템플릿 파일을 찾을 수 없어요.' };
  }
  const { data: target } = await supabase.from('kb_nodes')
    .select('id, parent_id, name, category, node_type, scope, work_id')
    .eq('id', targetCategoryFolderId).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  const { data: sourceParent } = await supabase.from('kb_nodes')
    .select('id, parent_id, name, category, node_type, scope, work_id')
    .eq('id', source.parent_id).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  if (!target || !sourceParent || target.scope !== source.scope || target.work_id !== source.work_id ||
      sourceParent.scope !== source.scope || sourceParent.work_id !== source.work_id) {
    return { ok: false, error: '같은 영역의 템플릿 카테고리 폴더만 선택할 수 있어요.' };
  }
  const { data: root } = target.parent_id
    ? await supabase.from('kb_nodes').select('id, parent_id, name, category, node_type, scope, work_id')
      .eq('id', target.parent_id).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle()
    : { data: null };
  if (!root || root.scope !== source.scope || root.work_id !== source.work_id ||
      !templateCategoryOf(target, root) ||
      !(sourceParent.id === root.id || templateCategoryOf(sourceParent, root))) {
    return { ok: false, error: '템플릿 카테고리 폴더만 선택할 수 있어요.' };
  }

  const { data, error } = await supabase.from('kb_nodes')
    .update({ parent_id: target.id, updated_at: new Date().toISOString() })
    .eq('id', source.id).eq('owner_id', ownerId).is('deleted_at', null)
    .select('id').maybeSingle();
  if (error) {
    if (isLockedGuardError(error)) return { ok: false, error: FRIENDLY_LOCKED_TEMPLATE };
    if (error.code === '23505') return { ok: false, error: FRIENDLY_TEMPLATE_NAME_COLLISION };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: '이동할 템플릿 파일을 찾을 수 없어요.' };
  return { ok: true, nodeId: data.id };
}

type TemplateAreaNode = { id: string; parent_id: string | null; name: string; category: string; node_type: string; scope: string; work_id: string | null };
const TEMPLATE_AREA_COLUMNS = 'id, parent_id, name, category, node_type, scope, work_id';
const COPY_SOURCE_MISSING = '사본을 만들 템플릿을 찾을 수 없어요.';

/** Reopen D-10: "사본 만들어 수정". Copies an active template file the caller owns into the
 * same category folder as a new, unlocked `내 템플릿`. The source row is never written. The
 * content is the source's current raw content byte-for-byte (placeholders kept, empty kept) —
 * it deliberately does not go through createNode's canonical-only template initialisation.
 * The copy name comes from the UI; the server never auto-picks one. Area-wide name uniqueness
 * and reserved default names are enforced by the 0023 DB constraints and mapped here. */
export async function copyTemplateFile(
  supabase: SupabaseClient,
  { ownerId, workId, nodeId, name: rawName }: { ownerId: string; workId: string; nodeId: string; name: string }
): Promise<NodeMutationResult> {
  const name = rawName.trim();
  if (!name) return { ok: false, error: '이름을 입력해주세요.' };
  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return writeDenial(access);

  const { data: source, error: sourceError } = await supabase.from('kb_nodes')
    .select(`${TEMPLATE_AREA_COLUMNS}, content`)
    .eq('id', nodeId).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
  if (sourceError) return { ok: false, error: FRIENDLY_UNAVAILABLE };
  if (!source || !isTemplateFile(source) || !source.parent_id) return { ok: false, error: COPY_SOURCE_MISSING };
  const inArea = source.scope === 'work' ? source.work_id === workId
    : source.scope === 'account_template' ? source.work_id === null : false;
  if (!inArea) return { ok: false, error: COPY_SOURCE_MISSING };

  const readFolder = async (id: string) => {
    const { data, error } = await supabase.from('kb_nodes').select(TEMPLATE_AREA_COLUMNS)
      .eq('id', id).eq('owner_id', ownerId).is('deleted_at', null).maybeSingle();
    return error ? null : (data as TemplateAreaNode | null);
  };
  const parent = await readFolder(source.parent_id);
  const root = parent?.parent_id ? await readFolder(parent.parent_id) : null;
  const sameArea = (node: TemplateAreaNode | null) =>
    node !== null && node.scope === source.scope && node.work_id === source.work_id;
  if (!parent || !sameArea(parent) || !sameArea(root) || !templateCategoryOf(parent, root)) {
    return { ok: false, error: '템플릿 카테고리 폴더를 찾을 수 없어요.' };
  }

  const { data, error } = await supabase.from('kb_nodes')
    .insert({
      owner_id: ownerId,
      work_id: source.work_id,
      scope: source.scope,
      parent_id: parent.id,
      node_type: 'file',
      category: 'template',
      is_locked: false,
      name,
      content: source.content,
    })
    .select('id')
    .single();
  if (error) {
    return { ok: false, error: templateNameError(error) ?? '템플릿 사본을 만들지 못했어요. 잠시 후 다시 시도해주세요.' };
  }
  return { ok: true, nodeId: data.id };
}

export async function renameNode(
  supabase: SupabaseClient,
  { ownerId, nodeId, name }: { ownerId: string; nodeId: string; name: string }
): Promise<NodeMutationResult> {
  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return writeDenial(access);
  const read = await readMutationSource(supabase, ownerId, nodeId);
  if (!read.ok) return { ok: false, error: read.error };
  if (isLockedTemplate(read.source)) return { ok: false, error: FRIENDLY_LOCKED_TEMPLATE };
  const templateFile = isTemplateFile(read.source);
  const { error, data } = await supabase
    .from('kb_nodes')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', nodeId)
    .eq('owner_id', ownerId)
    .select('id')
    .maybeSingle();

  if (error) {
    if (isLockedGuardError(error)) return { ok: false, error: templateFile ? FRIENDLY_LOCKED_TEMPLATE : FRIENDLY_LOCKED };
    if (templateFile) {
      const friendly = templateNameError(error);
      if (friendly) return { ok: false, error: friendly };
    }
    if (error.code === '23505') return { ok: false, error: FRIENDLY_NAME_COLLISION };
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: FRIENDLY_NOT_FOUND };
  return { ok: true, nodeId: data.id };
}

/** Soft-delete goes through the soft_delete_kb_node RPC (security definer),
 * not a direct .update() — setting deleted_at makes the row fail the
 * SELECT policy's `deleted_at is null` USING clause, and Postgres RLS
 * rejects any caller-privilege UPDATE whose resulting row would become
 * invisible to its own owner ("new row violates row-level security
 * policy"), even with an explicit WITH CHECK that itself passes. */
export async function deleteNode(
  supabase: SupabaseClient,
  { ownerId, nodeId }: { ownerId: string; nodeId: string }
): Promise<NodeMutationResult> {
  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return writeDenial(access);
  const read = await readMutationSource(supabase, ownerId, nodeId);
  if (!read.ok) return { ok: false, error: read.error };
  if (isLockedTemplate(read.source)) return { ok: false, error: FRIENDLY_LOCKED_TEMPLATE };
  const { error, data } = await supabase.rpc('soft_delete_kb_node', {
    p_node_id: nodeId,
    p_owner_id: ownerId,
  });

  if (error) {
    if (isLockedGuardError(error)) {
      return { ok: false, error: isTemplateFile(read.source) ? FRIENDLY_LOCKED_TEMPLATE : FRIENDLY_LOCKED };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: FRIENDLY_NOT_FOUND };
  return { ok: true, nodeId: data };
}

export async function saveNodeContent(
  supabase: SupabaseClient,
  { ownerId, nodeId, content }: { ownerId: string; nodeId: string; content: string }
): Promise<NodeMutationResult> {
  const access = await checkWriteAccess(supabase, ownerId);
  if (!access.ok) return writeDenial(access);
  const read = await readMutationSource(supabase, ownerId, nodeId);
  if (!read.ok) return { ok: false, error: read.error };
  if (isLockedTemplate(read.source)) return { ok: false, error: FRIENDLY_LOCKED_TEMPLATE };
  const { error, data } = await supabase
    .from('kb_nodes')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', nodeId)
    .eq('owner_id', ownerId)
    .select('id')
    .maybeSingle();

  // A concurrent lock (or a stale client) still hits the DB guard; same copy guidance.
  if (error) return { ok: false, error: isLockedGuardError(error) ? FRIENDLY_LOCKED_TEMPLATE : error.message };
  if (!data) return { ok: false, error: FRIENDLY_NOT_FOUND };
  return { ok: true, nodeId: data.id };
}

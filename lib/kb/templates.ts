import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type KbCategory, KB_CATEGORIES } from './categories';

export type { KbCategory };
export { KB_CATEGORIES };

const CANONICAL_TEMPLATE_FILES: Record<KbCategory, string> = {
  '인물': '인물 템플릿.md',
  '장소': '장소 템플릿.md',
  '사건': '사건 템플릿.md',
  '세력': '세력 템플릿.md',
  '아이템': '아이템 템플릿.md',
};

/** Global, no-op-safe substitution. 사건 템플릿.md has zero occurrences by design
 * (Pitfall 3, 02-RESEARCH.md) — do not treat a zero-match result as an error. */
export function substituteTitle(raw: string, title: string): string {
  return raw.replaceAll(/<%\s*tp\.file\.title\s*%>/g, title);
}

/** Raw canonical seed (docs/Template original, leading BOM kept, Templater placeholders kept).
 * CR is removed so the result does not depend on the checkout's line endings (core.autocrlf)
 * and matches kb_template_seed_catalog in 0022_template_readonly_backfill.sql byte-for-byte —
 * the DB guard (0023) only accepts a locked default whose content equals that catalog row. */
export async function readCanonicalSeed(category: KbCategory): Promise<string> {
  const filePath = path.join(process.cwd(), 'docs', 'Template', CANONICAL_TEMPLATE_FILES[category]);
  return (await readFile(filePath, 'utf-8')).replaceAll('\r', '');
}

/** Pattern 3 (02-RESEARCH.md): work-local custom template > account-level custom
 * template > canonical seed file. Callers resolve the override content (a kb_nodes
 * row's `content`) and pass it in; this function does not query the DB itself. */
export async function buildSeedContent(
  category: KbCategory,
  title: string,
  overrideTemplateContent?: string | null
): Promise<string> {
  const raw = overrideTemplateContent ?? (await readCanonicalSeed(category));
  return substituteTitle(raw, title);
}

/** A locked default template row. Reopen D-10 (2026-10-12) replaced the old "editable
 * defaults" contract: the 5 defaults are read-only (is_locked: true) and writers edit a
 * `내 템플릿` copy instead. The DB guard (0023_template_policy_guards.sql) only accepts this
 * insert when name/content are the exact canonical values inside the owner's own locked
 * category folder. */
export interface KbNodeInsert {
  owner_id: string;
  work_id: string | null;
  scope: 'account_template' | 'work';
  parent_id: string;
  node_type: 'file';
  category: 'template';
  is_locked: true;
  name: KbCategory;
  content: string;
}

export interface SeedTemplateResult {
  /** Defaults inserted by this call. */
  created: KbCategory[];
  /** Locked defaults that were already present (no write, no change). */
  existing: KbCategory[];
  /** Slots held by an unlocked file with the default's name (pre-0022 data). Never
   * overwritten here — the 0022 migration preserves it as a copy and restores the default. */
  blocked: KbCategory[];
}

type SeedParams = {
  ownerId: string;
  workId: string | null;
  scope: 'account_template' | 'work';
  templateRootId: string;
};

type ExistingFile = { parent_id: string; name: string; is_locked: boolean };

/** Reopen D-10: both tiers' category folders hold the 5 canonical templates as READ-ONLY
 * (locked) files (name = category), raw — no title substitution, the placeholder stays
 * literal until a document is created from them. Idempotent: a locked default is never
 * rewritten, and user templates are never touched or overwritten. The template root is
 * re-read and checked against the caller's owner/scope/work before any write; a missing
 * root/folder and query failures throw with a clear message. */
export async function seedTemplateFiles(
  supabase: SupabaseClient,
  params: SeedParams
): Promise<SeedTemplateResult> {
  const { data: root, error: rootError } = await supabase
    .from('kb_nodes')
    .select('id, owner_id, scope, work_id, parent_id, node_type, category')
    .eq('id', params.templateRootId)
    .eq('owner_id', params.ownerId)
    .is('deleted_at', null)
    .maybeSingle();
  if (rootError) throw new Error(rootError.message);
  if (
    !root || root.owner_id !== params.ownerId || root.scope !== params.scope
    || (root.work_id ?? null) !== params.workId || root.parent_id !== null
    || root.node_type !== 'folder' || root.category !== 'template'
  ) {
    throw new Error('템플릿 영역을 찾을 수 없어요.');
  }

  const { data: folders, error: foldersError } = await supabase
    .from('kb_nodes')
    .select('id, name')
    .eq('owner_id', params.ownerId)
    .eq('parent_id', params.templateRootId)
    .eq('node_type', 'folder')
    .eq('category', 'template')
    .is('deleted_at', null);
  if (foldersError) throw new Error(foldersError.message);
  const folderByCategory = new Map<string, string>(
    ((folders ?? []) as Array<{ id: string; name: string }>).map((folder) => [folder.name, folder.id])
  );
  for (const category of KB_CATEGORIES) {
    if (!folderByCategory.has(category)) throw new Error(`템플릿 카테고리 폴더가 없어요: ${category}`);
  }

  const classify = async () => {
    const { data: files, error } = await supabase
      .from('kb_nodes')
      .select('parent_id, name, is_locked')
      .in('parent_id', [...folderByCategory.values()])
      .eq('node_type', 'file')
      .eq('category', 'template')
      .is('deleted_at', null);
    if (error) throw new Error(error.message);
    const result: SeedTemplateResult = { created: [], existing: [], blocked: [] };
    const missing: KbCategory[] = [];
    for (const category of KB_CATEGORIES) {
      const slot = ((files ?? []) as ExistingFile[]).find(
        (file) => file.parent_id === folderByCategory.get(category) && file.name === category
      );
      if (!slot) missing.push(category);
      else if (slot.is_locked) result.existing.push(category);
      else result.blocked.push(category);
    }
    return { result, missing };
  };

  const { result, missing } = await classify();
  if (missing.length === 0) return result;

  const rows: KbNodeInsert[] = await Promise.all(
    missing.map(async (category) => ({
      owner_id: params.ownerId,
      work_id: params.workId,
      scope: params.scope,
      parent_id: folderByCategory.get(category)!,
      node_type: 'file' as const,
      category: 'template' as const,
      is_locked: true as const,
      name: category,
      content: await readCanonicalSeed(category),
    }))
  );

  const { error } = await supabase.from('kb_nodes').insert(rows);
  if (error) {
    // A concurrent first visit seeded the same slots (unique name index): report the real state.
    if (error.code === '23505') return (await classify()).result;
    throw new Error(error.message);
  }
  return { ...result, created: missing };
}

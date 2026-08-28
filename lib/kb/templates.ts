import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type KbCategory = '인물' | '장소' | '사건' | '세력' | '아이템';

const CANONICAL_TEMPLATE_FILES: Record<KbCategory, string> = {
  '인물': '인물 템플릿.md',
  '장소': '장소 템플릿.md',
  '사건': '사건 템플릿.md',
  '세력': '세력 템플릿.md',
  '아이템': '아이템 템플릿.md',
};

export const KB_CATEGORIES: KbCategory[] = ['인물', '장소', '사건', '세력', '아이템'];

/** Global, no-op-safe substitution. 사건 템플릿.md has zero occurrences by design
 * (Pitfall 3, 02-RESEARCH.md) — do not treat a zero-match result as an error. */
export function substituteTitle(raw: string, title: string): string {
  return raw.replaceAll(/<%\s*tp\.file\.title\s*%>/g, title);
}

export async function readCanonicalSeed(category: KbCategory): Promise<string> {
  const filePath = path.join(process.cwd(), 'docs', 'Template', CANONICAL_TEMPLATE_FILES[category]);
  return readFile(filePath, 'utf-8');
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

export interface KbNodeInsert {
  owner_id: string;
  work_id: string | null;
  scope: 'account_template' | 'work';
  parent_id: string;
  node_type: 'file';
  category: 'template';
  is_locked: false;
  name: KbCategory;
  content: string;
}

/** D-10: both tiers' `template/` folder is pre-populated with the 5 canonical
 * templates as EDITABLE files (name = category, e.g. "인물"), verbatim, WITHOUT
 * title substitution (these are templates, not documents — the placeholder stays
 * literal until a real document is created from them). Idempotent: skips any
 * category that already has a file under templateRootId. Takes a minimal
 * client shape (only the two methods used) so callers can pass any Supabase
 * client (admin or session-scoped) without a hard dependency on its full type. */
export async function seedTemplateFiles(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => { eq: (col: string, val: string) => { eq: (col: string, val: string) => { is: (col: string, val: null) => Promise<{ data: { name: string }[] | null }> } } };
      insert: (rows: KbNodeInsert[]) => Promise<{ error: { message: string } | null }>;
    };
  },
  params: { ownerId: string; workId: string | null; scope: 'account_template' | 'work'; templateRootId: string }
): Promise<void> {
  const { data: existing } = await supabase
    .from('kb_nodes')
    .select('name')
    .eq('parent_id', params.templateRootId)
    .eq('node_type', 'file')
    .is('deleted_at', null);

  const existingNames = new Set((existing ?? []).map((row) => row.name));
  const missing = KB_CATEGORIES.filter((category) => !existingNames.has(category));
  if (missing.length === 0) return;

  const rows: KbNodeInsert[] = await Promise.all(
    missing.map(async (category) => ({
      owner_id: params.ownerId,
      work_id: params.workId,
      scope: params.scope,
      parent_id: params.templateRootId,
      node_type: 'file' as const,
      category: 'template' as const,
      is_locked: false as const,
      name: category,
      content: await readCanonicalSeed(category),
    }))
  );

  const { error } = await supabase.from('kb_nodes').insert(rows);
  if (error) throw new Error(error.message);
}

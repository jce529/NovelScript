import type { DecisionCandidate } from './types';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import type { FolderCandidate, TemplateOption } from '@/lib/kb/actions';

export interface OpaqueKeyMap<T> {
  candidates: DecisionCandidate[];
  resolve(key: string): T | undefined;
}

/** Keep database identifiers in the local map, never in Jev's candidate payload. */
export function buildOpaqueKeyMap<T>(
  items: T[],
  prefix: 'folder' | 'template',
  describe: (item: T) => Record<string, unknown>,
): OpaqueKeyMap<T> {
  const map = new Map<string, T>();
  const candidates = items.map((item, index) => {
    const key = `${prefix}_${index + 1}`;
    map.set(key, item);
    return { ...describe(item), key };
  });
  return { candidates, resolve: (key) => map.get(key) };
}

export const TASK_CANDIDATES = ['reply', 'draft', 'document', 'clarify'] as const;
export const CATEGORY_CANDIDATES = [...KB_CATEGORIES, 'clarify'] as const;

/** Deterministic Fisher-Yates shuffle used by candidate-order evaluations. */
export function shuffleArray<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = seed + 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 9301 + 49297) % 233280;
    const j = Math.floor((state / 233280) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sortFolderCandidates(folders: FolderCandidate[]): FolderCandidate[] {
  return [...folders].sort((a, b) => Number(b.isRoot) - Number(a.isRoot)
    || a.path.localeCompare(b.path)
    || a.id.localeCompare(b.id));
}

const SCOPE_RANK: Record<string, number> = { work: 0, account_template: 1, canonical: 2 };

export function sortTemplateOptions(templates: TemplateOption[]): TemplateOption[] {
  return [...templates].sort((a, b) => (SCOPE_RANK[a.scope] ?? 9) - (SCOPE_RANK[b.scope] ?? 9)
    || a.name.localeCompare(b.name)
    || (a.id ?? '').localeCompare(b.id ?? ''));
}


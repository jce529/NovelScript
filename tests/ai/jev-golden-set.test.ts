import { describe, expect, it } from 'vitest';
import { KB_CATEGORIES } from '@/lib/kb/categories';
import {
  datasetHash,
  FolderTemplateItemSchema,
  GoldenItemSchema,
  loadFolderTemplateSet,
  loadGoldenSet,
} from '@/lib/ai/decision/eval/golden-set';

describe('Jev v1 synthetic golden sets', () => {
  const golden = loadGoldenSet();
  const folderTemplate = loadFolderTemplateSet();

  it('loads 100-300 schema-valid, reviewed rows with provenance', () => {
    expect(golden.length).toBeGreaterThanOrEqual(100);
    expect(golden.length).toBeLessThanOrEqual(300);
    for (const row of golden) {
      expect(GoldenItemSchema.safeParse(row).success, row.id).toBe(true);
      expect(row.rationale.trim().length).toBeGreaterThanOrEqual(10);
      expect(row.reviewer).toBe('claude-synthetic-v1');
    }
  });

  it('requires a category only for document tasks', () => {
    for (const row of golden) {
      if (row.expectedTask === 'document') expect(KB_CATEGORIES).toContain(row.expectedCategory);
      else expect(row.expectedCategory).toBeUndefined();
    }
  });

  it('has class and category coverage', () => {
    const count = (task: string, category?: string) => golden.filter((row) =>
      row.expectedTask === task && (category === undefined || row.expectedCategory === category)).length;
    for (const category of KB_CATEGORIES) expect(count('document', category)).toBeGreaterThanOrEqual(15);
    expect(count('clarify')).toBeGreaterThanOrEqual(20);
    expect(count('reply')).toBeGreaterThanOrEqual(20);
    expect(count('draft')).toBeGreaterThanOrEqual(20);
  });

  it('stratifies all required difficult scenarios', () => {
    for (const tag of ['ambiguous', 'compound', 'negation', 'typo', 'cross_category', 'prompt_injection', 'long_context']) {
      expect(golden.filter((row) => row.tags.includes(tag)).length, tag).toBeGreaterThanOrEqual(8);
    }
    const longContextRows = golden.filter((row) => row.tags.includes('long_context'));
    expect(longContextRows.length).toBeGreaterThanOrEqual(8);
    expect(longContextRows.every((row) => row.state.chapterContext.length >= 1500)).toBe(true);
  });

  it('keeps holdout dominant while both splits contain every task class', () => {
    const holdout = golden.filter((row) => row.split === 'holdout');
    const calibration = golden.filter((row) => row.split === 'calibration');
    expect(holdout.length / golden.length).toBeGreaterThanOrEqual(0.6);
    expect(calibration.length / golden.length).toBeGreaterThanOrEqual(0.25);
    for (const split of [holdout, calibration]) {
      for (const task of ['document', 'clarify', 'reply', 'draft']) expect(split.some((row) => row.expectedTask === task)).toBe(true);
    }
  });

  it('uses unique non-UUID ids and entirely synthetic-looking identifiers', () => {
    const ids = golden.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(golden)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });

  it('loads at least 40 valid folder/template scenarios with candidate references', () => {
    expect(folderTemplate.length).toBeGreaterThanOrEqual(40);
    for (const row of folderTemplate) {
      expect(FolderTemplateItemSchema.safeParse(row).success, row.id).toBe(true);
      expect(row.folders.filter((folder) => folder.isRoot && folder.path === '')).toHaveLength(1);
      expect(row.templates.filter((template) => template.isDefault)).toHaveLength(1);
      expect(row.folders.some((folder) => folder.id === row.expectedFolderId)).toBe(true);
      if (row.expectedTemplateId !== null) expect(row.templates.some((template) => template.id === row.expectedTemplateId)).toBe(true);
    }
    for (const category of KB_CATEGORIES) expect(folderTemplate.filter((row) => row.category === category).length).toBeGreaterThanOrEqual(8);
    expect(folderTemplate.filter((row) => row.folders.length === 1).length).toBeGreaterThanOrEqual(3);
  });

  it('hashes both exact JSONL byte streams deterministically', () => {
    const first = datasetHash();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(datasetHash()).toBe(first);
  });

  it('keeps split ids disjoint and assigns each row to exactly one split', () => {
    for (const rows of [golden, folderTemplate]) {
      const holdout = new Set(rows.filter((row) => row.split === 'holdout').map((row) => row.id));
      const calibration = new Set(rows.filter((row) => row.split === 'calibration').map((row) => row.id));
      expect([...holdout].some((id) => calibration.has(id))).toBe(false);
      expect(holdout.size + calibration.size).toBe(rows.length);
    }
  });
});

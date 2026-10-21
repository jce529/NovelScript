import { describe, expect, it } from 'vitest';
import {
  WORLD_TREE_ELIGIBILITY,
  ELIGIBILITY_TRIM_CODE_POINTS,
  ELIGIBILITY_POLICY_SQL_BEGIN,
  ELIGIBILITY_POLICY_SQL_END,
  renderEligibilityPolicySql,
} from '@/lib/world-tree/eligibility';
import { KB_CATEGORIES } from '@/lib/kb/categories';

const sql = renderEligibilityPolicySql();

function functionBlock(name: string): string {
  const start = sql.indexOf(`create or replace function ${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end + 3);
}

describe('renderEligibilityPolicySql — generated from WORLD_TREE_ELIGIBILITY', () => {
  it('is deterministic and wrapped in generated-block markers', () => {
    expect(renderEligibilityPolicySql()).toBe(sql);
    expect(sql.startsWith(ELIGIBILITY_POLICY_SQL_BEGIN)).toBe(true);
    expect(sql.trimEnd().endsWith(ELIGIBILITY_POLICY_SQL_END)).toBe(true);
  });

  it('emits every threshold under its own column', () => {
    const block = functionBlock('world_tree_eligibility_thresholds');
    expect(block).toContain(`${WORLD_TREE_ELIGIBILITY.minPublishedChapters}::integer as min_published_chapters`);
    expect(block).toContain(`${WORLD_TREE_ELIGIBILITY.minDocumentBodyChars}::integer as min_document_body_chars`);
    expect(block).toContain(`${WORLD_TREE_ELIGIBILITY.minSettingDocuments}::integer as min_setting_documents`);
    for (const [category, min] of Object.entries(WORLD_TREE_ELIGIBILITY.categoryMinimums)) {
      expect(block).toContain(`'${category}', ${min}`);
    }
    expect(block).toMatch(/jsonb_build_object\([^)]*\) as category_minimums/);
  });

  it('category_minimums carries exactly the constant keys and values', () => {
    const block = functionBlock('world_tree_eligibility_thresholds');
    const match = block.match(/jsonb_build_object\(([^)]*)\) as category_minimums/);
    const pairs = [...match![1].matchAll(/'([^']+)',\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
    expect(Object.fromEntries(pairs)).toEqual({ ...WORLD_TREE_ELIGIBILITY.categoryMinimums });
  });

  it('counted categories are the real KB category keys (no separate English scheme)', () => {
    const block = functionBlock('world_tree_eligibility_thresholds');
    const match = block.match(/array\[([^\]]*)\]::text\[\] as counted_categories/);
    const keys = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(keys).toEqual([...KB_CATEGORIES]);
    expect(block).not.toMatch(/'(character|place|event|faction|item|template|회차|custom)'/);
  });

  it('body normalization uses the shared trim set and Unicode char_length semantics', () => {
    const body = functionBlock('world_tree_eligibility_body');
    expect(body).toContain("replace(coalesce(p_content, ''), chr(13), '')");
    for (const cp of ELIGIBILITY_TRIM_CODE_POINTS) expect(body).toContain(`chr(${cp})`);
    expect([...body.matchAll(/chr\((\d+)\)/g)].map((m) => Number(m[1])).filter((n) => n !== 13)).toEqual([
      ...ELIGIBILITY_TRIM_CODE_POINTS,
    ]);
  });

  it('seed provenance helper substitutes the title placeholder literally', () => {
    const seed = functionBlock('world_tree_eligibility_is_untouched_seed');
    expect(seed).toContain('world_tree_eligibility_body(p_seed)');
    expect(seed).toContain("tp\\.file\\.title");
    // Backslashes in the document name are escaped so regexp_replace cannot expand them.
    expect(seed).toContain("replace(p_name, '\\', '\\\\')");
  });
});

describe('policy SQL security contract', () => {
  it('thresholds function takes no arguments, so callers cannot pass or override values', () => {
    expect(sql).toContain('create or replace function world_tree_eligibility_thresholds()\n');
    expect(sql).not.toMatch(/p_min|p_threshold|p_category_min/i);
  });

  it('functions are immutable, pinned search_path, and not granted to client roles', () => {
    const names = ['world_tree_eligibility_thresholds', 'world_tree_eligibility_body', 'world_tree_eligibility_is_untouched_seed'];
    for (const name of names) {
      const block = functionBlock(name);
      expect(block).toMatch(/\bimmutable\b/);
      expect(block).toContain('set search_path = pg_catalog');
      expect(block).not.toMatch(/security definer/i);
      expect(sql).toMatch(new RegExp(`revoke all on function ${name}\\([^)]*\\) from public, anon, authenticated;`));
    }
    expect(sql).not.toMatch(/\bgrant\b/i);
  });

  it('has no public mutation path (no tables, writes or policies)', () => {
    expect(sql).not.toMatch(/\b(create table|insert into|update\s+\w+\s+set|delete from|create policy|alter table)\b/i);
    expect(sql).not.toMatch(/\bvolatile\b/i);
  });
});

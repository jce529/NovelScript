import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Returns problems found in a list of migration file names (empty = ok). */
export function findNumberingProblems(files: string[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file);
    if (!match) {
      problems.push(`invalid name: ${file}`);
      continue;
    }
    const prior = seen.get(match[1]);
    if (prior) problems.push(`duplicate number ${match[1]}: ${prior}, ${file}`);
    else seen.set(match[1], file);
  }
  return problems;
}

describe('migration numbering guard', () => {
  it('accepts unique four-digit prefixes', () => {
    expect(findNumberingProblems(['0001_init.sql', '0002_studio.sql'])).toEqual([]);
  });

  it('rejects duplicate prefixes', () => {
    expect(findNumberingProblems(['0015_a.sql', '0015_b.sql'])).toEqual([
      'duplicate number 0015: 0015_a.sql, 0015_b.sql',
    ]);
  });

  it('rejects malformed names', () => {
    expect(findNumberingProblems(['15_a.sql', '0016-b.sql'])).toHaveLength(2);
  });

  it('has a unique number for every migration in supabase/migrations', () => {
    const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
    expect(findNumberingProblems(files)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import config, { isDatabaseTestFile, listTestFiles } from '../../vitest.config';

// BUG-06 (Phase 7): remote-DB suites are serialized in their own project, everything else stays parallel.
type Project = { extends?: boolean; test: { name: string; include: string[]; fileParallelism?: boolean } };
const resolved = (typeof config === 'function' ? (config as (env: { mode: string; command: string }) => unknown)({ mode: 'test', command: 'serve' }) : config) as {
  test: { projects: Project[]; testTimeout: number; hookTimeout: number };
  resolve: { alias: Record<string, string> };
};
const projects = resolved.test.projects;
const byName = (name: string) => projects.find((p) => p.test.name === name)!;

describe('vitest projects', () => {
  const files = listTestFiles();

  it('assigns every test file to exactly one project', () => {
    const db = new Set(byName('db').test.include);
    const unit = new Set(byName('unit').test.include);
    for (const file of files) expect([db.has(file), unit.has(file)].filter(Boolean)).toHaveLength(1);
    expect(db.size + unit.size).toBe(files.length);
  });

  it('serializes only the database project', () => {
    expect(byName('db').test.fileParallelism).toBe(false);
    expect(byName('unit').test.fileParallelism).toBeUndefined();
  });

  it('puts the known remote-DB suites in the database project', () => {
    const db = new Set(byName('db').test.include);
    for (const file of [
      'tests/admin/concurrency.database.test.ts',
      'tests/commerce/settlement.test.ts',
      'tests/reader/likes.test.ts',
      'tests/reader/toggle-concurrency-db.test.ts',
      'tests/ai/chat.test.ts',
    ]) expect(db.has(file), file).toBe(true);
  });

  it('keeps pure unit suites parallel', () => {
    const unit = new Set(byName('unit').test.include);
    for (const file of ['tests/ai/cost-estimate.test.ts', 'tests/migrations/numbering.test.ts', 'tests/uat/cleanup-uat-accounts.test.ts']) {
      expect(unit.has(file), file).toBe(true);
    }
  });

  it('classifies by content', () => {
    expect(isDatabaseTestFile('tests/ai/cost-estimate.test.ts')).toBe(false);
    expect(isDatabaseTestFile('tests/reader/likes.test.ts')).toBe(true);
  });

  it('keeps the shared timeouts and aliases (inherited by both projects)', () => {
    expect(resolved.test.testTimeout).toBe(30000);
    expect(resolved.test.hookTimeout).toBe(30000);
    expect(resolved.resolve.alias['@']).toBeTruthy();
    for (const project of projects) expect(project.extends).toBe(true);
  });
});

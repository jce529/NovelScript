import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Phase 15 BUG-01 regression: a `'use client'` module that value-imports a
// plain server module (e.g. `lib/kb/actions.ts` → `lib/kb/templates.ts` →
// `node:fs/promises`) drags Node built-ins into the browser chunk and makes
// Turbopack panic ("chunking context ... does not support external modules").
// Walk every client entry's runtime import graph — type-only imports are
// erased, `'use server'` files are reference stubs — and assert no Node
// built-in or `server-only` module is reachable.

const ROOT = path.resolve(__dirname, '../..');
const FORBIDDEN_EXTERNALS = /^(node:)?(fs|fs\/promises|path|child_process|os|crypto)$|^server-only$/;
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];

function listSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function directive(sf: ts.SourceFile): string | null {
  const first = sf.statements[0];
  if (first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression)) {
    return first.expression.text;
  }
  return null;
}

function runtimeSpecifiers(sf: ts.SourceFile): string[] {
  const specs: string[] = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      const clause = stmt.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      if (
        clause &&
        !clause.name &&
        bindings &&
        ts.isNamedImports(bindings) &&
        bindings.elements.length > 0 &&
        bindings.elements.every((el) => el.isTypeOnly)
      ) {
        continue;
      }
      specs.push((stmt.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && !stmt.isTypeOnly) {
      const clause = stmt.exportClause;
      if (clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((el) => el.isTypeOnly)) {
        continue;
      }
      specs.push((stmt.moduleSpecifier as ts.StringLiteral).text);
    }
  }
  return specs;
}

function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  return null;
}

const parsed = new Map<string, ts.SourceFile>();
function parse(file: string): ts.SourceFile {
  let sf = parsed.get(file);
  if (!sf) {
    sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
    parsed.set(file, sf);
  }
  return sf;
}

function findForbiddenChains(entry: string): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

  const walk = (file: string, chain: string[]) => {
    if (seen.has(file)) return;
    seen.add(file);
    const sf = parse(file);
    if (chain.length > 1 && directive(sf) === 'use server') return;
    for (const spec of runtimeSpecifiers(sf)) {
      if (FORBIDDEN_EXTERNALS.test(spec)) {
        violations.push([...chain, spec].join(' -> '));
        continue;
      }
      const next = resolveLocal(file, spec);
      if (next) walk(next, [...chain, rel(next)]);
    }
  };

  walk(entry, [rel(entry)]);
  return violations;
}

const clientEntries = [...listSourceFiles(path.join(ROOT, 'app')), ...listSourceFiles(path.join(ROOT, 'components'))].filter(
  (file) => directive(parse(file)) === 'use client',
);

describe('client bundles stay free of Node built-ins (Phase 15 BUG-01)', () => {
  it('finds the chapter editor page as a client entry', () => {
    const chapterPage = path.join(ROOT, 'app/studio/[workId]/chapters/[chapterId]/page.tsx');
    expect(clientEntries).toContain(chapterPage);
  });

  it('no use-client module reaches fs/path/server-only through runtime imports', () => {
    const violations = clientEntries.flatMap(findForbiddenChains);
    expect([...new Set(violations)]).toEqual([]);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * D-17 static guard (13-05): MCP route and modules run only with the caller's bearer and the
 * anon key. They must never import the admin client or read the service role key, which
 * would bypass RLS and the live-grant policies. Scans every source file under lib/mcp/** and
 * app/mcp/**. The forbidden names are assembled at runtime so this file itself does not
 * contain them (and is not classified as a DB suite by vitest.config.ts).
 */
const ROOT = path.resolve(__dirname, '../..');
const SCANNED_DIRS = ['lib/mcp', 'app/mcp'];
const FORBIDDEN = [
  ['create', 'AdminClient'].join(''),
  ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'),
  ['service', 'role'].join('_'),
  ['@/lib/supabase', 'admin'].join('/'),
  ['supabase', 'admin'].join('/'),
  // Cookie-based session clients: MCP tools must use only the bearer-scoped client in db-client.
  ['next', 'headers'].join('/'),
  ['@/lib/supabase', 'server'].join('/'),
  ['@/lib/supabase', 'client'].join('/'),
];
// Relative or aliased imports (static, dynamic, require) of the in-app Supabase client modules.
const FORBIDDEN_IMPORT = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"][^'"]*\/supabase\/(?:admin|server|client)['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) ? [relative] : [];
  });
}

describe('MCP modules never use the admin client or service role key', () => {
  const files = SCANNED_DIRS.flatMap((dir) => sourceFiles(dir));

  it('scans the route and every MCP module', () => {
    expect(files).toContain('app/mcp/route.ts');
    for (const file of [
      'lib/mcp/auth.ts', 'lib/mcp/db-client.ts', 'lib/mcp/tool-runtime.ts', 'lib/mcp/owned-work.ts',
      'lib/mcp/tools/works.ts', 'lib/mcp/tools/kb.ts', 'lib/mcp/tools/writing-context.ts',
    ]) expect(files).toContain(file);
  });

  it.each(SCANNED_DIRS.flatMap((dir) => sourceFiles(dir)))('%s has no admin client or service role reference', (file) => {
    const source = readFileSync(path.join(ROOT, file), 'utf8');
    for (const name of FORBIDDEN) expect(source.includes(name), `${file} references ${name}`).toBe(false);
    expect(FORBIDDEN_IMPORT.test(source), `${file} imports an in-app Supabase client module`).toBe(false);
  });

  it('flags relative, dynamic and require imports of the in-app client modules', () => {
    for (const snippet of [
      `import { x } from '../../lib/supabase/server';`,
      `const m = await import('@/lib/supabase/admin');`,
      `const m = require("../supabase/client");`,
    ]) expect(FORBIDDEN_IMPORT.test(snippet), snippet).toBe(true);
    expect(FORBIDDEN_IMPORT.test(`import { createClient } from '@supabase/supabase-js';`)).toBe(false);
  });
});

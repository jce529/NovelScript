import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { loadEnv } from 'vite';

/**
 * Test files that talk to the shared remote Supabase project (Auth admin API, PostgREST or a
 * direct Postgres connection). They create users and rows, so running many files at once
 * overloads the project and causes timeouts / "Database error creating new user" (BUG-06).
 * Detected by content so a new DB-backed file is serialized without editing this config.
 */
const DB_MARKER = /helpers\/db['"]|SUPABASE_DB_URL|SUPABASE_SERVICE_ROLE_KEY|postgres\(/;

export function listTestFiles(dir = 'tests'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return listTestFiles(full);
    return entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

export function isDatabaseTestFile(file: string): boolean {
  return DB_MARKER.test(readFileSync(file, 'utf8'));
}

export default defineConfig(({ mode }) => {
  const files = listTestFiles();
  const dbFiles = files.filter(isDatabaseTestFile);
  const unitFiles = files.filter((file) => !dbFiles.includes(file));
  return {
    test: {
      environment: 'node',
      testTimeout: 30000,
      hookTimeout: 30000,
      passWithNoTests: true,
      env: loadEnv(mode, process.cwd(), ''),
      projects: [
        // Pure/unit suites keep file-level parallelism.
        { extends: true, test: { name: 'unit', include: unitFiles } },
        // Remote-DB suites run one file at a time.
        { extends: true, test: { name: 'db', include: dbFiles, fileParallelism: false } },
      ],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // `server-only` throws unconditionally outside the `react-server` export
        // condition (Next.js sets it; plain Node/Vitest doesn't). Alias it to a
        // no-op stub so files using the repo-wide `import 'server-only'` marker
        // convention (lib/supabase/admin.ts, lib/ai/providers/gemini.ts) can be unit-tested
        // directly without every test file crashing at import time.
        'server-only': path.resolve(__dirname, 'tests/helpers/server-only-stub.ts'),
      },
    },
  };
});

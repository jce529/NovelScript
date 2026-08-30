import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  return {
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      testTimeout: 30000,
      hookTimeout: 30000,
      passWithNoTests: true,
      env: loadEnv(mode, process.cwd(), ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // `server-only` throws unconditionally outside the `react-server` export
        // condition (Next.js sets it; plain Node/Vitest doesn't). Alias it to a
        // no-op stub so files using the repo-wide `import 'server-only'` marker
        // convention (lib/supabase/admin.ts, lib/ai/gemini.ts) can be unit-tested
        // directly without every test file crashing at import time.
        'server-only': path.resolve(__dirname, 'tests/helpers/server-only-stub.ts'),
      },
    },
  };
});

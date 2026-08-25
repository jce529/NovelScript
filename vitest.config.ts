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
      },
    },
  };
});

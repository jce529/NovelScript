// Test-only stub for the `server-only` marker package.
//
// `server-only`'s real implementation throws unconditionally unless imported
// under the `react-server` export condition (see node_modules/server-only/index.js).
// Vitest runs in plain Node, so any lib/ file that does `import 'server-only'`
// (a repo-wide convention — see lib/supabase/admin.ts, lib/ai/gemini.ts) would
// throw at import time in every test, even ones that only exercise pure
// functions and never touch the network. Vitest aliases the real package to
// this no-op module (see vitest.config.ts) so the marker still works correctly
// in the actual Next.js build/runtime, but is inert for unit tests.
export {};

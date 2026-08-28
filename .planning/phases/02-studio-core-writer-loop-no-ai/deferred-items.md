# Deferred Items — Phase 02

Items discovered during execution that are out of scope for the current plan/task
(pre-existing, unrelated to the files being modified) and therefore not auto-fixed.

## From Plans 02-02, 02-03

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'.`**
  Pre-existing since the initial `create-next-app` scaffold commit (`191bd39`), unrelated
  to any file touched by Plan 02-02 or 02-03. Likely caused by a missing/stale `next-env.d.ts` or
  Next.js 16 typed-routes codegen not having run in this worktree. Out of scope for these
  plans' task boundaries (root layout, not touched by works/studio or KB work). Revisit if a future
  plan needs `npx tsc --noEmit` to be fully clean repo-wide.

# Deferred Items — Phase 02

Out-of-scope issues discovered during plan execution but not fixed (per executor scope boundary rule).

## From Plan 02-03

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** (found while running `npx tsc --noEmit` after Task 2). Pre-existing from the `create-next-app` scaffold (commit `191bd39`), unrelated to `lib/kb/tree.ts` / `lib/kb/actions.ts` or any file this plan touches. Not fixed — out of scope for KB-01/KB-02.

# Deferred Items — Phase 03

Out-of-scope discoveries logged during plan execution (not fixed, per scope boundary rules).

## 03-03

- **`npx tsc --noEmit` fails on `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`.**
  Pre-existing since the initial `create-next-app` scaffold commit (`191bd39`) — unrelated to this
  plan's files (`lib/reader/views.ts`, `lib/reader/progress.ts`). `LayoutProps<"/">` is a Next.js 16
  generated route-type (from `.next/types/`) that only appears after running `next dev` or
  `next build` at least once in this worktree. `lib/reader/*` themselves type-check clean in
  isolation. Not fixed here — out of this task's scope (app/layout.tsx was never touched).

## From 03-04 (reader likes/subscriptions/bookmarks/reports)

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** — pre-existing
  `npx tsc --noEmit` failure, confirmed present at the pre-03-04 commit (`fd2872a`) before
  any 03-04 changes. Unrelated to `lib/reader/*`. Not fixed here per scope boundary rule.

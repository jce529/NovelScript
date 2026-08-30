# Deferred Items — Phase 03

Out-of-scope discoveries logged during plan execution (not fixed, per scope boundary rules).

All three of 03-02, 03-03, and 03-04 independently hit the same pre-existing issue:

- **`npx tsc --noEmit` fails on `app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`.**
  Pre-existing since the initial `create-next-app` scaffold commit (`191bd39`) — unrelated to any
  `lib/*` change in these plans (`lib/discovery/actions.ts`, `lib/chapters/actions.ts`,
  `lib/works/actions.ts`, `lib/reader/views.ts`, `lib/reader/progress.ts`, `lib/reader/likes.ts`,
  `lib/reader/subscriptions.ts`, `lib/reader/bookmarks.ts`, `lib/reader/reports.ts`).
  `LayoutProps<"/">` is a Next.js 16 auto-generated route-typing global (from `.next/types/`) that
  only materializes after a `next build`/`next dev` typegen pass in a given worktree — not something
  to alter by hand in a lib-only plan. All affected `lib/*` files type-check clean in isolation.
  Not fixed here — should be verified/fixed the next time a plan actually touches `app/layout.tsx`
  or introduces a typegen step in CI.

  Also observed unchanged in 03-05 (`app/page.tsx` + `components/reader/*` — the plan's own files
  type-check clean; only this pre-existing `layout.tsx` error remains in the baseline).

# Deferred Items — Phase 03

Out-of-scope issues discovered during execution but not fixed (pre-existing, unrelated to the task at hand).

## 03-02

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** (`npx tsc --noEmit`)
  Pre-existing since the initial `create-next-app` scaffold commit (191bd39), unrelated to any lib/discovery or lib/chapters/lib/works change in this plan. `LayoutProps<"/">` appears to be a Next.js 16 auto-generated route-typing global that only materializes after a `next build`/`next dev` typegen pass — not something to alter by hand in a lib-only plan. Left as-is; should be verified/fixed the next time a plan touches `app/layout.tsx` or introduces a build step in CI.

# Deferred Items — Phase 04

Out-of-scope issues discovered during plan execution but not fixed (per executor scope boundary rule: only fix issues directly caused by the current task's changes).

## From Plan 04-01

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** — pre-existing, unrelated to this plan's changes (installing `@google/genai`/`textarea-caret` and adding shadcn `popover`/`command`/`input-group` components). `LayoutProps<"/">` is a Next.js 16 generated global type (typically emitted into `.next/types` by `next dev`/`next build`); this repo's `npx tsc --noEmit` run doesn't trigger that generation step first, so the global type is unresolved. Not introduced by Task 1 — confirmed present in `app/layout.tsx` at `HEAD` before any Task 1 changes. Leaving for a future plan/build step to address (e.g. run `next build` once before `tsc --noEmit`, or add a typegen prestep).

# Deferred Items — Phase 04 (ai-gateway-mention-based-generation)

Issues discovered during plan execution that are out of scope for the current
task (pre-existing, unrelated files) and are logged here rather than fixed.

## From Plan 04-01

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** — pre-existing, unrelated to this plan's changes (installing `@google/genai`/`textarea-caret` and adding shadcn `popover`/`command`/`input-group` components). `LayoutProps<"/">` is a Next.js 16 generated global type (typically emitted into `.next/types` by `next dev`/`next build`); this repo's `npx tsc --noEmit` run doesn't trigger that generation step first, so the global type is unresolved. Not introduced by Task 1 — confirmed present in `app/layout.tsx` at `HEAD` before any Task 1 changes. Leaving for a future plan/build step to address (e.g. run `next build` once before `tsc --noEmit`, or add a typegen prestep).

## From Plan 04-02

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** — pre-existing
  `npx tsc --noEmit` error, present since the original `Create Next App` scaffold
  commit (`191bd39`), unrelated to any Phase 2/3/4 code. Not touched by Plan 04-02;
  left as-is per the scope-boundary rule (only fix issues directly caused by the
  current task's changes).

# Deferred Items — Phase 04 (ai-gateway-mention-based-generation)

Issues discovered during plan execution that are out of scope for the current
task (pre-existing, unrelated files) and are logged here rather than fixed.

## From Plan 04-02

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** — pre-existing
  `npx tsc --noEmit` error, present since the original `Create Next App` scaffold
  commit (`191bd39`), unrelated to any Phase 2/3/4 code. Not touched by Plan 04-02;
  left as-is per the scope-boundary rule (only fix issues directly caused by the
  current task's changes).

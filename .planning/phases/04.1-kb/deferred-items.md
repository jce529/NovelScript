# Deferred Items — Phase 04.1-kb

## From Plan 04.1-03

- **`app/layout.tsx(21,50): error TS2304: Cannot find name 'LayoutProps'.`** — Pre-existing `tsc --noEmit` error, unrelated to this plan's scope (`app/layout.tsx` is not in this plan's `files_modified`). Confirmed pre-existing via `git log`/`git diff` — the file has not changed since the `refactor(ai-panel)` commit that predates this plan's work. Out of scope per plan execution rules; not fixed here.

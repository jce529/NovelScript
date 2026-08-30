# Deferred Items

Out-of-scope issues discovered during plan execution that were NOT auto-fixed
(pre-existing, unrelated to the current task's changes).

## From 03-04 (reader likes/subscriptions/bookmarks/reports)

- **`app/layout.tsx(20,50): error TS2304: Cannot find name 'LayoutProps'`** — pre-existing
  `npx tsc --noEmit` failure, confirmed present at the pre-03-04 commit (`fd2872a`) before
  any 03-04 changes. Unrelated to `lib/reader/*`. Not fixed here per scope boundary rule.

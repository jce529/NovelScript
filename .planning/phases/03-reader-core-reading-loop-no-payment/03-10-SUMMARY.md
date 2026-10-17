---
phase: 03-reader-core-reading-loop-no-payment
plan: "10"
subsystem: reader-home
tags: [home, slider, scroll-snap, READ-01, READ-04, READ-09]
requires: ["03-08"]
provides: [HorizontalSlider, blueprint home order]
affects: [app/page.tsx]
tech-stack:
  added: []
  patterns: [native CSS scroll-snap, SSR renderToStaticMarkup test]
key-files:
  created: [components/reader/horizontal-slider.tsx, tests/reader/home-structure.test.ts]
  modified: [components/reader/recently-read-section.tsx, app/page.tsx]
  deleted: [components/reader/promo-banner.tsx]
decisions:
  - "더보기 and ?limit= removed (no list route); home shows first FEED_PAGE_SIZE works."
  - "Blinded resume chapter falls back to /works/{id} with an unavailable label."
metrics:
  completed: 2026-10-17
---

# Phase 3 Plan 10: Home structure and slider Summary

Home now renders 이어 읽기 / 주간 랭킹 (native scroll-snap slider) / 루키 쿼터존 / 명예의 전당 with 준비 중 notices, and the READ-09 PromoBanner and fake 더보기 are gone.

## Commits
- 6c3f61b: HorizontalSlider + RecentlyReadSection (title "이어 읽기", links to `/works/{workId}/chapters/{chapterId}`)
- 3f334d0: app/page.tsx reorder, tests/reader/home-structure.test.ts
- promo-banner.tsx deletion: staged by `git rm` and swept into a concurrent 03-12 commit (50e0417) because of the shared index; the file is gone from HEAD.

## Verification
- `npx vitest run tests/reader/home-structure.test.ts`: 4/4 pass.
- `npx tsc --noEmit`: only pre-existing tests/payments/* errors.

## Deviations
- [Rule 1] Tooltip body does not render in SSR (mounts on hover), so the test asserts the `tooltip-trigger` slot and "인기 N" label instead of the tooltip text. FeedCard unchanged.
- Local Next docs were only skimmed (client component directive); no breaking-change impact found.

## Gaps for 03-19 (no browser/DB here)
- Scroll-snap behavior, arrow button edge states, reduced-motion, and no page-level horizontal overflow are not browser-verified.
- Real listRecentlyRead data against the DB not exercised (mocked).
- graphify update not run, per instructions.

## Known Stubs
- 루키 쿼터존 / 명예의 전당 are intentional 준비 중 notice cards (plan-mandated; real data is a later phase).

## Self-Check: PASSED

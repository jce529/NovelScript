---
phase: 03-reader-core-reading-loop-no-payment
verified: 2026-08-30T09:50:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 3: Reader Core (Reading Loop, No Payment) Verification Report

**Phase Goal:** Readers can discover and read published chapters end-to-end with a Korean-market-standard viewer, and can flag problem content — all chapters free at this stage.
**Verified:** 2026-08-30T09:50:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Discovery feed shows cover/title/synopsis + simplified ranking signal | ✓ VERIFIED | `app/page.tsx` renders `FeedCard` grid sourced from `listFeed` (`lib/discovery/actions.ts`); card shows 3:4 cover, title/synopsis clamp, genre badge, trending-score badge with view/like counts (`components/reader/feed-card.tsx`). `listFeed` excludes works with 0 published chapters, computes 0-100 `trendingScore` from views/likes/ctr — proven by 10 passing integration tests (`tests/discovery/feed.test.ts`) |
| 2 | Viewer with prev/next navigation + TOC | ✓ VERIFIED | `components/reader/viewer-shell.tsx` renders a 56px sticky bottom nav (이전화/다음화, disabled at bounds) and a toolbar 목차 button opening `TocSheet` (`components/reader/toc-sheet.tsx`), listing all published chapters with lock badges and current-chapter highlight |
| 3 | Font size adjust + dark/alternate theme toggle | ✓ VERIFIED | `ViewerSettingsSheet` exposes a 4-step font stepper (17/19/21/24px, default 19, disabled at bounds) and a 3-way 라이트/세피아/다크 theme switch; `ViewerShell` applies `fontSize` via inline style and `theme` via a CSS class (`THEME_CLASS` mapping to `.dark`/`.reader-theme-sepia`) scoped to the viewer root — both are local `useState`, applied immediately on click, no page reload |
| 4 | Last-read chapter remembered and resumed (이어보기) | ✓ VERIFIED | `reading_progress` table (1 row per user+work, upserted via `onConflict: 'user_id,work_id'`) + `trackChapterOpenAction` fires on every unlocked chapter open (guarded `if (!locked)`); work-detail page's CTA reads `getReadingProgress` and links directly to `progress.chapterId`, branching "읽기 시작" vs "이어보기 · {N}화부터" — proven by 5 passing integration tests (`tests/reader/reading-progress.test.ts`). See Anti-Patterns for a minor display-copy caveat (href is always correct) |
| 5 | Report a novel/chapter from detail page or viewer | ✓ VERIFIED | Shared `ReportDialog` (`components/reader/report-dialog.tsx`) is rendered from both `/works/[workId]` (chapterId: null, work-level) and the viewer's settings sheet (chapterId: chapter.id) — same component, not duplicated. `submitReport` enforces the 4 fixed categories + 기타-requires-detail rule, proven by 6/7 passing integration tests (`tests/reader/reports.test.ts`) |
| 6 | Per-work 알림 subscription toggle, state persists | ✓ VERIFIED | `WorkHeaderActions` renders a Bell icon toggle calling `toggleSubscriptionAction` → `toggleSubscription` (`work_subscriptions` table, owner-scoped RLS); login-gated both client-side (toast) and server-side (`auth.getUser()` check) — proven by passing integration tests (`tests/reader/subscriptions.test.ts`) |
| 7 | 선호작 bookmark toggle, distinct from 좋아요 | ✓ VERIFIED | `WorkHeaderActions` Bookmark icon toggle (`work_bookmarks` table) is a fully separate table/component/Server Action from `LikeButton`'s `work_likes`/`toggleLikeAction` — proven independently by `tests/reader/bookmarks.test.ts` and `tests/reader/likes.test.ts` |
| 8 | Static promo banner above 최근 읽은 작품 | ✓ VERIFIED | `app/page.tsx` renders `<PromoBanner />` then `<RecentlyReadSection />` then `<Separator />` then the titled `#weekly-ranking` section, in that literal order; `RecentlyReadSection` returns `null` entirely when logged out (no guest tracking, matching D-14's scope) |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/0003_reader.sql` | RLS fix, view_count/RPC, 5 reader tables | ✓ VERIFIED | Contains all required literal strings, live on Supabase (proven by passing `anonClient()` tests) |
| `lib/discovery/actions.ts` | `listFeed`, `computeTrendingScores` | ✓ VERIFIED | Exports match; 10/10 tests pass; `ctr` exposed as independent field |
| `lib/chapters/actions.ts` (`getPublicChapter`/`listPublicChapters`) | Content-leak-safe public reads | ✓ VERIFIED | No `select('*')`; explicit content-null-for-locked guard; 6+2 tests pass including the `'content' in row === false` regression assertion |
| `lib/works/actions.ts` (`getPublicWork`) | No-ownership-gate public read | ✓ VERIFIED | Separate from owner-scoped `getWork`; tested |
| `lib/reader/views.ts`, `lib/reader/progress.ts` | View increment + resume-reading | ✓ VERIFIED | 3+5 tests pass; `chapterOrderIndex` exposed for "{N}화" copy |
| `lib/reader/likes.ts`/`subscriptions.ts`/`bookmarks.ts`/`reports.ts` | Toggle + report lib modules | ✓ VERIFIED | 17 tests pass; `REPORT_CATEGORIES` single source of truth |
| `app/page.tsx` | Discovery feed home screen | ✓ VERIFIED | Scaffold fully replaced; renders banner/recently-read/divider/ranking/filters/grid |
| `app/works/[workId]/page.tsx` + `actions.ts` | Work detail: 3 tabs, header icons, CTA, likes/report | ✓ VERIFIED | All wired; Server Actions login-gated at the action layer, not just UI |
| `app/works/[workId]/chapters/[chapterId]/page.tsx` + `viewer-shell.tsx` | Viewer: toolbar, pane, bottom nav, TOC/settings sheets, tracking | ✓ VERIFIED | All wired; `ViewTracker` fires once per mount; `next build` succeeds and generates this route |
| `components/reader/report-dialog.tsx` | Shared report dialog | ✓ VERIFIED | Reused verbatim by both 03-06 (detail) and 03-07 (viewer), not duplicated |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `tests/discovery/public-read-rls.test.ts` | `supabase/migrations/0003_reader.sql` | `anonClient()` reads | ✓ WIRED | Passing against live Supabase project (non-admin client) |
| `lib/chapters/actions.ts getPublicChapter` | `chapters.price_tier` | content nulled server-side | ✓ WIRED | `locked ? null : data.content`; regression-tested |
| `lib/discovery/actions.ts listFeed` | RLS public-read policies | SSR-cookie client query | ✓ WIRED | `app/page.tsx` calls `listFeed(supabase, ...)` with the SSR client |
| `lib/reader/views.ts incrementChapterView` | `increment_chapter_view` RPC | `supabase.rpc(...)` | ✓ WIRED | Called unconditionally from `trackChapterOpenAction` on every chapter open |
| `lib/reader/progress.ts upsertReadingProgress` | `reading_progress` PK | `onConflict: 'user_id,work_id'` | ✓ WIRED | Called only when `!locked`, from `trackChapterOpenAction` |
| `app/works/[workId]/actions.ts` | `lib/reader/likes.ts` etc. | `auth.getUser()` gate → lib delegation | ✓ WIRED | All 4 actions check user first, return `로그인이 필요해요.` if absent |
| `components/reader/report-dialog.tsx` | `lib/reader/reports.ts REPORT_CATEGORIES` | imported, not retyped | ✓ WIRED | Confirmed via import |
| `components/reader/viewer-settings-sheet.tsx` | `components/reader/report-dialog.tsx` | `<ReportDialog ... />` reused | ✓ WIRED | Same component imported directly, no duplicate implementation |
| `components/reader/view-tracker.tsx` | `trackChapterOpenAction` | `useEffect` empty-deps, fires once | ✓ WIRED | Confirmed in `viewer-shell.tsx` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `FeedCard` grid (`app/page.tsx`) | `works` | `listFeed(supabase, {...})` — real query over `works`/`chapters`/`work_likes` | Yes — live query, batched `.in()` for likes, verified with 460+ real rows in dev DB | ✓ FLOWING |
| `RecentlyReadSection` | `recentlyRead` | `listRecentlyRead(supabase, { userId })` when `user` present, else `[]` | Yes — real `reading_progress` join | ✓ FLOWING |
| Work detail chapter list/CTA | `chapters`, `progress`, `liked`, `subscribed`, `bookmarked` | `listPublicChapters`/`getReadingProgress`/`getLikeState`/`getSubscriptionState`/`getBookmarkState`, all real Supabase queries in one `Promise.all` | Yes | ✓ FLOWING |
| Viewer reading pane | `chapter.content` | `getPublicChapter` (real query, content nulled server-side for locked rows) | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 3 test suite (48 tests across discovery/viewer/reader) | `npx vitest run tests/discovery tests/viewer tests/reader` | 10 files, 48/48 passed | ✓ PASS |
| Full regression suite (all phases) | `npm test` | 29 files, 121/121 passed | ✓ PASS |
| TypeScript compiles clean | `npx tsc --noEmit` | No output (0 errors) — resolves the `app/layout.tsx LayoutProps` error noted as pre-existing/deferred in every 03-0N-SUMMARY.md | ✓ PASS |
| Production build succeeds, including new reader routes | `npx next build` | Compiled successfully; route list includes `ƒ /works/[workId]` and `ƒ /works/[workId]/chapters/[chapterId]` | ✓ PASS |
| Anon-key (non-admin) client can read published works/chapters + call view-increment RPC | `npx vitest run tests/discovery/public-read-rls.test.ts` | 4/4 passed against live Supabase project | ✓ PASS |
| Paid chapter content never leaks to a public read | `npx vitest run tests/viewer/paid-lock.test.ts` | 2/2 passed, including explicit `'content' in row === false` assertion | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| READ-01 | 03-01, 03-02, 03-05 | Discovery feed with ranking signal | ✓ SATISFIED | `listFeed` + `app/page.tsx` + `FeedCard`/`FeedFilters` |
| READ-02 | 03-01, 03-02, 03-03, 03-07 | Viewer with prev/next + TOC | ✓ SATISFIED | `getPublicChapter`/`listPublicChapters` + `ViewerShell`/`TocSheet` |
| READ-03 | 03-01, 03-07 | Font size + theme toggle | ✓ SATISFIED | `ViewerSettingsSheet` font stepper + theme switch |
| READ-04 | 03-01, 03-03, 03-05, 03-06, 03-07 | 이어보기 resume | ✓ SATISFIED | `reading_progress` + `getReadingProgress`/`upsertReadingProgress` + CTA |
| READ-05 | 03-01, 03-04, 03-06, 03-07 | Report from detail/viewer | ✓ SATISFIED | `submitReport` + shared `ReportDialog` on both surfaces |
| READ-07 | 03-01, 03-04, 03-06 | 알림 subscription toggle | ✓ SATISFIED | `toggleSubscription` + `WorkHeaderActions` |
| READ-08 | 03-01, 03-04, 03-06 | 선호작 bookmark toggle | ✓ SATISFIED | `toggleBookmark` + `WorkHeaderActions` |
| READ-09 | 03-01, 03-05 | Static promo banner | ✓ SATISFIED | `PromoBanner` above `RecentlyReadSection` |
| READ-06 | (none — explicitly deferred to v2 per REQUIREMENTS.md) | AI-written opt-in showcase | N/A — out of Phase 3 scope | Not required for this phase; not orphaned (REQUIREMENTS.md explicitly excludes it from Phase 3's mapped set) |

No orphaned requirements: every ID REQUIREMENTS.md maps to "Phase 3" (READ-01 through READ-09 except READ-06) appears in at least one plan's `requirements` frontmatter, and REQUIREMENTS.md itself already shows all 8 checked `[x]`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/works/[workId]/page.tsx` | 75 | 이어보기 CTA displays `chapters.findIndex(...) + 1` (position among *published* chapters) instead of the chapter's true `orderIndex + 1` | ⚠️ Warning | The CTA's **link target is always correct** (`progress.chapterId`), so resume-reading functionally works. Only the displayed chapter number ("{N}화부터") can be wrong in the edge case where a chapter between the work's start and the reader's last-read chapter is unpublished/deleted after being read (array position ≠ true order_index). `viewer-shell.tsx` and `recently-read-section.tsx` both correctly use `orderIndex`/`chapterOrderIndex` for the same "{N}화" copy contract — this file is the one inconsistent spot. Notably, `.planning/phases/03-reader-core-reading-loop-no-payment/03-06-PLAN.md` has an **uncommitted local edit** (`git diff`) that already documents the correct fix (`chapters.find(...)?.orderIndex ?? 0) + 1`) but this fix was never applied to the actual `page.tsx` file — the doc and the code have drifted. Recommend applying the one-line fix in a follow-up. |

No blocker-severity anti-patterns found. No TODO/FIXME/placeholder/"준비중" strings outside of the intentional, spec'd D-22 작품설정 placeholder and D-06 결제 기능 준비중 message (both are documented, deliberate v1-scope placeholders per UI-SPEC, not incomplete work).

### Human Verification Required

### 1. Visual theme/font application in a real browser

**Test:** Open a chapter in the viewer, open 보기 설정 (settings), step font size 17→19→21→24 and back, switch 라이트/세피아/다크.
**Expected:** Text visibly resizes and the reading pane's background/foreground colors change immediately, matching UI-SPEC's declared oklch values, with no flash/reload.
**Why human:** Visual rendering and immediate-feedback feel cannot be verified by static code inspection alone (code-level wiring was confirmed: `useState` + inline style + CSS class, applied on click).

### 2. End-to-end reading flow across multiple chapters

**Test:** As a logged-in reader, open a work, tap 읽기 시작, read a chapter, use 다음화 to advance, then navigate back to the work detail page.
**Expected:** CTA now reads "이어보기 · N화부터" pointing at the last chapter opened; 최근 읽은 작품 on the homepage shows this work.
**Why human:** Full click-through UX and cross-page state consistency benefit from live browser confirmation beyond the automated href/lib assertions already verified.

### 3. Logged-out write-action toasts

**Test:** While logged out, attempt to like, subscribe (알림), bookmark (선호작), and report a work/chapter.
**Expected:** Each shows a "로그인이 필요해요." toast with a "로그인하기" action, no crash, no silent no-op.
**Why human:** Toast timing/visibility and click-through to `/login` are best confirmed visually; server-side login gate is already automated-verified (`{ ok: false, error: '로그인이 필요해요.' }` in every Server Action).

### Gaps Summary

No blocking gaps. All 8 ROADMAP success criteria are verified against real, tested, wired code — not placeholders. 48 phase-specific integration tests and the full 121-test regression suite pass against the live Supabase project; `npx tsc --noEmit` is clean; `npx next build` succeeds and generates both new reader routes. ROADMAP.md and REQUIREMENTS.md are already correctly synced to reflect Phase 3's completion.

One non-blocking, warning-level bug was found: the work-detail page's 이어보기 CTA computes its displayed chapter number from array position among published chapters rather than the chapter's true `order_index`, which can display an incorrect (but still correctly-linked) chapter number in the edge case of an unpublished chapter interrupting the sequence. A matching fix is already drafted (uncommitted) in `03-06-PLAN.md`'s local diff but was never applied to `app/works/[workId]/page.tsx`. Recommend a small follow-up fix; does not block phase sign-off since the CTA's link target and core resume behavior are correct.

---

*Verified: 2026-08-30T09:50:00Z*
*Verifier: Claude (gsd-verifier)*

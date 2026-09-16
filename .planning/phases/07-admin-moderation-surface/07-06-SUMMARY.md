---
phase: 07-admin-moderation-surface
plan: "06"
subsystem: admin-moderation
tags: [nextjs, server-actions, moderation, warnings, re-review, reader, blinding]
requires:
  - 0006_admin_foundation.sql (user_sanctions/warning_acknowledgements own-row RLS, acknowledge_warning, moderation_review_requests insert policy + partial unique indexes)
  - 0008_sanction_enforcement.sql / lib/auth/write-access.ts (checkWriteAccess)
  - 0009_blind_access.sql / reader DAL accessState (07-04)
  - admin re-review tab (07-05)
provides:
  - lib/moderation/user-actions.ts (getAccountNotices, acknowledgeWarning, getReviewTargetState, requestReview, viewerLockModel, tocRowBadge, contract copy)
  - lib/moderation/actions.ts (session-only Server Action wrappers)
  - components/moderation/account-notices.tsx (root layout 운영 알림)
  - components/moderation/review-request.tsx (studio 검토 중 / 재검토 요청 / 검토 요청됨)
  - blinded viewer/TOC/work-entry rendering; purchase action access-state recheck
affects:
  - 07-07 (browser acceptance of notices, studio panel, viewer/TOC states; live DB for RLS paths)
tech-stack:
  added: []
  patterns:
    - pure lock-state model shared by viewer, TOC and tests
    - notices load after hydration via Server Action so failures never block render/login/logout
    - review requests rely on DB RLS + partial unique index; app pre-checks only for friendly copy
key-files:
  created:
    - lib/moderation/user-actions.ts
    - lib/moderation/actions.ts
    - components/moderation/account-notices.tsx
    - components/moderation/review-request.tsx
    - tests/admin/user-flows.test.ts
  modified:
    - app/layout.tsx
    - app/studio/[workId]/page.tsx
    - app/studio/[workId]/chapters/[chapterId]/page.tsx
    - app/works/[workId]/page.tsx
    - app/works/[workId]/chapters/[chapterId]/actions.ts
    - components/reader/viewer-shell.tsx
    - components/reader/toc-sheet.tsx
decisions:
  - "Warning notices use the session client and own-row RLS only (no service role); acknowledgement goes through acknowledge_warning and is allowed while suspended"
  - "AccountNotices is a client component in the root layout that loads via Server Action after hydration and re-checks on navigation only while anonymous"
  - "Review requests: write guard first, then ownership + blinded pre-check, then insert; 23505 -> duplicate, 42501 -> not_found"
  - "purchaseChapterAction rechecks get_chapter_access_state: blinded -> content_blinded, readable+entitled -> ok (retry after payment, no charge), anything else non-purchasable -> content_unavailable; RPCs still enforce"
  - "A work-wide blind renders a direct-entry notice (title, 검토 중인 콘텐츠입니다, public reason) without synopsis, TOC, like or report controls"
metrics:
  duration: 35min
  completed: 2026-09-16
---

# Phase 7 Plan 06: Writer Re-review, Warning Acknowledgement and Reader Locked States Summary

Warnings now reach users as a shared `운영 알림` notice with per-warning `확인했습니다` persistence. Writers can file one open `재검토 요청` per blinded work or chapter from the studio. Readers see blinded chapters as `검토 중` (numbering kept), never a purchase prompt.

## What was built

**Task 06-01 (commit 7717bfd): warning and writer review workflows**
- `lib/moderation/user-actions.ts`:
  - `getAccountNotices` reads the user's warnings minus acknowledgements (public reason only; internal notes are not selected) plus suspension info from `checkWriteAccess`.
  - `acknowledgeWarning` calls `acknowledge_warning`; `warning_not_found` for another account's warning maps to `not_found`.
  - `getReviewTargetState` / `requestReview`: UUID validation, `checkWriteAccess` before any DB call (suspension returns `계정 정지로 이 작업을 수행할 수 없습니다.`), owned + blinded target check, insert; unique violation maps to the duplicate copy. Nothing here writes `admin_blinded`.
- `lib/moderation/actions.ts` (`'use server'`): identity from `auth.getUser()` only; extra ids in input are ignored. Successful requests revalidate `/studio/[workId]` and `/admin`.
- `AccountNotices` in `app/layout.tsx`: individually acknowledgeable warnings, removal only after server confirmation, retry line on load failure, nothing rendered for anonymous users.
- `ReviewRequestPanel` on the studio work page (server-provided state) and chapter editor (self-loading): `검토 중` badge, public reason, "saving does not unblind" note, optional memo, `재검토 요청` → `검토 요청됨`, maintained-request note, disabled with denial copy while suspended.

**Task 06-02 (commit 5ded0a7): reader lock states**
- `viewerLockModel`: `readable` → body; `blinded` → `검토 중인 콘텐츠입니다` + public reason + entitlement note when owned, `showPurchase: false`; `purchase_required` → purchase only when not entitled; else unavailable.
- `viewer-shell.tsx` uses the model; blinded/unavailable states link back to `회차 목록`. `ViewTracker` passes the model's lock flag.
- `toc-sheet.tsx` exports `TocBadge` (EyeOff `검토 중` vs price Lock), used by the sheet and work page TOC; rows remain in order.
- Work page: a blinded work renders only the direct-entry notice.
- `actions.ts`: purchase rechecks access state before any order; `trackChapterOpenAction` swallows bookkeeping errors and progress still requires server-side `can_view`.

## Verification (actual results)

| Check | Result |
|---|---|
| `npx vitest run tests/admin/user-flows.test.ts --passWithNoTests=false` | 32/32 passed |
| `npx vitest run tests/admin/user-flows.test.ts tests/commerce/actions.test.ts tests/admin/sanctions.test.ts tests/admin/blinding.test.ts` | 126/126 passed |
| `npx vitest run tests/admin` | 223 passed / 44 skipped; the 4 `*.database.test.ts` files fail at connection (live DB unreachable, unchanged from 07-01..05) |
| Mutation: drop write guard in `requestReview` + ignore acknowledgements | 2 failures, restored |
| Mutation: drop blinded/non-purchasable recheck in `purchaseChapterAction` | 2 failures, restored |
| `npx tsc --noEmit` | clean |
| `npx eslint` on touched files | clean (3 pre-existing warnings in untouched reader components) |
| Full `npx vitest run` | 86 failed / 288 passed / 101 skipped (same 86 pre-existing live-DB failures) |
| `graphify update .` | ran; graphify-out left uncommitted |

Tests cover: stranger work/chapter ids, chapter from another work, duplicate work-level requests (chapter-level still separate), request after a maintained decision, suspended requester (only `get_write_access` called), RLS refusal at insert, forged requester id, notice load failure + retry, ack failure keeps warning, persisted ack across "reload", other-account ack refused, D-15 save payload has no `admin_*` columns, owned-but-blind / unpaid-but-blind / restored purchase models, TOC order, purchase RPCs never called for blinds, suspended bookkeeping skip, bookkeeping failures non-fatal.

**Not verified here:** rendered UI (notice, studio panel, viewer/TOC states at mobile/desktop), `next build`, and the real RLS/unique-index behaviour against Supabase (tests use an in-memory fake that mirrors 0006/0008 rules). Owned by 07-07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `lib/moderation/actions.ts` (not in files_modified)**
- Client components (chapter editor, notice) need Server Action endpoints; a `'use server'` module cannot also hold the pure helpers the client imports. Commit 7717bfd.

**2. [Rule 2 - Correctness] Modified `components/reader/toc-sheet.tsx` (not in files_modified)**
- The in-viewer TOC still showed the price lock for blinded rows. Now shares `TocBadge` with the work page. Commit 5ded0a7.

**3. [Rule 1 - Bug] Purchase retry after success**
- With the new pre-check, a retry after a completed payment would have shown "구매할 수 없는 회차". A readable + entitled state now returns `ok: true` without calling the purchase RPCs. Commit 5ded0a7.

**4. Viewer page `app/works/[workId]/chapters/[chapterId]/page.tsx` unchanged**
- The DAL already passes blinded chapters through with `accessState`; the shell change was sufficient.

## Known Stubs

None.

## Deferred / Follow-ups

- 07-07: browser checks for notice, studio panel and blinded viewer/TOC/work entry; live Supabase run for review-request RLS and acknowledgement.
- AccountNotices is loaded once per full page load (and on navigation while anonymous); a warning issued mid-session appears on the next full load, consistent with "next access" (D-09).
- ADMIN-02/ADMIN-03 not marked complete (07-07).

## Self-Check: PASSED

- FOUND: lib/moderation/user-actions.ts, lib/moderation/actions.ts, components/moderation/account-notices.tsx, components/moderation/review-request.tsx, tests/admin/user-flows.test.ts
- FOUND commits: 7717bfd, 5ded0a7

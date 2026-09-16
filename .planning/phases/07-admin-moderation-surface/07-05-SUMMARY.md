---
phase: 07-admin-moderation-surface
plan: "05"
subsystem: admin-moderation
tags: [nextjs, server-actions, admin-ui, moderation, idempotency]
requires:
  - lib/admin/auth.ts requireAdminPage / withAdminAction (07-01)
  - lib/admin/queries.ts and lib/admin/actions.ts (07-02)
provides:
  - /admin grouped report queue and re-review tab
  - /admin/reports/[reportId] and /admin/reviews/[requestId] evidence + action pages
  - app/admin/actions.ts moderateReportGroupAction, unblindTargetAction, resolveReviewRequestAction
affects:
  - 07-07 (rendered UI acceptance at 390x844 / 1440x900, live DB)
tech-stack:
  added: []
  patterns:
    - URL-driven queue state (tab/status/page) parsed by a pure whitelist helper; detail pages rebuild the return link from it
    - per-operation retry UUID held in a ref, replaced on any edit or success
    - forms keyed by targetVersion so a refresh after stale_target remounts with the fresh reviewed set
key-files:
  created:
    - app/admin/layout.tsx
    - app/admin/page.tsx
    - app/admin/actions.ts
    - app/admin/loading.tsx
    - app/admin/error.tsx
    - app/admin/reports/[reportId]/page.tsx
    - app/admin/reviews/[requestId]/page.tsx
    - components/admin/report-queue.tsx
    - components/admin/moderation-form.tsx
    - lib/admin/queue-params.ts
    - tests/admin/action-boundary.test.ts
  modified: []
decisions:
  - "Tabs and status filter are URL state (links + select that navigates), not client-only tabs, so reports/reviews have distinct, shareable selection state and survive detail round trips"
  - "Load failure 'unavailable' throws to app/admin/error.tsx (copy + 다시 시도 via retry); not_found/validation_failed on detail ids render 404"
  - "stale_target and idempotency conflict both show the conflict copy with a 새로고침 button; nothing is auto-resubmitted"
  - "Server actions revalidate /admin (layout), /works/[workId] (layout) and /studio (layout) only after success"
metrics:
  duration: 40min
  completed: 2026-09-16
---

# Phase 7 Plan 05: Admin Queue, Evidence Detail and Action UI Summary

This plan adds the admin moderation pages: a grouped report queue with a separate re-review tab, and evidence detail pages. Their action forms go through Server Actions, and each action re-authorizes and then calls the checked 07-02 commands.

## What was built

**Task 05-01 (commit 00e1f60): guarded queue and evidence pages**
- `app/admin/layout.tsx`: `requireAdminPage()` (404 for non-admins, D-03) plus a shell capped at 1280px. Every page loader also calls `requireAdminPage()`, and the queries re-check membership as well.
- `app/admin/page.tsx`: `신고 관리` with tabs `신고` / `재검토 요청`.
  - The report tab has a status select (`미처리`/`처리 완료`/`기각`) and defaults to open (D-20).
  - Pages hold 25 whole target groups, using the service's `hasNext`, so no group is split across pages.
  - Empty states use the spec copy.
- `components/admin/report-queue.tsx`:
  - On md+ the queue is a semantic table with target/type, count, categories, oldest timestamp, status and reporter summary. Below md it becomes labeled `dl` rows with the title first, so there is no document-wide overflow.
  - Real 32x48 cover or a neutral placeholder; 44px icon pagination buttons with labels.
  - Evidence blocks: report list with reporters and timestamps, author action history, and the target body as plain `whitespace-pre-wrap` text.
  - `LocalTime` shows local time and keeps the ISO value in `dateTime`.
- Report detail: back link keeps tab/status/page. Evidence and actions use the desktop split `minmax(0,2fr) minmax(280px,1fr)` and stack below 1024px. It shows all reports on the target, the target body, and the author's other reports and past actions (history stays scoped to that author).
- Review detail: writer request, target body, previous actions on the target, and the decision form while the request is open.
- `loading.tsx` shows skeleton rows. `error.tsx` shows `목록을 불러오지 못했습니다. 다시 시도해 주세요.` and `다시 시도` (Next 16 `retry` prop), and never shows the error message.

**Task 05-02 (commit d543dd6): action forms wired to authenticated commands**
- `app/admin/actions.ts` (`'use server'`): three actions rebuild the input field by field, which drops any `actorId`, and call the lib commands. Those commands authorize from the session before validating. Paths are revalidated only on success.
- `components/admin/moderation-form.tsx`:
  - `ReportModerationForm`: action select with resolve/dismiss/blind/warn/timed suspension/**separate** permanent suspension.
    - Internal reason and public reason are separate fields, both required for operative actions (D-19); the dismiss/resolve note is optional.
    - Timed suspension uses a `datetime-local` input with the visible browser timezone and is sent as ISO. Permanent suspension sends `null`.
    - Blind and suspension open a confirmation dialog showing target, effect copy and the entered reason.
  - `UnblindForm` (shown when the target is blinded) and `ReviewDecisionForm` (`블라인드 해제` / `유지`).
  - Shared behaviour:
    - Pending disables submit, with the spinner slot reserved.
    - Input is kept on errors, and the first invalid field gets focus.
    - `aria-live` status.
    - On success: toast, then `router.refresh()`.
    - `stale_target`/`conflict` show the conflict copy with a refresh button.
    - The retry UUID stays the same across retries of identical input and is replaced after an edit or a success.

## Verification (actual results)

| Check | Result |
|---|---|
| `npx vitest run tests/admin/action-boundary.test.ts --passWithNoTests=false` | **37/37 passed** |
| Mutation: revalidate regardless of result | caught (17 failures), reverted |
| Mutation: send only the first reviewed report ID | caught (1 failure), reverted |
| `npx vitest run tests/admin/action-boundary.test.ts tests/admin/moderation.test.ts tests/admin/authorization.test.ts` | **108/108 passed** |
| `npx tsc --noEmit` | clean (at time of run, including the parallel 07-03 files present) |
| `npx eslint app/admin components/admin lib/admin tests/admin/action-boundary.test.ts` | clean |
| `graphify update .` | ran |

What the tests cover: direct calls with a non-admin session, no session, or the auth backend down all return nothing and cause no RPC and no revalidation. Forged `actorId`/`p_actor_id` never reach the RPC. They also cover reason/expiry validation, exact argument binding for all three RPCs, and distinct warn/suspend/permanent values. RPC errors map to safe codes with no revalidation. The tests also cover queue URL whitelisting and scan the source for `dangerouslySetInnerHTML`/`innerHTML` and for any actor identity in the form.

**Not verified here:**
- Rendered layout at 390x844 and 1440x900, keyboard-only confirmation, 200% zoom, and light/dark contrast. No browser run was done and no dev server was left running.
- `next build`, which was skipped because the other executor's files are in progress in the same tree.
- Live-DB behaviour, since Supabase is unreachable.

07-07 owns rendered UI acceptance and the live DB.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `lib/admin/queue-params.ts` (not in files_modified)**
- Server Component pages cannot call plain helper functions exported from a `'use client'` module. The queue page and both detail pages need the same whitelist parser and href builder for the return URL, so they live in a pure shared module.
- Commit: 00e1f60

**2. [Rule 1 - Lint/correctness] Focus-first-error uses element IDs instead of refs returned from a hook**
- The React Compiler lint (`react-hooks/refs`) rejected returning refs inside the hook result object.
- Commit: d543dd6

**3. Commit granularity note:** the task 1 detail pages import `components/admin/moderation-form.tsx` (task 2), so commit 00e1f60 on its own does not type-check. The tree type-checks at d543dd6.

## Known Stubs

None. All routes render the DTOs from `lib/admin/queries.ts`.

## Deferred / Follow-ups

- The review tab lists open requests only. No historical status filter was specified for reviews.
- If the `requireAdminPage` authorization backend is unavailable in the layout, the error goes to the root error boundary, because a layout is outside its own segment's `error.tsx`. It still fails closed.
- ADMIN-01 to 04 are not marked complete; that waits on 07-07.

## Self-Check: PASSED

- FOUND: all 11 created files listed above
- FOUND commits: 00e1f60, d543dd6

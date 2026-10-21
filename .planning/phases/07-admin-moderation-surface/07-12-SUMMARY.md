---
phase: 07-admin-moderation-surface
plan: "12"
subsystem: moderation
tags: [publication-notices, account-notices, rls, server-actions]
requires: ["07-08"]
provides: ["publication notice read/ack for bookmarking readers in shared AccountNotices"]
affects: ["root layout AccountNotices (unchanged mount)"]
key-files:
  modified:
    - lib/moderation/user-actions.ts
    - lib/moderation/actions.ts
    - components/moderation/account-notices.tsx
    - tests/admin/user-flows.test.ts
  created:
    - tests/admin/publication-notices.test.ts
decisions:
  - "Publication query failure degrades to an empty publicationNotices list so warnings/suspension still show."
  - "After a server-confirmed acknowledgement the component reloads notices so the next pending one (max 25 per load) appears."
metrics:
  completed: 2026-10-19
requirements: [ADMIN-02]
---

# Phase 7 Plan 12: Publication notices in AccountNotices Summary

Bookmarking readers now see "{title} 공개" / "{title} 회차 공개" notices in the existing root-mounted AccountNotices, read through session-only RLS and acknowledged through the auth.uid()-bound `acknowledge_publication_notification` RPC (migration 0029).

## Commits
- 66a4682: session-only publication notice read and acknowledge (user-actions, actions, tests)
- 8dcf8b7: publication notices UI in AccountNotices plus UI tests

## What changed
- `getAccountNotices` adds `publicationNotices` (explicit columns `id, work_id, chapter_id, title, created_at`, user_id + acknowledged_at null filters, created_at/id ascending, limit 25). DTO has no reason, actor, reporters or admin_action_id.
- `acknowledgePublicationNotification` and `acknowledgePublicationNotificationAction`: UUID validation, session identity only, same safe AcknowledgeResult codes as warnings.
- `AccountNotices`: separate `공개 알림` section (BookOpenCheck icon, role=status, not the warning alert style), links to `/works/{workId}` or `/works/{workId}/chapters/{chapterId}`, text rendered as React text nodes, pending/aria-live error, row stays until server success then reload. Exports `PublicationNoticeItem`, `publicationNoticeText`, `publicationNoticeHref` for tests.

## Verification
- `npx vitest run tests/admin/publication-notices.test.ts tests/admin/user-flows.test.ts`: 42 passed.
- `npx tsc --noEmit`: no errors in touched files; `npx eslint --max-warnings=0` on touched files: clean.

## Deviations from Plan
None. Next.js docs for server/client components and mutating data were consulted; existing `'use server'` async-only exports and client-component patterns were kept.

## Gaps (for 07-15)
- Not run: live-DB suites, real hydration click, acknowledgement persistence after reload in a browser, RLS column grants against the real DB.
- graphify update was intentionally not run (per orchestrator instruction).
- STATE.md/ROADMAP.md intentionally not edited (per orchestrator instruction).

## Known Stubs
None.

## Self-Check: PASSED

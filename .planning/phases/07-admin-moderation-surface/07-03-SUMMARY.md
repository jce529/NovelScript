---
phase: 07-admin-moderation-surface
plan: "03"
subsystem: admin-moderation
tags: [supabase, rls, restrictive-policy, suspension, write-guard, ai-billing]
requires:
  - 0006_admin_foundation.sql (profiles.sanction_kind/sanctioned_until cache, apply_user_sanction, acknowledge_warning)
  - 0005_commerce.sql purchase RPCs
provides:
  - user_can_write / current_user_can_write / get_write_access (0008)
  - restrictive INSERT/UPDATE/DELETE write policies on works, chapters, kb_nodes, profiles, work_likes, work_bookmarks, work_subscriptions, reading_progress, reports, moderation_review_requests
  - lib/auth/write-access.ts checkWriteAccess / assertCanWrite / writeDenial / WriteAccessDenied
  - docs/admin-write-surfaces.md mutation inventory runbook
affects:
  - 07-04 (warning banner / suspension notice can read the WriteDenialCode + sanctionedUntil)
  - 07-06 (re-review request action must call checkWriteAccess; DB already restricts it)
  - 07-07 (apply 0008 to real Supabase and rerun sanctions.database.test.ts)
tech-stack:
  added: []
  patterns:
    - RESTRICTIVE RLS policies AND-ed over existing permissive FOR ALL owner policies
    - DB-time expiry evaluation (sanctioned_until <= now() is expired), no cron
    - fail-closed server permission lookup with safe fixed-message denial
    - check-before-provider plus re-check-before-charge for metered AI work
key-files:
  created:
    - supabase/migrations/0008_sanction_enforcement.sql
    - lib/auth/write-access.ts
    - tests/admin/sanctions.database.test.ts
    - tests/admin/sanctions.test.ts
    - docs/admin-write-surfaces.md
  modified:
    - lib/chapters/actions.ts
    - lib/works/actions.ts
    - lib/kb/actions.ts
    - lib/auth/writer.ts
    - lib/reader/reports.ts
    - lib/reader/likes.ts
    - lib/reader/bookmarks.ts
    - lib/reader/subscriptions.ts
    - lib/reader/progress.ts
    - lib/reader/views.ts
    - lib/ai/chat.ts
    - lib/commerce/actions.ts
    - app/works/[workId]/actions.ts
    - app/works/[workId]/chapters/[chapterId]/actions.ts
    - app/studio/layout.tsx
decisions:
  - "Write permission = non-deleted profile AND (sanction_kind none OR timed suspension with sanctioned_until <= now()); equality counts as expired"
  - "get_write_access(p_user_id): session callers may only ask about auth.uid() (else 'forbidden'); service role asks about the session-derived user; not granted to anon"
  - "Domain functions take the guard (not only wrappers) so every wrapper, including the service-role client paths used by tests, is covered"
  - "Toggles keep their return shape and add optional `denied` plus the unchanged state; wrappers turn that into ok:false"
  - "Progress and view bookkeeping no-op (never throw) for suspended or unverifiable readers; anonymous view counts still increment"
  - "Purchases: authoritative check inside both RPCs under the profile share lock; optional server pre-check via { userId }"
  - "AI chat: session check before wallet/provider; service-role re-check before debit discards in-flight output without charge"
  - "Suspended writers can still open the studio: template seeding is skipped instead of failing the layout"
  - "Re-review request inserts (07-06) are also blocked during suspension; no exception was granted"
metrics:
  duration: 40min
  completed: 2026-09-16
---

# Phase 7 Plan 03: Suspension Enforcement Without Losing Purchased Reading Summary

Suspension is enforced in two layers. In the database, RESTRICTIVE write policies and guarded SECURITY DEFINER RPCs evaluate the sanction cache against DB `now()`. On the server, a fail-closed `checkWriteAccess` guard runs in every mutating domain function. Reads, entitlements, wallet visibility and a suspended author's published works are untouched.

## What was built

**Task 03-01: `0008_sanction_enforcement.sql` + `tests/admin/sanctions.database.test.ts` (commit e41ccdd)**
- New functions:
  - `user_can_write` is internal and not granted to any role.
  - `current_user_can_write` is used by policies and granted to all API roles.
  - `get_write_access` returns jsonb with `can_write`, `reason` (`ok|suspended|permanent_suspension|forbidden|not_found`) and `sanctioned_until`.
- A restrictive INSERT, UPDATE and DELETE policy was added to each of 10 tables. SELECT is unchanged. Because restrictive policies are AND-ed with the permissive ones, the older `*_owner_all` policies cannot OR around them.
- Definer RPCs:
  - `create_purchase_order` and `pay_purchase_order` raise `write_access_denied` right after the profile share lock, before any wallet lock or debit. The rest of each body is copied from 0005 unchanged.
  - `increment_chapter_view` returns silently for a suspended or deleted signed-in session.
  - `soft_delete_kb_node` checks write access and now also rejects callers deleting another owner's node. Anon EXECUTE was revoked.
- Exceptions: `acknowledge_warning`, auth login/logout, and service-role self-deletion. Self-deletion leaves the sanctions, ledger, wallets and entitlements unchanged (checked by hash).

**Task 03-02: server guard, domain wiring, runbook (commit c23ef70)**
- `lib/auth/write-access.ts` fails closed. An RPC error, thrown exception, malformed payload, bad UUID, cross-user request or deleted profile all deny the write. Denials carry fixed Korean messages and a `WriteDenialCode`, never DB text. `isAccountActive` is unchanged.
- The guard runs before the first DB call in:
  - chapters: create, save, publish, unpublish, reorder
  - works: create
  - KB: create file, create folder, rename, delete, save
  - writer upgrade and reports
- Purchases also map the DB-side `write_access_denied` to the same message.
- Like, bookmark and subscription toggles check before both branches, so un-toggling cannot bypass the block. They return `denied` with the unchanged state, and the wrappers in `app/works/[workId]/actions.ts` return `ok: false`.
- Progress and view bookkeeping become no-ops. `trackChapterOpenAction` now resolves the user first and passes `userId`.
- AI `chat` checks write access before the wallet read, `countTokens` and `generateContent`, then checks again with the service role right before `apply_wallet_delta`. The runbook documents how a suspension landing mid-generation is handled.
- `docs/admin-write-surfaces.md` inventories every mutation: wrapper, domain guard, DB enforcement and the negative test. It also covers the reviewed service-role writes and account-control exceptions.

## Verification (actual results)

| Check | Result |
|---|---|
| `npx vitest run tests/admin/sanctions.test.ts tests/commerce/actions.test.ts --passWithNoTests=false` | **71/71 passed** |
| `npx vitest run tests/admin/sanctions.database.test.ts` against `SUPABASE_DB_URL` | **Not run live**: the same environment failure as in 07-01/02 ("tenant/user not found"). The suite skips without a reachable DB, so live status is **unverified** |
| Same DB suite on the scratchpad PGlite (Postgres 17) harness with emulated Supabase roles (outside the repo) | **11/11 passed**. All admin DB suites (0006, 0007, 0008) together: **35/35** |
| DB mutation checks on PGlite | Each change was caught and then restored: `<=` → `<` (equality test failed), removing the purchase guard (2 failures), dropping the `work_likes` restriction (5 failures), dropping the `profiles` restriction (writer upgrade failed), removing the view-skip (1 failure) |
| Server mutation checks | Disabling the pre-debit re-check in chat and the like guard produced 4 failures, which went away after restoring |
| `npx tsc --noEmit` | clean |
| `npx eslint` on all touched files | clean |
| Full `npx vitest run` | 86 failed / 233 passed / 92 skipped. This matches the pre-existing live-Supabase baseline of 86 |
| `graphify update .` | ran; graphify-out left uncommitted |

PGlite has a single connection, so a real two-session race between a sanction and a purchase is **not** verified. Plan 07-07 still owns that, along with applying 0008 to Supabase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DB verification ran on PGlite because the configured DB is unreachable**
- Reused the existing scratchpad harness with only a config include path changed. No repo dependencies were added.

**2. [Rule 2 - Security] `soft_delete_kb_node` accepted any `p_owner_id` from any caller, including anon**
- **Found during:** Task 03-01 definer RPC audit
- **Fix:** Browser callers must be the owner, anon EXECUTE was revoked, and the chapter `folder_id` reset only applies to the caller's own node.
- **Commit:** e41ccdd

**3. [Rule 2 - Correctness] Edited three wrapper files outside `files_modified`**
- `app/works/[workId]/actions.ts`: before this change, toggle wrappers always returned `ok: true` and would have reported a refused toggle as a success.
- `app/works/[workId]/chapters/[chapterId]/actions.ts`: passes `userId` to the view and purchase pre-checks.
- `app/studio/layout.tsx`: render-time template seeding would otherwise throw for a suspended writer with no account template root and break studio reads.
- **Commit:** c23ef70

**4. [Rule 3] Guard placed in domain functions instead of each wrapper**
- Every wrapper already routes through these functions. The service-role clients used in the existing live tests keep working because `get_write_access` answers for the passed user when there is no `auth.uid()`.

**5. Works soft-delete via direct UPDATE is not in the DB test matrix**
- It already fails for unsanctioned owners, because the pre-existing RLS rule makes the new row invisible, and the app never does it. The restrictive UPDATE policy still covers it.

## Known Stubs

None.

## Deferred / Follow-ups

- **Blocking for 07-07:**
  - Apply `0008_sanction_enforcement.sql` to a reachable Supabase target and rerun `tests/admin/sanctions.database.test.ts` without skips.
  - Add a two-session test in which a sanction commits while a purchase holds the profile share lock.
- 07-06 must call `checkWriteAccess` in the re-review request action. The DB already blocks it during suspension.
- 07-04 can use `WriteAccessResult.permanent` / `sanctionedUntil` for the suspension notice copy.
- ADMIN-03 is **not** marked complete. The UI (07-04/05) and live verification (07-07) are still pending.

## Self-Check: PASSED

- FOUND: supabase/migrations/0008_sanction_enforcement.sql, lib/auth/write-access.ts, tests/admin/sanctions.database.test.ts, tests/admin/sanctions.test.ts, docs/admin-write-surfaces.md
- FOUND commits: e41ccdd, c23ef70

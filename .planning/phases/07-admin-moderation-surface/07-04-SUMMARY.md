---
phase: 07-admin-moderation-surface
plan: "04"
subsystem: admin-moderation
tags: [supabase, blinding, access-control, commerce, reader-dal]
requires:
  - 0006_admin_foundation.sql (works/chapters admin_blinded flags, column privileges)
  - 0007_admin_operations.sql (moderation_set_blind single write path)
  - 0008_sanction_enforcement.sql (purchase suspension guards)
provides:
  - 0009_blind_access.sql (blind-aware can_view/read_chapter_content/list_chapter_access, get_chapter_access_state, blind checks in both purchase RPCs)
  - lib/access/actions.ts getChapterAccessState + ReaderAccessState
  - PublicChapter.accessState/entitled/blindScope/blindReason, PublicChapterListItem.state/blinded/entitled/blindReason
  - PublicWork.blinded/blindReason, RecentlyReadItem.chapterBlinded
  - PurchaseErrorCode content_blinded/content_unavailable with safe Korean messages
affects:
  - 07-06 (viewer-shell/work page must render accessState 'blinded' as the review notice, never the purchase CTA)
  - 07-07 (apply 0009 to real Supabase; two-session blind vs pay race)
tech-stack:
  added: []
  patterns:
    - entitlement and readability reported as separate fields
    - viewer calls the body RPC only after an explicit readable state
    - blind check under existing content share locks, before any debit
key-files:
  created:
    - supabase/migrations/0009_blind_access.sql
    - tests/admin/blinding.database.test.ts
    - tests/admin/blinding.test.ts
  modified:
    - lib/access/actions.ts
    - lib/chapters/actions.ts
    - lib/works/actions.ts
    - lib/discovery/actions.ts
    - lib/reader/progress.ts
    - lib/commerce/actions.ts
    - tests/admin/sanctions.test.ts
decisions:
  - "Public precedence: existence/publication -> work or chapter blind -> free/entitled; an entitlement never bypasses a blind"
  - "Owner correction keeps using read_chapter_content (studio); viewer state is still 'blinded' for the owner"
  - "Both purchase RPCs raise content_blinded (orders stay PENDING, no debit); a PAID retry still returns idempotently"
  - "list_chapter_access was dropped and recreated with entitled/blinded/blind_reason columns (return shape change)"
  - "A blinded work's getPublicWork omits synopsis and cover (only title/genre/public reason)"
  - "chapter_entitled helper is not executable by any API role"
metrics:
  duration: 25min
  completed: 2026-09-16
---

# Phase 7 Plan 04: Blinding Throughout Reader Access and Purchases Summary

Administrator blinding now takes precedence over free and entitled access in every reader SQL entry point and in both purchase RPCs. Entitlements, orders and the ledger are never changed by blind/unblind. The reader DAL returns an explicit `readable | purchase_required | blinded | unavailable` state so consumers can tell a blind apart from an unpaid chapter.

## What was built

**Task 04-01: `0009_blind_access.sql` + DB tests (commit a3d6e8d)**
- `chapter_entitled(work, chapter)`: internal, no API-role EXECUTE.
- `can_view`: excludes blinded works and chapters; also checks the chapter belongs to the work on the free branch.
- `read_chapter_content`: public branch uses the blind-aware `can_view`; the authenticated non-deleted owner branch remains for correction (published and draft).
- `list_chapter_access`: recreated returning `allowed, entitled, blinded, blind_reason` (work reason takes precedence).
- `get_chapter_access_state(work, chapter)`: jsonb `{state, blind_scope, blind_reason, entitled}`; a wrong pair, draft or missing chapter is `unavailable`.
- `create_purchase_order` / `pay_purchase_order`: 0008 bodies (suspension guards intact) plus `content_blinded` checks after the content share locks, before any insert/debit. PAID retry short-circuit is still before the check.
- No column grants changed; `chapters.content` stays revoked.

**Task 04-02: reader DAL (commit a469455)**
- `getChapterAccessState` fails closed to `unavailable` on malformed payloads and throws on DB errors.
- `getPublicChapter` reads the body only when state is `readable`; a readable state with a null body downgrades to `unavailable`.
- `listPublicChapters` keeps every published row in order and adds `state/blinded/entitled/blindReason`; a blinded row is locked even if `allowed` were reported.
- `getPublicWork` adds `blinded/blindReason` and nulls synopsis/cover when blinded. Writer `getWork`/`listWorks` untouched.
- `listFeed` filters `admin_blinded = false`; `listRecentlyRead` inner-joins works with `admin_blinded = false` (before the limit) and flags `chapterBlinded`.
- Purchase errors: `content_blinded` -> `PURCHASE_BLINDED_MESSAGE`, `content_unavailable` -> `PURCHASE_UNAVAILABLE_MESSAGE`, both with codes.

## Verification (actual results)

| Check | Result |
|---|---|
| `npx vitest run tests/admin/blinding.test.ts tests/commerce/actions.test.ts --passWithNoTests=false` (+ sanctions.test.ts) | **94/94 passed** |
| `tests/admin/blinding.database.test.ts` against `SUPABASE_DB_URL` | **Not run live** (same "tenant/user not found" environment failure); skipped => unverified |
| Same suite on scratchpad PGlite (Postgres 17, emulated Supabase roles) with 0001-0009 | **9/9 passed** |
| All admin DB suites on PGlite (foundation, operations, sanctions, blinding) | **44/44 passed** |
| DB mutation checks | removing work blind from `can_view` -> 1 failure; removing blind check in `pay_purchase_order` -> 1 failure; restored -> 9/9 |
| DAL mutation check | unconditional body read + ignoring `blinded` -> 3 failures; restored -> 23/23 |
| `npx tsc --noEmit` / eslint on touched files | clean |
| Full `npx vitest run` | 86 failed / 256 passed / 101 skipped: same 86 pre-existing live-DB failures |
| `graphify update .` | ran; graphify-out left uncommitted |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DB verification on PGlite** - configured DB unreachable; reused scratchpad harness (new config file only), no repo dependency.

**2. [Rule 3 - Blocking] Updated `tests/admin/sanctions.test.ts` fixture** - its fake client did not answer the new `get_chapter_access_state` RPC, so the "reads never consult write access" test failed closed. Added a readable state to its rpcData; the assertion is unchanged. Commit a469455.

**3. [Rule 2 - Security] Blinded work hides synopsis and cover in `getPublicWork`** - these may be the reported content; direct entry keeps only title, genre and public reason.

**4. `lib/reader/progress.ts` getReadingProgress unchanged** - the work page resolves the resume chapter against the TOC, which now carries `state`; no extra field was needed.

## Known Stubs

None in the DAL. UI does not yet consume `accessState`/`state`: until 07-06 updates `viewer-shell.tsx` and the work page, a blinded chapter renders the existing locked/purchase UI. Any purchase attempt is refused by the DB with `PURCHASE_BLINDED_MESSAGE` and no charge. Owned by plan 07-06.

## Deferred / Follow-ups

- **Blocking for 07-07:** apply 0009 to a reachable Supabase target and rerun `tests/admin/blinding.database.test.ts` without skips; add a two-session race (blind commits while `pay_purchase_order` holds content share locks).
- ADMIN-02 is **not** marked complete (UI in 07-06, live verification in 07-07).

## Self-Check: PASSED

- FOUND: supabase/migrations/0009_blind_access.sql, tests/admin/blinding.database.test.ts, tests/admin/blinding.test.ts
- FOUND commits: a3d6e8d, a469455

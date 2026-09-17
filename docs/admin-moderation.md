# Admin moderation: deployment and verification record (07-07)

This file records how Phase 7 (ADMIN-01..04) was verified against a real database. It contains no
credentials, connection strings or project refs.

## 1. Target

| Item | Value |
|------|-------|
| Target | The Supabase project behind `SUPABASE_DB_URL` in `.env.local`. It is a test project: session pooler in `ap-northeast-2`, PostgreSQL 17.6. On 2026-09-17, 406 of its 408 `auth.users` rows were test accounts (`test-…@novelscript.test` style) |
| Production | Not touched. No production target exists for this MVP, and none was assumed to be authorized |
| Migration history | There is no `supabase_migrations` schema. Migrations are applied with `node --env-file=.env.local scripts/apply-migration.mjs <file>` |

## 2. Schema state (task 07-01)

`0006_admin_foundation.sql`, `0007_admin_operations.sql`, `0008_sanction_enforcement.sql` and
`0009_blind_access.sql` were **already applied** when 07-07 started. The live objects confirmed this, so
nothing was replayed. Read-only inspection of `public` on 2026-09-17:

- **Tables:** `admin_users`, `admin_actions`, `user_sanctions`, `warning_acknowledgements` and
  `moderation_review_requests` exist.
- **Columns:** `works` and `chapters` have `admin_blinded`, `admin_blind_reason` and `admin_blinded_at`.
  `profiles` has `sanction_kind` and `sanctioned_until`.
- **Function EXECUTE privileges (anon / authenticated / service_role):**
  - `moderate_report_group`, `unblind_moderation_target`, `resolve_review_request`, `list_report_groups` and `apply_user_sanction`: no / no / **yes**
  - `moderation_set_blind`, `chapter_entitled`, `user_can_write` and `grant_admin`: no / no / no. These are internal or privileged SQL only
  - `acknowledge_warning`: no / **yes** / no
  - `get_chapter_access_state`, `read_chapter_content` and `pay_purchase_order`: yes / yes / yes. They check `auth.uid()` internally
- **Table and column privileges:**
  - `authenticated` and `anon` cannot SELECT `admin_users`, `admin_actions`, `user_sanctions` or `moderation_review_requests`. `authenticated` can SELECT only `warning_acknowledgements`, and only its own rows
  - `authenticated` has no SELECT on `chapters.content`, no UPDATE on `chapters.admin_blinded` and no UPDATE on `profiles.sanction_kind`
- **RLS:** there are RESTRICTIVE INSERT, UPDATE and DELETE write-access policies on `chapters`, `kb_nodes`,
  `moderation_review_requests`, `profiles`, `reading_progress`, `reports`, `work_bookmarks`, `work_likes`,
  `work_subscriptions` and `works`. These come from 0008.
- **Admins:** 0 active `admin_users` rows. To bootstrap one, follow `docs/admin-bootstrap.md`.

The real-role behavior tests load 0001–0009 into an isolated schema on this same server and run them
through the `anon`, `authenticated` and `service_role` roles:

```
npx vitest run tests/admin/foundation.database.test.ts tests/admin/operations.database.test.ts \
  tests/admin/sanctions.database.test.ts tests/admin/blinding.database.test.ts --passWithNoTests=false
→ 4 files, 44 passed, 0 skipped (2026-09-17)
```

## 3. Two-session races (task 07-02)

`tests/admin/concurrency.database.test.ts` loads 0001–0009 into a disposable schema and **commits** it.
Each race then uses two separate connections, and a third control connection acts as the barrier:

1. Session A opens a transaction and runs its command, holding the locks.
2. Session B starts the competing command.
3. The control connection polls `pg_stat_activity` until B's `wait_event_type = 'Lock'`.
4. Only then does A commit or roll back.

`afterAll` drops the schema and asserts that it is gone. After three runs, no `admin_race_%` schema
was left on the server.

| Race | Observed result |
|------|-----------------|
| Two admins resolve and dismiss the same report set with the same expected version | B blocks. After A commits, B fails with `stale_target`. Both reports are `resolved` by A, and there is exactly 1 `admin_actions` row |
| A new report arrives while a resolve holds the target | The insert commits. The resolved action's `report_ids` contains only the reviewed report, and the late report stays `open`. With the old version it is rejected (`stale_target`). After a refresh it can be dismissed |
| Duplicate retry with the same idempotency key | B blocks on the advisory lock, then returns A's action id. There is 1 action, the blind is applied once, and the same key with a different action raises `idempotency_conflict` |
| Holder rolls back, retry with the same key | B applies the command exactly once: 1 action, 1 warning, report resolved |
| Warning and 7-day suspension race on one author (both orders) | B blocks on the profile lock. The cache ends as `suspension` with `sanctioned_until` equal to the suspension expiry, and `user_can_write` is false. There are 2 history rows and 2 audit rows, and no double sanction |
| Payment holds the content lock, then a blind arrives | The blind waits. Result: 1 debit (500 → 470), 1 ledger row, order `PAID`, 1 entitlement. The reader's state is `blinded` with `entitled: true`. Retrying the payment does not debit again |
| Blind holds the target lock, then a payment arrives | The payment waits and then fails with `content_blinded`. Balance stays 500, with 0 ledger rows and 0 entitlements. The order stays `PENDING`, and there is 1 `chapter_blind` action |

Test runs:

- **Three consecutive runs:** 8/8 passed every time, about 5 s each, with no flakes.
- **Mutation check:** the `content_blinded` checks in the purchase RPCs were replaced with a no-op in a scratch copy of the test. The "payment waits behind blind" race then failed (`expected [] to include 'content_blinded'`). Weakening only the target `FOR UPDATE` to `FOR SHARE` was not detected by these races, because the report-row `FOR UPDATE` and the profile lock still serialize them.

## 4. Regression results (2026-09-17)

| Command | Result |
|---------|--------|
| `npx vitest run` (default file parallelism) | 12 failed / 438 passed / 33 skipped. Eleven failures were 30 s timeouts or slow calls against the remote Supabase under parallel load. One was a real test defect, described below |
| The same failing files re-run with `--no-file-parallelism` | 20 files, 107/107 passed |
| `npx vitest run --no-file-parallelism` (full suite) | **52 files, 483 passed, 0 skipped** |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | 23 errors and 6 warnings, all in files from before Phase 7: `app/studio/**/ai-panel`, `components/reader/*`, `tests/auth/*`, `tests/works/work-crud.test.ts`, `tests/wallet/ledger.concurrency.test.ts`, `scripts/platty-windows-path-fix.cjs` and a `.platty/worktrees` copy. None are in admin or moderation files |
| `next build` | Not run in 07-07 task 2 |

The real test defect: `tests/admin/blinding.test.ts › listFeed filters out work-wide blinds`. The fake
Supabase client had no `.range()`, which `listFeed` has used since commit 8916975 (paged ranking). The
fake now supports `range`. The production query still applies `.eq('admin_blinded', false)`.

## 5. Browser acceptance (task 07-03)

Recorded in `.planning/phases/07-admin-moderation-surface/07-UAT.md`.

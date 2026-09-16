# Phase 7: Admin Moderation Surface - Research

**Researched:** 2026-09-16
**Requirements:** ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Status:** Research complete; UI contract and seven executable plans created
**Confidence:** High for inspected integration points; proposed schema and runtime behavior require implementation and DB verification.

## Summary

Reuse Supabase JS, SQL migrations/RPC, Zod, existing shadcn components, and Vitest. No new framework is needed. The main work is authorization and consistent state transitions across existing reading, writing, and purchasing paths, not merely a new admin page.

Preserve all D-01 through D-20 decisions in 07-CONTEXT.md. In particular, work-wide blinding (D-12) and writer re-review requests (D-16) are accepted scope. Do not silently drop them to fit a smaller plan. Automatic moderation, refunds, administrator-management UI, external notifications, and advanced queue search remain excluded.

## Existing Implementation Evidence

| Source | Observed behavior | Planning implication |
| --- | --- | --- |
| `lib/supabase/admin.ts` | Server-only service-role client, no persisted session | Reuse for admin data access after session-derived membership checks |
| `lib/auth/account.ts` | `isAccountActive` only checks soft deletion | Keep account activity separate from write permission; suspension must not remove reading access |
| `supabase/migrations/0001_init.sql` | Owner profile UPDATE policy | New sanction-cache columns must not be writable through existing owner privileges |
| `supabase/migrations/0003_reader.sql` | Reports already include status, note, resolver and resolution time | Extend existing report handling; do not replace reports or categories |
| `supabase/migrations/0003_reader.sql` | Some reader policies use FOR ALL alongside public SELECT | Audit permissive-policy combinations when adding write restrictions |
| `supabase/migrations/0005_commerce.sql` | `can_view`, `read_chapter_content`, `list_chapter_access` control reads | Enforce blinding in DB access paths, not just viewer rendering |
| `supabase/migrations/0005_commerce.sql` | Chapter SELECT uses an explicit metadata column grant | Add safe new metadata columns explicitly; never restore public content SELECT |
| `supabase/migrations/0005_commerce.sql` | Purchase creation and settlement both validate and lock content | Both need blindness/sanction checks, including orders created before moderation |
| `lib/chapters/actions.ts` | Distinct writer and public chapter paths | Writer correction access must survive blinding; public body access must not |
| `lib/discovery/actions.ts`, `lib/works/actions.ts` | Feed and public work entry points | Work blinding must propagate beyond chapter viewer |
| `tests/commerce/database.test.ts` | Isolated schema, rollback, DB-env-based skip | Useful integration pattern, but sequential tests do not prove lock concurrency |

Graphify query identified the access, account, reports and service-role relationships; current source and SQL were then inspected because the graph is not authoritative for SQL behavior.

## Recommended Architecture

### Authorization and administrator bootstrap (D-01 to D-05)

Keep `profiles.role` as reader/writer. Add `admin_users` membership with grant/revocation metadata and preserve membership history rather than deleting it. Seed only an explicitly configured existing identity; never select the first registrant or embed a production UUID in a migration. Document manual grant/revoke SQL and audit it transactionally.

Use a server-only guard that validates the authenticated session, active profile, and non-revoked membership. Apply it to every privileged action and data loader, not only `/admin/layout.tsx`. Non-admin page requests return 404. Forged action calls must fail without leaking data or changing state. Derive the actor ID from the verified session, never client input.

Operational reads and writes use `createAdminClient` only after this check. Membership lookup itself is the narrowly scoped privileged lookup necessary to authorize access. Do not add administrator RLS policies to reports. Revoke browser access to new operational tables and RPCs; explicitly grant service_role the privileges it needs.

### Atomic moderation and audit (D-04, D-18, D-19)

Use SQL transactions/RPCs for target mutation, sanction history/cache update, report resolution, and audit insertion. Separate HTTP writes can leave an unaudited blind or resolved report without the action. Define an operation idempotency key so retried submissions do not repeat sanctions or audit entries.

Lock the target and relevant report rows consistently. Pass the exact report IDs/version reviewed by the operator; resolve only that reviewed open set. Reports arriving during review remain open. Reject stale/conflicting resolution attempts or return the recorded idempotent result. Group by `(work_id, chapter_id)` with a distinct null chapter meaning work-level reports. Paginate groups, not raw reports, and order by the oldest open report with a stable target tie-breaker.

Require a trimmed resolution reason for blinding and sanctions. Dismissal can omit the note. Keep private operator notes separate from the safe public blinding reason; do not expose reporter identity or internal history to readers.

### Sanction history and write enforcement (D-06 to D-10)

Add `user_sanctions` as the source of truth and protected profile cache fields for effective suspension type/expiry. Use one DB function or trigger to derive the cache while holding a user lock. Warnings must not overwrite an active suspension. Evaluate expiry using DB time at access, with equality meaning expired; distinguish permanent suspension from no suspension with an explicit kind, not a null timestamp alone. No cron is needed.

Keep login, existing entitled reading, wallet display and already-published works available. A separate write guard must cover chapter/work editing and publication, KB/folder mutations, reports, likes, subscriptions, bookmarks, AI generation/charges, and purchase creation/settlement. Inventory action wrappers and direct database access before implementation. Server checks give useful errors; DB policy/function checks prevent direct API bypass. Preserve existing ownership and soft-deletion restrictions.

Reading progress and view counters are writes: skip their mutation for suspended sessions without failing the page read. Treat warning acknowledgement as a narrowly scoped exception required by D-09: only the current recipient may acknowledge that warning, and this does not clear a suspension. Keep logout available. Explicitly document treatment of account deletion before execution rather than accidentally blocking it via a broad guard.

Protect new profile cache and work/chapter moderation columns with column privileges or narrowly scoped DB mutation paths, including INSERT as well as UPDATE. Owner RLS alone does not prevent an author from changing a moderation flag on an owned row.

### Blinding, purchasing and correction (D-11 to D-16)

Use independent `admin_blinded` flags on works and chapters. Unblinding must not change author publication state. Preserve entitlements and all financial rows unchanged. Public access precedence is existence/deletion/publication, then work/chapter blinding, then free/entitled access. An entitlement must never bypass a blind.

Retain the owner-specific correction path in `read_chapter_content` and studio loaders; otherwise the writer cannot revise content to request review. Keep it ownership-checked. Admin body inspection uses the privileged path. Public pages must not accidentally inherit the writer bypass as general reader permission.

Retain blinded chapter metadata in the table of contents with locked status and a safe reason. Work-wide blinds should hide works from discovery and show an unavailable/review notice on direct reader entry. Check recently-read and next-chapter navigation as well as feed, detail, table of contents, viewer and access RPCs. Denied reads must not be rendered as an invitation to pay.

Recheck blinding inside both purchase RPCs while holding existing content locks. Cover the race where an order exists before the blind, and verify no charge or entitlement mutation occurs on rejected payment. Unblinding restores access through the original entitlement without repurchase.

Add a minimal review-request table with ownership, work/chapter target integrity, open/resolved state, timestamps and resolving administrator. Allow at most one open request per target, including null-chapter work targets. An eligible writer can request review after editing but cannot clear the blind or resolve the request. Admin review requests use a separate tab; reopening/retrying has an explicit idempotent outcome.

### UI contract inputs (D-09, D-14, D-16 to D-20)

The missing `07-UI-SPEC.md` needs to specify: admin open queue with grouped counts and oldest-first order; resolved/dismissed status filter; separate re-review tab; detail with report/body/author history; reason and duration controls; confirmation and pending/error states; warning acknowledgement; writer request status; locked reader chapter state. Reuse existing UI components. This is an operational interface, not a marketing page. Cover keyboard/focus behavior, narrow screens, empty/loading/error states and safe display of user-authored content.

## Threat Model Inputs

| Ref | Threat | Required mitigation and evidence |
| --- | --- | --- |
| T-07-01 | Forged admin action or revoked membership | Per-action session/membership checks; anon/non-admin/revoked tests |
| T-07-02 | Self-clearing blind or sanction cache | Column privileges and direct API role tests, including insert/upsert |
| T-07-03 | Paid/free body leak or charge during blind | DB access and purchase checks; retained entitlement and unchanged ledger tests |
| T-07-04 | Partial action, duplicate sanction, competing operators | Transaction rollback, idempotency, stale-state and two-session concurrency tests |
| T-07-05 | Internal notes/reporters leaked or stored XSS | Minimal DTOs, safe text rendering, no service secret in client modules |
| T-07-06 | Expired suspension stays active or warning clears ban | DB-time boundary tests and history/cache consistency tests |

## Validation Architecture

Existing infrastructure: Vitest 4 (`vitest.config.ts`), `postgres` SQL integration tests, Supabase test helpers and service-only module alias. No test dependency is required for unit/DB tests. Browser tooling must be checked at execution; do not claim browser coverage from Vitest's node environment.

Suggested new tests: `tests/admin/authorization.test.ts`, `tests/admin/moderation.test.ts`, `tests/admin/sanctions.test.ts`, `tests/admin/database.test.ts`. Quick command after these files exist: `npx vitest run tests/admin --passWithNoTests=false`. Full regression: `npm test`, followed by `npx tsc --noEmit` and `npm run lint`. Record DB skips as unverified, never passed. The current global `passWithNoTests: true` makes an empty suite an unsafe completion signal.

Use disposable DB fixtures, anon/authenticated/service roles, writer/reader/admin/revoked-admin identities, free and purchased chapters, work blinds, expired/permanent sanctions, duplicate reports and re-review requests. Exercise direct PostgREST/SQL access as well as application helpers. For concurrency use separate connections and deterministic barriers, not sequential calls on the existing max:1 client. Avoid touching production users.

Mandatory deployment evidence: apply the moderation migration to the intended test/local database after prerequisites, inspect actual functions/grants/columns, then run integration tests. Existing repository runner is `node --env-file=.env.local scripts/apply-migration.mjs <migration-file>`; it executes raw SQL and does not track applied migrations, so verify migration history and target before running. Supabase CLI is an alternative only after checking project linkage/history. No remote migration was applied during research.

## Plan Decomposition Recommendation

1. Schema, admin authorization, protected moderation fields and transactional primitives.
2. Sanction enforcement across server and DB mutations, expiry and acknowledgement.
3. Blinding across reader/discovery/commerce paths with entitlement preservation.
4. Admin grouped queue/detail/actions and writer re-review UI using the UI contract.
5. Database application, direct-role/concurrency integration tests and browser acceptance.

These are proposed work packages, not executable PLAN files or a verified wave graph. The planner must resolve shared migration ownership and dependencies, map every ADMIN requirement and D-01 through D-20, and attach threat tests and blocking DB verification.

## Open Details and Limits

- UI contract was created and reviewed inline after the user instructed continuation.
- Plans require a complete mutation inventory, preserve account-control self-deletion as a narrow exception, and separate public reasons from private notes.
- Phase 6 documentation reports unapplied DB migrations and untested true concurrency; do not assume a live DB matches checked-in SQL.
- No implementation, tests, browser checks or migration execution occurred in this research step.

## Sources

Repository sources are listed above and in `07-CONTEXT.md` canonical references; requirements and prior phase decisions were checked for scope. External references checked 2026-09-16:

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): service-role bypass and policy semantics.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions): privileged function search paths and execution permissions.
- [Next.js mutating data](https://nextjs.org/docs/app/getting-started/mutating-data): authorization within each server function. Installed Next.js documentation must be read before implementation, as required by AGENTS.md.

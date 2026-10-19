---
phase: 07-admin-moderation-surface
plan: "09"
subsystem: admin
tags: [admin, moderation, sanctions, url-state, dto]
requires: ["07-08"]
provides: ["all-filter + sanctions-tab URL contract", "listSanctionUsers/getUserSanctionHistory", "ReportGroupSummary.statuses"]
affects: ["07-10 UI (components/admin/report-queue.tsx)"]
key-files:
  modified: [lib/admin/types.ts, lib/admin/queue-params.ts, lib/admin/queries.ts, tests/admin/moderation.test.ts]
  created: [tests/admin/queue-params.test.ts, tests/admin/sanction-history.test.ts]
requirements-completed: [ADMIN-01, ADMIN-03]
duration: ~15min
completed: 2026-10-19
---

# Phase 7 Plan 09: Admin all-filter and sanction history reads Summary

URL state (all filter, sanctions tab, user UUID, independent page axes) and guarded admin queries for all-status report groups and per-user sanction lists/history with whitelisted DTOs.

## Commits
- 4e5b7ee: types + queue-params + queue-params.test.ts (task 09-01)
- 106e69f: queries.ts + sanction-history.test.ts + moderation.test.ts

## What changed
- `ReportQueueFilter` (open|resolved|dismissed|all) added without touching `REPORT_STATUSES`/`SANCTION_KINDS`. `AdminQueueTab` gains `sanctions`; `AdminQueueState` gains optional `userId`/`historyPage`. Invalid UUID drops the selection; history page only kept with a valid user; tab changes reset other axes.
- `listReportGroups` accepts `all` (-> `list_report_groups_all`), otherwise the old RPC; every group carries `statuses` (open > resolved > dismissed representative `status`).
- New `listSanctionUsers`, `getUserSanctionHistory` (withAdminAction -> Zod -> RPC -> field mapping, 25+1 paging, seq as string, metadata whitelist operation/changeId/previousEndsAt/newEndsAt).

## Verification
- vitest: queue-params, sanction-history, moderation, action-boundary = 114 passed. eslint --max-warnings=0 clean on touched files. tsc clean for lib/admin and tests/admin.
- RED observed for queue-params (4 failures) before implementation.

## Deviations
None to the plan logic. The docs reads (Next server/client components) were skimmed only; no Next APIs were used in these pure/server-query modules.

## Gaps / Known issues
- `components/admin/report-queue.tsx` (lines ~193, 200) now fails tsc (TS7053): `state.status` can be `all` and indexes a `Record<ReportStatus,string>`. Outside this plan's files_modified; the UI plan must handle `all` and render `statuses`.
- Live-DB behaviour of migration 0029 RPCs (column names assumed from the SQL file) not verified; gate 07-15. graphify update not run (per instruction).
- Unknown-kind history rows are dropped after paging (cosmetic hasNext edge case).

## Self-Check: PASSED

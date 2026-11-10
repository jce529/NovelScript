---
phase: 14-mcp-write-review
plan: 07
subsystem: studio-ui
tags: [proposals, badges, review-queue, mcp]
requires: [14-05, 14-06]
provides: [pending-proposal entry points on studio home, work sidebar, chapter and document screens]
affects: [app/studio/page.tsx, app/studio/[workId]/layout.tsx]
key-files:
  created:
    - components/proposals/pending-badges.tsx
    - app/studio/[workId]/review/target-actions.ts
    - tests/proposals/badges.test.ts
  modified:
    - app/studio/page.tsx
    - app/studio/[workId]/layout.tsx
    - app/studio/[workId]/chapters/[chapterId]/page.tsx
    - app/studio/[workId]/kb/[nodeId]/page.tsx
requirements: [MCP-07]
metrics:
  completed: 2026-11-06
---

# Phase 14 Plan 07: Pending badges Summary

Four studio entry points for pending MCP proposals, all owner-scoped via the 14-05 query helpers and silent (nothing rendered) at 0 or on query failure.

## Commits
- d90557d Task 1: home badge, sidebar link, unit tests
- 35e8c90 Task 2: target server action and chapter/document lines

## Where to see each (needs at least one live pending proposal)
| Surface | Route | What shows |
|---|---|---|
| Home card | `/studio` | Separate row under the card: `대기 n건` badge linking to `/studio/{workId}/review`; aria-label `{작품명} 리뷰 큐, 대기 n건`. Counts for all works come from one `countPendingProposalsByWork` call. |
| Sidebar | any `/studio/{workId}/...` | `리뷰 큐` row at the bottom of the 작품 폴더 group (desktop sidebar and mobile tree tab), count badge `n` (`99+` over 99), aria-label `리뷰 큐, 대기 n건`; link always present, badge omitted at 0. |
| Chapter | `/studio/{workId}/chapters/{chapterId}` | Static line above the editor: `이 회차에 대기 제안 n건` + `검토하기` (1 item -> `/studio/{workId}/review/{proposalId}`, 2+ -> `/studio/{workId}/review`). |
| Document | `/studio/{workId}/kb/{nodeId}` (document mode only, not templates) | `이 문서에 대기 제안 n건` + `검토하기`, same link rule. |

The chapter and document lines load after the editor through `getPendingProposalsForTargetAction`, independent of the editor load; a late answer for another resource is ignored by key. The sidebar is rendered in the work layout, which the 14-05 actions already revalidate, so counts refresh after accept/reject.

## Tests
`tests/proposals/badges.test.ts`: 13 passed, 0 failed, 0 skipped. Together with `review-ui.test.ts` and `queries.test.ts`: 72 passed. eslint clean on changed files. `tsc --noEmit`: only the known `LayoutProps` error in `app/layout.tsx`.

## Deviations
- [Rule 3] Test file is `badges.test.ts`, not `.tsx` as the plan lists: `vitest.config.ts` only collects `*.test.ts`, so a `.tsx` file would never run. It uses `React.createElement` + `renderToStaticMarkup`, as `review-ui.test.ts` does.
- Components live in `components/proposals/pending-badges.tsx` (not in the plan's file list) so the home, sidebar and both client pages share the labels and link rule.
- UI-SPEC says multi-proposal document lines filter the queue "to the target"; the queue has no target filter, so 2+ links to the plain pending queue. Chapters have at most one pending draft, so this only affects documents.
- Task 2 target-membership re-check is done by the query itself (filters owner_id, work_id and chapter_id/node_id on the proposal row); no separate chapters/kb_nodes lookup.

## Open issues
- Rendered pages were not viewed in a browser (none available); desktop plus 375px checks (44px link targets, line wrapping) fall under 14-09 manual acceptance.
- Document line is hidden for template modes by design (kb_edit never targets templates).

## Known Stubs
None.

## Self-Check: PASSED
Files and commits d90557d, 35e8c90 verified present.

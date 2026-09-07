---
id: "doc:J1Qi1ySgPSx3a_u6FM0js"
name: "Work Workspace Use Case List"
type: "ucl"
scope: "epic"
scopeId: "_Pnwofz1Iq27Y-rvAkG7q"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-work-workspace-review-work-summary-and-open-chapter-work","title":"Authenticated user reviews a work summary and goes to chapter work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Work Workspace Use Case List

Routing index for the authenticated user goal proven in the Work Workspace source: reviewing a work's core details and moving to chapter-level work.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-work-workspace-review-work-summary-and-open-chapter-work | authenticated user | Review a work's core details and continue to chapter-level work. | 1 doc |

## use-case-work-workspace-review-work-summary-and-open-chapter-work — Authenticated user reviews a work summary and goes to chapter work

Authenticated user lands on a user-scoped work page, reviews core work details, and moves into chapter-level work through the chapter list.

Actor: authenticated user

Goal: Review a work's core details and continue to chapter-level work.

Claim: An authenticated user can open a studio work page to review the work title and synopsis for a user-scoped work record, then continue to the chapter list from the visible navigation on that page.

Cautions:
- This source proves an authenticated user flow, not an explicit privileged role.
- The page may render missing title or synopsis content as empty, so downstream agents should verify whether blank content is acceptable or requires separate handling.
- The only visible navigation confirmed by this source is the chapter-list link.

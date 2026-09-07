---
id: "doc:tLy1py-4JbcoDRsmgK4gs"
name: "Work Detail and Engagement use cases"
type: "ucl"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-view-work-detail","title":"View a work overview, settings, and chapter list","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":[]},{"stableKey":"use-case-engage-with-work","title":"Authenticated reader engages with a work through like, bookmark, subscription, or report","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Work Detail and Engagement use cases

Routing index for viewing a work and performing authenticated engagement actions on the work detail screen.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-view-work-detail | reader | Review a work's overview and available chapters before deciding whether to continue reading or engage. | 1 doc |
| use-case-engage-with-work | authenticated user | Express interest in a work or report a problem while viewing the work detail page. | 1 doc |

## use-case-view-work-detail — View a work overview, settings, and chapter list

A reader opens a work detail page to review the work and its chapters.

Actor: reader

Goal: Review a work's overview and available chapters before deciding whether to continue reading or engage.

Claim: A reader can open a work-specific detail page to review the introduction, placeholder settings information, and chapter list, and the page is not available when the work cannot be found.

Cautions:
- The settings tab is described as a placeholder state only and not as an editable management surface.
- Exact data fields and fetch behavior should be verified in the connected screen spec and source code if answer precision matters.

## use-case-engage-with-work — Authenticated reader engages with a work through like, bookmark, subscription, or report

An authenticated user performs engagement actions from the work detail page.

Actor: authenticated user

Goal: Express interest in a work or report a problem while viewing the work detail page.

Claim: An authenticated user can engage with a work from the detail screen by liking it, bookmarking it, subscribing to it, or opening a report flow, while an unauthenticated user is redirected toward login through a toast action.

Cautions:
- The source proves authentication gating, but it does not prove any stronger owner or admin authority model for these actions.
- The report flow evidence is strongest for opening the dialog and the conditional requirement for additional detail when the selected category is 기타.

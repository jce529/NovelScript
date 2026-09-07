---
id: "doc:Ehg-YMqZlGgNPl4RGRsks"
name: "Work Portfolio Management use case list"
type: "ucl"
scope: "epic"
scopeId: "yzFrm9l4_RMevijWnGVDf"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"view-and-open-your-studio-works","title":"View and open your Studio works","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Work Portfolio Management use case list

Routing index for the Studio work view use case backed by the provided source document.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| view-and-open-your-studio-works | authenticated user | Review your current writing projects in Studio and continue with an existing work or start from the empty-state create prompt. | 1 doc |

## view-and-open-your-studio-works — View and open your Studio works

An authenticated user uses Studio to review their own work list and continue from an existing title or the empty-state create prompt.

Actor: authenticated user

Goal: Review your current writing projects in Studio and continue with an existing work or start from the empty-state create prompt.

Claim: An authenticated user can view their own non-deleted works in Studio, see the newest items first, open an existing work from its card, and see a create-work prompt when no works exist.

Cautions:
- This source proves listing behavior for the current user's works, not broader access rules for the Studio route.
- The create-work action is observed as an empty-state prompt, but the full creation flow is not confirmed here.

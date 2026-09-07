---
id: "doc:KQUppw26hCYJ1abHkM1T2"
name: "Story Knowledge Management Use Case List"
type: "ucl"
scope: "epic"
scopeId: "eJ5obXr2iXGhdipaJzFza"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-story-kb-content-update","title":"Authenticated user updates story knowledge-base content","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Story Knowledge Management Use Case List

Routing index for the confirmed business use case in Story Knowledge Management: editing and saving knowledge-base node content.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-story-kb-content-update | authenticated user | Update reusable story knowledge content so later writing stays consistent. | 1 doc |

## use-case-story-kb-content-update — Authenticated user updates story knowledge-base content

Load a knowledge-base node, edit its text, and save the updated content from the editor screen.

Actor: authenticated user

Goal: Update reusable story knowledge content so later writing stays consistent.

Claim: An authenticated user can load a story knowledge-base node, edit its text content, and save the updated content from the editor screen.

Cautions:
- This source only confirms one editable content field and one save action on the screen.
- The textarea stays disabled until content finishes loading, and saving stays disabled before load completion or while the save transition is pending.
- The source shows an authentication failure message on save, but it does not prove stronger requester roles such as owner or admin.

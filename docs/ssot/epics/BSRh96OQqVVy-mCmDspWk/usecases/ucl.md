---
id: "doc:ovMW68kDpWeNQZPZUJAvD"
name: "Chapter Planning and Structure Use Cases"
type: "ucl"
scope: "epic"
scopeId: "BSRh96OQqVVy-mCmDspWk"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-create-chapter-in-work","title":"Create a new chapter in a work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45"],"modelLinks":[]},{"stableKey":"use-case-view-and-organize-chapters-in-work","title":"View and organize chapters in a work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Planning and Structure Use Cases

Searchable routing use cases for creating chapters and viewing or organizing chapter lists within a work.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-create-chapter-in-work | authenticated user | Create a new chapter in a work they own by submitting a required chapter title. | 1 doc |
| use-case-view-and-organize-chapters-in-work | authenticated user | View and organize the chapters of a work from the chapter list screen. | 1 doc |

## use-case-create-chapter-in-work — Create a new chapter in a work

Route for chapter authoring when a user needs to add a chapter title and create the next chapter in order.

Actor: authenticated user

Goal: Create a new chapter in a work they own by submitting a required chapter title.

Claim: An authenticated user can create a new chapter for a work they own by entering a required title; successful creation routes them to the new chapter, while failures stay inline on the form.

Cautions:
- The source proves a logged-in user and a work owned by that user are required, but exact error wording is not confirmed.
- Optional folder use is constrained to the same work and to a chapter folder node, and downstream code should be checked for exact edge cases.

## use-case-view-and-organize-chapters-in-work — View and organize chapters in a work

Route for chapter list access when a user needs to browse chapters, open one, start creation, or reorder chapters from the list screen.

Actor: authenticated user

Goal: View and organize the chapters of a work from the chapter list screen.

Claim: An authenticated user can view the chapter list for a work, open a chapter, start chapter creation from the list screen, and use drag-and-drop reordering from that screen.

Cautions:
- The source confirms authenticated querying and an empty list for unauthenticated users, but it does not confirm deeper authorization rules beyond that screen behavior.
- Reordering is shown as available on the screen, but the implementation details are not expanded and should not be assumed.

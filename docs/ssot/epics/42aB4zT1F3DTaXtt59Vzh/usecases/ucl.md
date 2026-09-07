---
id: "doc:ZkSOd238mKUDvggt7zKuM"
name: "New Work Creation"
type: "ucl"
scope: "epic"
scopeId: "42aB4zT1F3DTaXtt59Vzh"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-create-new-work-essential-metadata","title":"Create a new work with essential metadata","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# New Work Creation

Routing index for creating a new work with required title and optional synopsis and genre.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-create-new-work-essential-metadata | authenticated user | Create a new work with a required title and optional synopsis and genre. | 1 doc |

## use-case-create-new-work-essential-metadata — Create a new work with essential metadata

An authenticated user creates a new work by providing a required title and optionally adding synopsis and genre.

Actor: authenticated user

Goal: Create a new work with a required title and optional synopsis and genre.

Claim: An authenticated user can submit a new work by entering a required title and optional synopsis and genre; blank or whitespace-only synopsis is sent as null, genre is optional with a default unselected state, and successful submission routes to the new work page.

Cautions:
- Submit is disabled until a title is provided.
- The screen evidence does not confirm any role-specific permission beyond requiring a logged-in user.
- The screen evidence does not confirm the exact backend record creation behavior.

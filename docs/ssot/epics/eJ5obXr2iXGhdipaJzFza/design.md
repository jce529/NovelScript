---
id: "doc:0K_lD5vdH2XYY_KQYm2uU"
name: "Story Knowledge Management System Design"
type: "design"
scope: "epic"
scopeId: "eJ5obXr2iXGhdipaJzFza"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
itemCount: 3
relatedDocs: []
serviceMapNodes: []
---
# Story Knowledge Management System Design

Routing map for the knowledge-base node editor screen that loads and saves node content through Supabase-backed actions and updates the current node route after a successful save.

## Primary Flows

### Knowledge-Base Node Editing Screen

flowKey: story-knowledge-management-kb-node-editor

Screen-level design for loading, editing, and saving a knowledge-base node document.

```mermaid
sequenceDiagram
  participant User
  participant System
  User->>System: Open `/studio/:workId/kb/:nodeId`.
  User->>System: On mount, reset the local loaded flag and request node content with `getNodeContentAction(nodeId)`.
  User->>System: When the load succeeds, copy `result.content` into local state and mark the screen as loaded.
  User->>System: Keep textarea edits in local state as the user types.
  User->>System: Disable the textarea until the initial content request finishes.
  User->>System: Disable the save button until content is loaded, and also while the save transition is pending.
  User->>System: When the user clicks `문서 저장`, call `saveNodeContentAction(workId, nodeId, content)` inside a transition.
  User->>System: On save success, show `저장했어요.` and revalidate the current node route.
  User->>System: On save failure, show `result.error` or the fallback message `저장하지 못했어요. 잠시 후 다시 시도해주세요.`.
```

## Routing Hints

- Knowledge-Base Node Editing Screen: The editor at `/studio/:workId/kb/:nodeId` loads one node document on mount, keeps edited text in local state, and saves the updated content through Supabase-backed actions tied to `nodeId` and `owner_id`. After a successful save, the current node route is revalidated and the user sees a success toast.; next: Inspect the source for `getNodeContentAction(nodeId)` to confirm load-time errors, response shape, and any access checks., Inspect the source for `saveNodeContentAction(workId, nodeId, content)` to confirm persistence rules, failure cases, and the exact save response., Inspect the connected source spec or code for `kb_nodes` to confirm stored fields beyond the editable content body.; flowKey: story-knowledge-management-kb-node-editor; resolve: `sot resolve --item doc:0K_lD5vdH2XYY_KQYm2uU#story-knowledge-management-kb-node-editor`; sourceRefs: source_document_1

## Evidence Gaps

- The provided evidence does not confirm what authentication or requester authorization checks are enforced before a user can open or save this editor screen.
- The provided evidence does not show the exact request and response shapes for the load and save actions beyond the visible fields used by the screen.
- The cross-epic connection mentions external_service:supabase_auth:users, but the screen-level role of that dependency is not directly shown in the provided source card.

## Graph Lookup

- Related APIs, screens, tables, and relation traces are not dumped in this Markdown file.
- Use `sot resolve --document doc:0K_lD5vdH2XYY_KQYm2uU` for linked specs and graph seeds.
- Use `sot resolve --epic eJ5obXr2iXGhdipaJzFza` or catalog `traceId` values with `graph trace` for relation/source paths.

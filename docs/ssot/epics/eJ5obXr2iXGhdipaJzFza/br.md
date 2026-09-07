---
id: "doc:aQW15jsZsYjO0p1WKDGPO"
name: "Story Knowledge Management Business Rules"
type: "br"
scope: "epic"
scopeId: "eJ5obXr2iXGhdipaJzFza"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"story-knowledge-management-node-editor-load-gating","title":"Node content must load before editing is enabled","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d"],"modelLinks":[]},{"stableKey":"story-knowledge-management-node-editor-save-success","title":"Saving node content must use the current route context","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d"],"modelLinks":[]},{"stableKey":"story-knowledge-management-node-editor-save-feedback","title":"Save availability and save-result feedback must be constrained by UI state","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Story Knowledge Management Business Rules

Source-grounded business rules for Story Knowledge Management.

## story-knowledge-management-node-editor-load-gating — Node content must load before editing is enabled

The editor disables the textarea until node content has been loaded into local state.

**Rule:** The editor must keep the textarea disabled until the node content request has finished successfully and `content` has been set from `result.content`.

**When/Then:** WHEN the screen at `/studio/:workId/kb/:nodeId` mounts and begins loading node content. The user cannot edit the document until loading completes successfully.

**Watch:** This shard confirms `loaded` is reset to false on mount and set to true after successful load. The shard does not confirm the user-visible behavior when the initial fetch fails.

**Next:** Go to code for the screen component to confirm the exact disabled conditions and any non-success load branches.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d

## story-knowledge-management-node-editor-save-success — Saving node content must use the current route context

The editor saves the current text through the save action and refreshes the current node route on success.

**Rule:** The editor must submit saves using the current `workId`, `nodeId`, and textarea `content`, and a successful save must trigger revalidation of the current node route.

**When/Then:** WHEN the user clicks `문서 저장` after content has loaded. The current node document is persisted through the action layer and the route `/studio/${workId}/kb/${nodeId}` is revalidated on success.

**Watch:** The shard states that fetching and saving are Supabase-backed and scoped by `nodeId` and `owner_id`, but it does not expose the full persistence schema. The shard does not confirm whether the action returns the saved re…

**Next:** Go to code for `saveNodeContentAction` to verify the exact Supabase update statement and response payload.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d

## story-knowledge-management-node-editor-save-feedback — Save availability and save-result feedback must be constrained by UI state

The save button is unavailable before load completion or during an active save, and save outcomes are reported through toasts.

**Rule:** The editor must prevent save submission before loading completes or while a save is already pending, and it must report save outcomes through toast messages.

**When/Then:** While the editor screen is active. Users can only submit saves from a loaded, non-pending state, and they receive toast feedback for success or failure.

**Watch:** This shard confirms no separate inline auth error for `로그인이 필요해요.` on the screen. The shard does not confirm whether other visual indicators accompany the toasts.

**Next:** Go to code for the screen UI to confirm the exact pending-state wiring and toast invocation behavior.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d

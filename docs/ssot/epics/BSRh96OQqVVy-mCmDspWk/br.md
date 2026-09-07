---
id: "doc:mwbjWkDVCoHGlWvuXL0Hk"
name: "Chapter Planning and Structure Business Rules"
type: "br"
scope: "epic"
scopeId: "BSRh96OQqVVy-mCmDspWk"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"br-chapter-create-submit-gating","title":"New chapter submission requires a non-blank title and an available submit state","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45"],"modelLinks":[]},{"stableKey":"br-chapter-create-auth-and-target-validation","title":"Chapter creation requires an authenticated owner context and a valid optional folder","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45"],"modelLinks":[]},{"stableKey":"br-chapter-create-order-and-success-route","title":"Successful chapter creation appends the next chapter order and opens the created chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45"],"modelLinks":[]},{"stableKey":"br-chapter-list-auth-loading","title":"Chapter list loading is authenticated and otherwise falls back to an empty list","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"],"modelLinks":[]},{"stableKey":"br-chapter-list-query-and-navigation","title":"Chapter list shows ordered non-deleted chapters and exposes chapter and create routes","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"],"modelLinks":[]},{"stableKey":"br-chapter-reorder-guard-and-trigger","title":"Chapter reorder runs only for a real drag change and requires an authenticated owned work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Planning and Structure Business Rules

Source-grounded business rules for Chapter Planning and Structure.

## br-chapter-create-submit-gating — New chapter submission requires a non-blank title and an available submit state

The create form only allows submission when the title has non-whitespace content and no submit is already pending.

**Rule:** The create-chapter submit action must remain unavailable while a submission is pending or while `title.trim()` is empty.

**When/Then:** While the new-chapter form is shown. The user cannot trigger chapter creation until the title contains non-whitespace text and the pending state clears.

**Watch:** The shard shows only one visible required field on this screen. No additional client-side validation beyond trimmed-title checking is confirmed in this shard.

**Next:** screen_spec: confirm exact disabled-state presentation for the submit button. code: inspect the form component for any additional client-side validation not surfaced in the shard.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45

## br-chapter-create-auth-and-target-validation — Chapter creation requires an authenticated owner context and a valid optional folder

The action layer for chapter creation validates login, ownership of the work, and folder eligibility before creating a chapter.

**Rule:** The system must reject chapter creation unless the requester is authenticated, the target work is owned by that requester, and any supplied folder is both in the same work and a `회차` folder node.

**When/Then:** When `submitCreateChapter(workId, title, folderId ?? null)` is invoked. Only authorized creates against a valid owned work context can proceed to chapter creation.

**Watch:** The shard confirms these validations exist in the action layer but does not show each invalid-case response in detail. Requester authentication, work ownership, and folder eligibility are distinct checks and should not …

**Next:** code: inspect `submitCreateChapter` for the exact lookup sequence and rejection branches. data_dictionary: confirm the folder node type model and work ownership columns.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45

## br-chapter-create-order-and-success-route — Successful chapter creation appends the next chapter order and opens the created chapter

A successful create uses the next order position in the work and routes to the created chapter detail screen.

**Rule:** When a chapter is created successfully for a work, the chapter must receive the next `order_index` after that work's current maximum and the user must be routed to the created chapter detail screen.

**When/Then:** When chapter creation succeeds. The new chapter is placed at the end of the work's chapter order and becomes the next screen the user sees.

**Watch:** The shard confirms direct navigation on success but does not show whether any additional side effects occur. The exact persisted record shape is not fully shown in this shard.

**Next:** code: inspect `submitCreateChapter` for the exact inserted record fields and returned `chapterId` source. screen_spec: confirm whether any success toast or intermediate state exists before navigation.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45

## br-chapter-list-auth-loading — Chapter list loading is authenticated and otherwise falls back to an empty list

The chapter list query runs only for an authenticated user context; unauthenticated rendering shows no fetched chapters.

**Rule:** The chapter list screen must fetch chapters only when an authenticated user is present; otherwise it must render using an empty chapter list.

**When/Then:** When `/studio/:workId/chapters` renders. Authenticated users can receive chapter data, while unauthenticated users do not trigger the chapter query from this screen.

**Watch:** This shard confirms query gating at the screen level, not the full server-side authorization model of `listChapters`. Unauthenticated empty rendering should not be treated as proof that the work is accessible to anonymo…

**Next:** code: inspect `listChapters` for any additional auth or ownership verification beyond the shown call site. screen_spec: confirm whether unauthenticated empty-state messaging differs from a true no-chapters state.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3

## br-chapter-list-query-and-navigation — Chapter list shows ordered non-deleted chapters and exposes chapter and create routes

The list screen displays chapters in ascending order and provides entry points to detail and creation routes.

**Rule:** The chapter list must present non-deleted chapters for the selected work in ascending `order_index`, and it must provide navigation to both chapter detail and new-chapter creation routes.

**When/Then:** While the chapter list screen is displayed. Users can review the ordered chapter set and open either an existing chapter or the create flow from this screen.

**Watch:** The shard confirms two visible creation entry points on this screen. Badge presentation such as `미발행`, `{price_tier} 토큰`, and `무료` is visible behavior here but does not by itself define publishing rules.

**Next:** code: inspect `listChapters` for the exact query and returned fields such as `is_published` and `price_tier`. screen_spec: confirm the empty-state and header-button variants for creation entry points.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3

## br-chapter-reorder-guard-and-trigger — Chapter reorder runs only for a real drag change and requires an authenticated owned work

The reorder action is skipped for no-op drops and validated again in the action layer before completing.

**Rule:** The system must only attempt chapter reordering when the drag operation changes the order, and the reorder action must require an authenticated requester with a valid owned work context before it succeeds.

**When/Then:** When a drag-and-drop reorder ends on the chapter list screen. No-op drops produce no reorder request, while valid reorder attempts are guarded by authentication and ownership checks before list revalidation on success.

**Watch:** The shard confirms revalidation of `/studio/{workId}/chapters` after success, but not the full client reaction after failure. The ownership failure is described as a work lookup failure and should not be generalized bey…

**Next:** code: inspect `reorderChaptersAction` for exact write semantics and whether chapter ownership is validated directly or through work ownership. code: inspect the list screen for exact UI recovery when the action returns …

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3

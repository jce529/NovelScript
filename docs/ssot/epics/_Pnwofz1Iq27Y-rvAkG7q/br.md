---
id: "doc:7wu-KLQuuV73bjaiG-ItU"
name: "Work Workspace Business Rules"
type: "br"
scope: "epic"
scopeId: "_Pnwofz1Iq27Y-rvAkG7q"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"work-workspace-user-scoped-work-fetch","title":"Work detail lookup is scoped to the current user","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897"],"modelLinks":[]},{"stableKey":"work-workspace-empty-fallback-rendering","title":"Missing work fields render as empty content","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897"],"modelLinks":[]},{"stableKey":"work-workspace-chapter-list-navigation","title":"Work detail screen links to the chapter list","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Work Workspace Business Rules

Source-grounded business rules for Work Workspace.

## work-workspace-user-scoped-work-fetch — Work detail lookup is scoped to the current user

The work detail screen only fetches a work record when a Supabase user exists, and the lookup is filtered by both owner_id and work id.

**Rule:** The screen must fetch work data only when a current Supabase user exists, and the work lookup must be filtered by both owner_id and id.

**When/Then:** WHEN the /studio/:workId page mounts and attempts to load the work detail. Only the current user's matching work record is requested for display on the page.

**Watch:** This shard proves query scoping but does not prove any separate authorization guard or failure response.

**Next:** code. data_dictionary.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897

## work-workspace-empty-fallback-rendering — Missing work fields render as empty content

If work data is missing or incomplete, the title may render empty and the synopsis area renders an empty string fallback.

**Rule:** The screen must render work?.title for the heading and use work?.synopsis || '' for the synopsis area.

**When/Then:** While the work detail screen is rendering. If no work or synopsis is available, the page shows unpopulated title content and an empty synopsis area instead of confirmed alternate UI.

**Watch:** The shard does not confirm whether a missing work record should be treated as a normal case or an error case.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897

## work-workspace-chapter-list-navigation — Work detail screen links to the chapter list

The visible navigation action on the work detail landing page routes the user to the chapter list for the same work.

**Rule:** The screen must provide a navigation link from /studio/:workId to /studio/{workId}/chapters.

**When/Then:** WHEN the user clicks the '회차 목록으로 이동' link. The user navigates to the chapter list for the current work.

**Watch:** This shard only confirms the chapter-list link as a visible navigation action on the screen.

**Next:** screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897

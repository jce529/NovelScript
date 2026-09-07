---
id: "doc:BvgjmkjE3dlP6Dg5PXnoH"
name: "Work Portfolio Management Business Rules"
type: "br"
scope: "epic"
scopeId: "yzFrm9l4_RMevijWnGVDf"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"br-work-list-user-scope","title":"Work list is scoped to the authenticated owner","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]},{"stableKey":"br-work-list-excludes-deleted","title":"Deleted works are not listed","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]},{"stableKey":"br-work-list-empty-state","title":"Empty state replaces the list when no works exist","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]},{"stableKey":"br-work-list-create-entry-points","title":"Create-work action is available from both empty and non-empty states","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]},{"stableKey":"br-work-list-order-and-card-display","title":"Work cards follow most-recent-first ordering and tolerate missing synopsis","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]},{"stableKey":"br-work-list-open-work-navigation","title":"Selecting a work opens that work's detail route","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Work Portfolio Management Business Rules

Source-grounded business rules for Work Portfolio Management.

## br-work-list-user-scope — Work list is scoped to the authenticated owner

The studio work list shows only works belonging to the current authenticated user.

**Rule:** The studio work list must load and display only works associated with the current authenticated user's id.

**When/Then:** When the studio work list screen mounts and a current user exists. The screen requests works for that user only.

**Watch:** The shard confirms current-user scoping on this screen but does not prove broader project-wide authorization rules.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

## br-work-list-excludes-deleted — Deleted works are not listed

Works marked as deleted are excluded from the list shown on the studio work list screen.

**Rule:** The studio work list must exclude deleted works.

**When/Then:** While works are being listed on this screen. Only works with deleted_at equal to null appear in the rendered list.

**Watch:** The shard states the deleted_at rule but does not expose the exact query or storage semantics for soft deletion.

**Next:** code. data_dictionary.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

## br-work-list-empty-state — Empty state replaces the list when no works exist

The screen switches to an empty-state prompt instead of rendering work cards when the user has no listed works.

**Rule:** The studio work list must show the empty state when there are no works to display.

**When/Then:** While works.length === 0 on the rendered screen. The list is replaced by the empty-state prompt, including a create-work call to action.

**Watch:** The shard does not confirm any alternate unauthenticated-state messaging beyond an empty works array.

**Next:** screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

## br-work-list-create-entry-points — Create-work action is available from both empty and non-empty states

Users can start creating a work from the header and from the empty-state prompt.

**Rule:** The studio work list must provide a create-work entry point in both the header and the empty state.

**When/Then:** While the studio work list screen is available to the user. Selecting the create-work action navigates to /studio/works/new.

**Watch:** The shard confirms the navigation destination but not the behavior of the destination screen.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

## br-work-list-order-and-card-display — Work cards follow most-recent-first ordering and tolerate missing synopsis

Rendered work cards are shown in descending created_at order, and missing synopsis values display as an empty string.

**Rule:** The studio work list must render work cards in most-recent-first order and must not fail when synopsis is missing.

**When/Then:** When works are rendered as cards on the studio work list screen. Cards appear in descending created_at order, and any missing synopsis is displayed as an empty string.

**Watch:** The shard does not confirm whether ordering is enforced in listWorks, the screen, or both.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

## br-work-list-open-work-navigation — Selecting a work opens that work's detail route

Clicking a work title routes the user to the corresponding studio work detail page.

**Rule:** The studio work list must provide a per-work navigation path to the selected work's detail page.

**When/Then:** When the user clicks a work title on a listed card. The user is navigated to /studio/{work.id}.

**Watch:** The shard confirms the route pattern but does not confirm downstream access checks on the detail page.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

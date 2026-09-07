---
id: "doc:W1UC02OP6BGs-t5KOiEWk"
name: "Writer Upgrade Business Rules"
type: "br"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"writer-upgrade-authenticated-access","title":"Authenticated users only may access or submit writer upgrade","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":[]},{"stableKey":"writer-upgrade-pen-name-validation","title":"`penName` must be trimmed to 2 through 20 characters","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":[]},{"stableKey":"writer-upgrade-reader-profile-transition","title":"Writer upgrade only updates the current user's reader profile row","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":[]},{"stableKey":"writer-upgrade-redirect-and-error-surface","title":"Upgrade results are surfaced through redirects and the `error` query parameter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Writer Upgrade Business Rules

Source-grounded business rules for Writer Upgrade.

## writer-upgrade-authenticated-access — Authenticated users only may access or submit writer upgrade

Both rendering `/write/start` and running `submitWriterUpgrade` depend on `supabase.auth.getUser()`, and missing users are redirected to `/login`.

**Rule:** Authenticated access is required for both the `/write/start` page and the `submitWriterUpgrade` submission path.

**When/Then:** WHEN `/write/start` is rendered or `submitWriterUpgrade` is invoked. If no authenticated user is available, the flow redirects to `/login`.

**Watch:** The shard proves authentication checks at render and submit time, but it does not prove any separate authorization rule that blocks authenticated non-readers before submission.

**Next:** go_to: code; sourceRef: source_document_1; reason: Verify the exact redirect implementation in the action handler. go_to: screen_spec; sourceRef: source_document_2; reason: Verify the render-time auth gate on the page v…

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9

## writer-upgrade-pen-name-validation — `penName` must be trimmed to 2 through 20 characters

The upgrade is rejected before updating `profiles` if the trimmed `penName` length is below 2 or above 20.

**Rule:** A writer upgrade may proceed only when `penName` trims to a length from 2 to 20 characters.

**When/Then:** For every `upgradeToWriter` attempt. Invalid `penName` input causes the upgrade to return an error instead of updating `profiles`.

**Watch:** The shard does not show any additional pen name character-set restrictions beyond trimmed length. The validation error text is source-specific and should be confirmed in code if exact copy matters.

**Next:** go_to: code; sourceRef: source_document_1; reason: Confirm the exact trim and length check implementation. go_to: screen_spec; sourceRef: source_document_2; reason: Confirm how the required pen name input is presented t…

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9

## writer-upgrade-reader-profile-transition — Writer upgrade only updates the current user's reader profile row

The profile change targets `profiles` where `id = user.id` and `role = 'reader'`, then writes writer fields and treats a missing matched row as already upgraded.

**Rule:** The upgrade changes only the authenticated user's `profiles` row when that row still has `role = 'reader'`.

**When/Then:** WHEN a valid writer upgrade is submitted. The system writes `role: 'writer'`, `pen_name: trimmed`, `pen_name_bio: bio?.trim() || null`, and `pen_name_set_at: new Date().toISOString()`; if no row matches, it returns the …

**Watch:** The shard proves target-row lookup constraints, but it does not prove broader requester authorization rules beyond matching the current authenticated `user.id`. A no-row result is treated as `이미 작가로 전환된 계정입니다.`, which i…

**Next:** go_to: data_dictionary; sourceRef: source_document_1; reason: Confirm the semantics of `profiles.role`, `pen_name`, `pen_name_bio`, and `pen_name_set_at`. go_to: code; sourceRef: source_document_1; reason: Confirm the e…

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9

## writer-upgrade-redirect-and-error-surface — Upgrade results are surfaced through redirects and the `error` query parameter

The handler does not return JSON; it redirects to `/account` on success or back to `/write/start?error=...` on failure, and the page renders the error inline.

**Rule:** The writer-upgrade flow reports outcomes through redirects rather than a JSON response body.

**When/Then:** WHEN `submitWriterUpgrade` receives the result from `upgradeToWriter`. Successful upgrades redirect to `/account`; validation or database failures redirect to `/write/start?error=${encodeURIComponent(result.error ?? 'un…

**Watch:** The shard confirms redirect-only flow and inline rendering, but it does not confirm any server-side flash messaging or persistence beyond the query parameter. Exact HTTP status codes and escaping details are not fully s…

**Next:** go_to: screen_spec; sourceRef: source_document_2; reason: Confirm the exact placement and styling of the inline error rendering. go_to: code; sourceRef: source_document_1; reason: Confirm the exact redirect target const…

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9

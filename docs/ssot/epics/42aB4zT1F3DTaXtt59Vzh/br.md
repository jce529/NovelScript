---
id: "doc:9h-rT3ZauE3y3TCiB0UQo"
name: "New Work Creation Business Rules"
type: "br"
scope: "epic"
scopeId: "42aB4zT1F3DTaXtt59Vzh"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"br-new-work-title-required-submit-gating","title":"Create-work submission requires a non-empty title","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]},{"stableKey":"br-new-work-optional-synopsis-normalization","title":"Blank synopsis is normalized to null on submit","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]},{"stableKey":"br-new-work-auth-check-before-create","title":"Authenticated user is required before work creation proceeds","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]},{"stableKey":"br-new-work-inline-error-on-create-failure","title":"Create failure is surfaced inline","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]},{"stableKey":"br-new-work-success-redirect-to-studio","title":"Successful creation redirects to the new work page","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]},{"stableKey":"br-new-work-disable-submit-while-pending","title":"Pending submission disables repeated submit","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# New Work Creation Business Rules

Source-grounded business rules for New Work Creation.

## br-new-work-title-required-submit-gating — Create-work submission requires a non-empty title

The submit action stays unavailable until the title contains non-whitespace content.

**Rule:** WHILE `title.trim()` is empty, the screen must keep the `새 작품 만들기` submit button disabled.

**When/Then:** `title.trim()` is empty on the create-work form. The user cannot submit the create-work request from this screen.

**Watch:** This shard proves client-side disabling based on `title.trim()` but does not prove whether backend validation rejects every empty-title variant independently of the UI.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

## br-new-work-optional-synopsis-normalization — Blank synopsis is normalized to null on submit

Synopsis remains optional, and blank or whitespace-only input is sent as null when the user submits.

**Rule:** WHEN the user clicks `새 작품 만들기`, the screen must call `submitCreateWork` with `title`, `trimmed-or-null synopsis`, and `genre`.

**When/Then:** The user submits the create-work form. Whitespace-only synopsis is sent as `null`, and genre may remain unselected.

**Watch:** The shard does not prove how `create_work` stores or further validates synopsis after the UI sends `trimmed-or-null synopsis`. The shard confirms `장르 (선택)` is optional, but it does not provide the full allowed value set…

**Next:** code. api_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

## br-new-work-auth-check-before-create — Authenticated user is required before work creation proceeds

The submission flow checks for a signed-in user before attempting to create a work.

**Rule:** WHEN `submitCreateWork` runs, it must call `createClient` and `supabase.auth.getUser`; IF no user is found, it must return the login-required error instead of creating the work.

**When/Then:** The submission flow has no authenticated user. The create-work operation does not proceed for an unauthenticated requester.

**Watch:** This shard proves an authentication check in the screen flow, but it does not prove the full authorization model for `create_work`. The exact presentation of the login-required error in the UI is not fully described bey…

**Next:** code. api_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

## br-new-work-inline-error-on-create-failure — Create failure is surfaced inline

Failures from the create flow appear as a destructive inline error message above the form.

**Rule:** IF `createWork` returns failure, the screen must show a visible destructive error message inline above the form using the returned error, or `작품을 만들지 못했어요.` when no specific error is available.

**When/Then:** The create-work request fails. The user sees inline feedback that the work was not created.

**Watch:** The shard does not enumerate all failure sources from `createWork`, `supabase.rpc('create_work', ...)`, or template seeding. The shard says the downstream template-seeding behavior is not otherwise shown in the UI.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

## br-new-work-success-redirect-to-studio — Successful creation redirects to the new work page

After a successful create response, the user is taken to the new work workspace route.

**Rule:** WHEN `createWork` succeeds, the screen must navigate to `/studio/{workId}`.

**When/Then:** The create-work request succeeds. The user is redirected to the newly created work page.

**Watch:** This shard proves redirect behavior from the create-work screen only and does not define what the destination page loads next.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

## br-new-work-disable-submit-while-pending — Pending submission disables repeated submit

The form prevents repeated submission while the create transition is in progress.

**Rule:** WHILE the create-work submission is pending, the `새 작품 만들기` button must remain disabled.

**When/Then:** The submission transition is pending. The screen blocks duplicate submits during the in-flight create request.

**Watch:** The shard explicitly says there is no loading spinner or other empty state beyond the disabled button while pending.

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

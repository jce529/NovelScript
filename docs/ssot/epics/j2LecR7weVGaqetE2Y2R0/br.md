---
id: "doc:rcn0TuYvIZiVgonaO3sDM"
name: "Identity Completion Business Rules"
type: "br"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"br-identity-completion-invalid-email-redirect","title":"Reject invalid email input before account update","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]},{"stableKey":"br-identity-completion-update-error-redirect","title":"Return provider update errors through the route error query","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]},{"stableKey":"br-identity-completion-success-redirect-account","title":"Route successful email completion to the account page","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]},{"stableKey":"br-identity-completion-route-driven-error-display","title":"Display route-provided error text on the email completion screen","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Identity Completion Business Rules

Source-grounded business rules for Identity Completion.

## br-identity-completion-invalid-email-redirect — Reject invalid email input before account update

Blank email values and values without `@` are rejected locally and redirected back to the email completion route with `error=invalid`.

**Rule:** Invalid email input must be rejected before the account email update proceeds.

**When/Then:** If the trimmed `email` value is empty or does not include `@`. Redirect to `/auth/complete-email?error=invalid` and do not proceed with the Supabase auth update.

**Watch:** Only missing values and values without `@` are explicitly confirmed by the shard. No authentication or authorization rule is proven by this validation behavior alone.

**Next:** code. api_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4

## br-identity-completion-update-error-redirect — Return provider update errors through the route error query

If the Supabase user-email update fails, the user is redirected back to the completion page with the error message in the `error` query parameter.

**Rule:** Provider-side email update failures must be surfaced by redirecting the user back to the completion route with an error query value.

**When/Then:** If `supabase.auth.updateUser({ email })` returns an `error`. Redirect back to `/auth/complete-email?error=...` instead of routing to `/account`.

**Watch:** The exact encoding step is explicitly visible in `source_document_1` and summarized more generally in `source_document_2`. The shard does not confirm any retry logic, logging, or alternate error handling path.

**Next:** code. api_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4

## br-identity-completion-success-redirect-account — Route successful email completion to the account page

A successful email update sends the user to `/account`.

**Rule:** Successful completion of the email update must continue the user to the account page.

**When/Then:** When `supabase.auth.updateUser({ email })` succeeds for the submitted email. Redirect to `/account`.

**Watch:** The shard shows the redirect outcome but not whether the account page enforces additional prerequisites. No returned payload from the update call is described in the shard.

**Next:** code. screen_spec.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4

## br-identity-completion-route-driven-error-display — Display route-provided error text on the email completion screen

The completion screen renders error text only when the route provides an `error` search parameter and otherwise presents the email form bound to `submitEmail`.

**Rule:** The email completion screen must use the route error parameter to decide whether to render visible error text and must submit the email form to `submitEmail`.

**When/Then:** While the user is on `/auth/complete-email`. Show the email form, and show the error paragraph only when `searchParams.error` exists.

**Watch:** This rule confirms route-driven error presentation, not the origin or trust level of arbitrary query-string content. The shard does not prove any additional navigation options or alternate submission targets on this scr…

**Next:** screen_spec. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4

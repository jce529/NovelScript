---
id: "doc:A8j3fHdklKIyCZ6OlYfcg"
name: "Authentication Callback Handling Business Rules"
type: "br"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"auth-callback-session-exchange-success-gate","title":"Successful destination redirect requires a valid code exchange and user","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]},{"stableKey":"auth-callback-email-completion-redirect","title":"Users needing email completion are routed to `/auth/complete-email`","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]},{"stableKey":"auth-callback-default-next-destination","title":"The callback uses `/` as the default destination path","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]},{"stableKey":"auth-callback-error-redirect-fallback","title":"All non-success callback branches redirect to `/auth/auth-code-error`","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Authentication Callback Handling Business Rules

Source-grounded business rules for Authentication Callback Handling.

## auth-callback-session-exchange-success-gate — Successful destination redirect requires a valid code exchange and user

The callback only sends the user to the destination path after a present `code` is exchanged successfully and `data.user` exists.

**Rule:** WHEN the callback request includes `code`, the handler must call `createClient()` and `supabase.auth.exchangeCodeForSession(code)`, and it may redirect to the destination path only if the exchange returns no `error` and…

**When/Then:** A GET authentication callback request is received with a `code` query parameter. The request becomes eligible for post-sign-in routing instead of the error path.

**Watch:** The shard does not confirm whether any additional session checks occur after `exchangeCodeForSession(code)`. The shard does not confirm whether destination routing is limited to internal paths.

**Next:** code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

## auth-callback-email-completion-redirect — Users needing email completion are routed to `/auth/complete-email`

After a successful code exchange, users whose profile still needs email completion are diverted to the email completion screen.

**Rule:** WHEN `exchangeCodeForSession(code)` succeeds and returns `data.user`, IF `needsEmailCompletion(data.user)` is true, the handler must redirect the user to `/auth/complete-email`.

**When/Then:** The auth code exchange succeeded and produced `data.user`. The user is routed to the identity completion step instead of the requested destination.

**Watch:** The full implementation of `needsEmailCompletion(data.user)` is not shown in this shard. The shard only explicitly states the missing or blank `email` case.

**Next:** Identity Completion. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

## auth-callback-default-next-destination — The callback uses `/` as the default destination path

If the callback request omits `next`, the handler defaults the successful destination redirect to `/`.

**Rule:** WHEN the callback request is parsed, the handler must read `next` from `searchParams` and use `'/'` as the default destination when `next` is absent.

**When/Then:** A callback request URL is being parsed. Successful non-email-completion routing falls back to the home path when no destination override is supplied.

**Watch:** The shard does not confirm whether blank or malformed `next` values are normalized the same way as an absent parameter.

**Next:** code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

## auth-callback-error-redirect-fallback — All non-success callback branches redirect to `/auth/auth-code-error`

The callback sends the user to the auth-code error route whenever the code is missing or the exchange does not produce a valid user result.

**Rule:** IF `code` is missing, or `exchangeCodeForSession(code)` returns an `error`, or `data.user` is absent, the handler must redirect to `/auth/auth-code-error`.

**When/Then:** The callback request cannot complete a successful session exchange and user resolution. The user is routed to the authentication code error path.

**Watch:** The shard does not show whether different failure reasons are distinguished for the user or for telemetry.

**Next:** Login Error Recovery. code.

**Sources:** doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298

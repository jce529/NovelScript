---
id: "doc:qkorCmMSOxlOHbLsKB6xo"
name: "Authentication Callback Handling Use Cases"
type: "ucl"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-auth-callback-routing","title":"User completes external sign-in callback and is routed to the next step","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:d21928355a0ae298"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Authentication Callback Handling Use Cases

Routing index for the external sign-in callback that establishes a session and sends the user to the correct next step or error path.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-auth-callback-routing | user | Complete external sign-in and reach the correct next step after the authentication callback. | 1 doc |

## use-case-auth-callback-routing — User completes external sign-in callback and is routed to the next step

Routes a user from the authentication callback to email completion, the requested destination, or an error path based on auth code exchange results.

Actor: user

Goal: Complete external sign-in and reach the correct next step after the authentication callback.

Claim: A user returning from external sign-in can complete the callback flow: when the auth code exchange succeeds and a user is present, the flow redirects either to email completion for a missing or blank email or to the requested destination, and otherwise redirects to an auth code error path.

Cautions:
- The source proves a generic user callback flow, not a stronger requester role such as admin or owner.
- The default destination is the home path when no next destination is provided.

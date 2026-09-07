---
id: "doc:b6X8AzSuhRiiUa9GfprFJ"
name: "Account Closure Use Cases"
type: "ucl"
scope: "epic"
scopeId: "HoBO4rJLao81zsp1RnCM7"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"authenticated-user-closes-account-and-ends-session","title":"Authenticated user closes their account and ends their session","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:c6012ec2744d8fcf"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Account Closure Use Cases

Searchable routing entries for how an authenticated user closes an account and ends their session.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| authenticated-user-closes-account-and-ends-session | authenticated user | Close their account safely and end their current session. | 1 doc |

## authenticated-user-closes-account-and-ends-session — Authenticated user closes their account and ends their session

Route here for account closure that soft-deletes the user profile, signs the user out, and returns them to the login screen.

Actor: authenticated user

Goal: Close their account safely and end their current session.

Claim: An authenticated user can submit account closure, which soft-deletes their profile when it is not already deleted, then signs them out and sends them to the login screen.

Cautions:
- This entry is only proven for an authenticated user.
- The soft-delete update is conditional, so already-deleted profiles are not updated again.
- Exact user-facing messaging and complete data-clearing scope are not fully confirmed from the provided context.

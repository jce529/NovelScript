---
id: "doc:vgo-RKoWDHt0Cu_oLlGyt"
name: "Account Overview Use Case Routing"
type: "ucl"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-account-settings-review","title":"Authenticated user reviews account settings and account status","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Account Overview Use Case Routing

Routing index for the account settings experience backed by the provided account screen specification.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-account-settings-review | authenticated user | Review account details, profile state, and relevant account actions from the account settings area. | 1 doc |

## use-case-account-settings-review — Authenticated user reviews account settings and account status

Routes to the account settings source for viewing account details, profile state, and access conditions.

Actor: authenticated user

Goal: Review account details, profile state, and relevant account actions from the account settings area.

Claim: An authenticated user can open the account settings area to view account details and profile state, including email and writer-only pen name display, while unauthenticated or inactive accounts are redirected to login.

Cautions:
- Inactive accounts are signed out before redirecting to login.
- Pen name is shown only for writer profiles.
- The exact list of linked next actions is not fully described in the provided context.

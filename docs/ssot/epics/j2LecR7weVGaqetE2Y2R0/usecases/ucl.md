---
id: "doc:1fuN5YrpDDJ8emyRssayM"
name: "Identity Completion"
type: "ucl"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-complete-missing-account-email-address","title":"Complete a missing account email address","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:b1691adca3c4cb20","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c05b800246f420f4"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Identity Completion

Routing index for completing a missing email address on an account so the user can continue into their account area.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-complete-missing-account-email-address | authenticated user | Provide a missing email address so the account can be completed and the user can continue into the account area. | 2 docs |

## use-case-complete-missing-account-email-address — Complete a missing account email address

An authenticated user provides a valid-looking email address to finish an incomplete account detail and proceed to the account area.

Actor: authenticated user

Goal: Provide a missing email address so the account can be completed and the user can continue into the account area.

Claim: An authenticated user can enter a required email address, see route-driven validation or update errors, submit the email for account update, and on success continue to their account area.

Cautions:
- Only basic local validation is proven before submission: the email must be present and contain '@'.
- If the account update fails, the user is returned with an error message from the route instead of a confirmed completion.
- The exact authentication guard for reaching this flow is not shown in the provided sources.

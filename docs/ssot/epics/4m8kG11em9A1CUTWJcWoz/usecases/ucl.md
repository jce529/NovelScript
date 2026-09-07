---
id: "doc:N0y6yB2YQGIz_xeaKnxYK"
name: "Login Error Recovery"
type: "ucl"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-return-to-sign-in-after-login-error","title":"Return to sign-in after a login error","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:5bc68d3024c8a70a"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Login Error Recovery

A user who reaches the login error screen can return to the login page and retry sign-in.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-return-to-sign-in-after-login-error | User encountering a login error | Return to the sign-in flow after a failed or interrupted login attempt. | 1 doc |

## use-case-return-to-sign-in-after-login-error — Return to sign-in after a login error

A user on the login error screen can go back to the login page and try signing in again.

Actor: User encountering a login error

Goal: Return to the sign-in flow after a failed or interrupted login attempt.

Claim: A user who encounters the login error screen can navigate back to the login page to retry sign-in.

Cautions:
- Only one visible user action is proven: returning to the login page.
- The screen is shown as static content with no form fields, tabs, lists, modal states, or dynamic values.
- The source does not prove additional self-service recovery options on this screen.

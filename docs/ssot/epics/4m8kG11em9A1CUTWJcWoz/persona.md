---
id: "doc:NWjHelnLtHr3zp2WBnflF"
name: "Login Error Recovery Persona"
type: "persona"
scope: "epic"
scopeId: "4m8kG11em9A1CUTWJcWoz"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Login Error Recovery Persona

Actors involved in recovering from a failed or interrupted sign-in attempt and returning to the login flow.

## Actors

- Signed-out user
  - description: A person who cannot complete sign-in and needs a way back to the login flow.
  - aliases: Returning user
  - aliases: Failed-login user
  - typicalActions: Sees the error screen after a failed or interrupted sign-in attempt
  - typicalActions: Follows the link back to the login page
  - typicalActions: Retries sign-in
- Authentication system
  - description: The system path that detects the failed sign-in state and routes the user back toward login.
  - aliases: Login flow
  - typicalActions: Detects that sign-in was interrupted or failed
  - typicalActions: Shows the recovery screen
  - typicalActions: Sends the user back into the login flow

## Evidence Gaps

- The source context only confirms a centered error screen with a single link back to the login page, so broader recovery behavior is not confirmed.
- The source context does not confirm whether any authenticated state is preserved, cleared, or retried after the error screen is shown.
- The source context does not confirm additional user actions beyond following the return link to the login page.

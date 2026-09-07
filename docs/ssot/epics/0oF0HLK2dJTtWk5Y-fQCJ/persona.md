---
id: "doc:FqnvgoF-gl-RxxntBm128"
name: "Account Overview Persona Draft"
type: "persona"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Account Overview Persona Draft

Persona vocabulary for the signed-in user centered on the account overview screen, with limited evidence for other user states.

## Actors

- Signed-in user
  - description: A user who is already signed in and is viewing their account overview area.
  - aliases: account holder
  - aliases: current user
  - typicalActions: View account details and profile state.
  - typicalActions: Check email and visible profile information.
  - typicalActions: Follow the next actions shown in the account area.
- Writer profile user
  - description: A signed-in user whose profile can display a pen name in the account area.
  - aliases: writer
  - aliases: profile with pen name
  - typicalActions: Review the pen name shown for the profile.
  - typicalActions: Check how the profile appears in the account overview.
- Unauthenticated visitor
  - description: A person who reaches the account area without an active sign-in state.
  - aliases: not signed in user
  - typicalActions: Attempt to open the account area.
  - typicalActions: Continue to the login flow when access is blocked.
- Inactive account holder
  - description: A signed-in user whose account state is not active for the account overview area.
  - aliases: inactive user
  - typicalActions: Attempt to access the account overview.
  - typicalActions: Proceed to login when redirected.

## Evidence Gaps

- Only one screen-level source card is provided, so the full set of related user types is not confirmed.
- Behavior for users beyond viewing account details and being redirected to login is not fully confirmed.
- The exact meaning of inactive account handling is only partially described, so the affected user group remains uncertain.

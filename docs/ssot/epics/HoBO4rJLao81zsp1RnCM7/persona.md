---
id: "doc:kgqp90QX2rQpHBSwAu3lJ"
name: "Account Closure Persona Draft"
type: "persona"
scope: "epic"
scopeId: "HoBO4rJLao81zsp1RnCM7"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Account Closure Persona Draft

This epic centers on a signed-in user who chooses to close their account and exit the session. The available source summary indicates the flow includes profile cleanup, session ending, and a redirect when no signed-in user is present.

## Actors

- Authenticated user
  - description: A person who is signed in and initiates closure of their own account.
  - aliases: signed-in user
  - aliases: account holder
  - typicalActions: Starts the account closure flow
  - typicalActions: Confirms the closure request
  - typicalActions: Ends the session after closure
- Application system
  - description: The system that checks whether a user is signed in and carries out the account closure flow.
  - aliases: platform
  - aliases: account flow
  - typicalActions: Checks for an active signed-in user
  - typicalActions: Handles the closure request
  - typicalActions: Ends the session and sends the user away from the closure flow

## Evidence Gaps

- The available source summary is truncated, so the full closure sequence is not fully confirmed.
- The exact user-facing confirmation steps are not fully confirmed from the provided context.
- It is not fully clear whether any additional post-closure states or notifications are part of this epic.

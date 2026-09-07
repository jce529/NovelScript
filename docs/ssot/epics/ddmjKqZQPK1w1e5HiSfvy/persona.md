---
id: "doc:66ANGyyuodwtneAIXf5V_"
name: "Authentication Callback Handling Persona"
type: "persona"
scope: "epic"
scopeId: "ddmjKqZQPK1w1e5HiSfvy"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Authentication Callback Handling Persona

Actor vocabulary for the sign-in callback flow that completes external authentication, establishes a session, and sends the user to the next step or error path.

## Actors

- Signing-in user
  - description: A person attempting to complete external sign-in and continue into the application.
  - aliases: User
  - aliases: Returning user
  - typicalActions: Return from the external sign-in flow
  - typicalActions: Complete the callback step
  - typicalActions: Follow the redirect to the next page or completion step
  - typicalActions: Respond to any sign-in error path
- External sign-in provider
  - description: The external authentication system that returns the sign-in result used to complete the session.
  - aliases: Identity provider
  - aliases: Auth provider
  - typicalActions: Return an authorization result
  - typicalActions: Provide the code exchanged during callback handling
  - typicalActions: Enable session completion for the signing-in user

## Evidence Gaps

- The available context confirms the callback flow, but it does not fully describe every downstream state after session creation.
- The available context does not confirm whether any additional user types besides the signing-in user and the external sign-in provider should be treated as primary actors.
- The available context does not confirm the full set of error conditions or recovery actions exposed to the user.

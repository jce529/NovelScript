---
id: "doc:d2VRAmfBoAA8XqB003OmF"
name: "Social Sign-In Persona"
type: "persona"
scope: "epic"
scopeId: "8v1lQnJKU9IzItheJ79gQ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Social Sign-In Persona

Epic-level actor vocabulary for users who start an authenticated session through supported social sign-in options.

## Actors

- Visitor
  - description: A person who reaches the login screen and chooses a supported social provider to start sign-in.
  - aliases: Login user
  - aliases: Sign-in candidate
  - typicalActions: Open the login screen
  - typicalActions: Choose a supported sign-in provider
  - typicalActions: Complete the provider flow and continue into the app
- Signed-in user
  - description: A person who has completed social sign-in and is entering an authenticated session.
  - aliases: Authenticated user
  - typicalActions: Continue after successful sign-in
  - typicalActions: Use the application in an authenticated state
  - typicalActions: Return through the sign-in flow when access is needed again

## Evidence Gaps

- Only the login screen behavior is visible here, so post-login session handling and downstream authenticated flows are not confirmed.
- No lower source cards are available for roles beyond the sign-in visitor, so broader account or permission-based actors are not confirmed.

---
id: "doc:8XGt2HJu--zpbZlDY7OiK"
name: "Writer Upgrade Persona"
type: "persona"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Writer Upgrade Persona

Epics around converting an authenticated reader into a writer account with the minimum required setup.

## Actors

- Authenticated reader
  - description: A signed-in person who begins writer onboarding from the upgrade flow.
  - aliases: signed-in reader
  - aliases: reader user
  - typicalActions: Open the writer onboarding entry point
  - typicalActions: Enter a pen name
  - typicalActions: Optionally provide a bio
  - typicalActions: Submit the upgrade request
- Writer applicant
  - description: A user who is in the process of converting their reader account into a writer account.
  - aliases: writer candidate
  - aliases: upgrading user
  - typicalActions: Review the onboarding form
  - typicalActions: Correct missing or invalid details
  - typicalActions: Retry submission after an error
  - typicalActions: Continue after the account upgrade succeeds
- Unauthenticated visitor
  - description: A person who tries to access the writer onboarding flow without an active sign-in.
  - aliases: signed-out visitor
  - aliases: not signed-in user
  - typicalActions: Attempt to open the onboarding route
  - typicalActions: Get redirected to sign in
  - typicalActions: Return after authentication

## Evidence Gaps

- The exact downstream account state after a successful upgrade is not fully confirmed from the provided context.
- The available context confirms an authenticated onboarding flow, but it does not fully enumerate every actor interaction beyond the reader and the signed-in user.
- The behavior for all error branches is only partially described, so the full set of user-visible recovery paths is not confirmed.

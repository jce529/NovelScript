---
id: "doc:xyA5cxfikE2dxqnvD5PNE"
name: "Identity Completion Persona"
type: "persona"
scope: "epic"
scopeId: "j2LecR7weVGaqetE2Y2R0"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Identity Completion Persona

This epic serves a signed-in user who needs to complete missing account identity details, especially email, before continuing.

## Actors

- Signed-in user with incomplete account information
  - description: A person already signed in whose account is missing required identity details and who must complete them to proceed.
  - aliases: Authenticated user
  - aliases: User needing identity completion
  - typicalActions: Opens the identity completion screen
  - typicalActions: Enters an email address
  - typicalActions: Submits the form
  - typicalActions: Retries after validation errors
- Authentication fallback screen
  - description: A user-facing screen that collects the missing email address and presents validation feedback when the entry is invalid.
  - aliases: Email completion screen
  - aliases: Completion form
  - typicalActions: Displays an error message when a prior submission failed
  - typicalActions: Accepts the email input
  - typicalActions: Sends the submission for validation

## Evidence Gaps

- The available context confirms an email completion flow, but it does not fully describe every other identity field that may be required by the broader epic.
- The context shows a route-level validation and update flow, but it does not confirm whether additional user states or alternate fallback paths are supported.

---
id: "doc:ER48S7cRJKKLBOy3PfCWx"
name: "Home Discovery Persona"
type: "persona"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Home Discovery Persona

Readers arrive at the home screen to browse curated rankings, recommendations, and continuation cues, with a slightly richer view when signed in.

## Actors

- Reader
  - description: A person browsing the home discovery screen to explore featured content and decide what to open next.
  - aliases: visitor
  - aliases: signed-out user
  - typicalActions: Open the home screen
  - typicalActions: Browse rankings and recommendations
  - typicalActions: Inspect featured cards
  - typicalActions: Use continuation cues when available
- Signed-in reader
  - description: A returning reader who can see a more personalized home experience, including recently read content when available.
  - aliases: authenticated reader
  - typicalActions: Return to the home screen
  - typicalActions: Review recently read content
  - typicalActions: Continue from prior reading position
  - typicalActions: Browse curated recommendations and rankings

## Evidence Gaps

- The provided context confirms the home discovery screen layout, but it does not fully define which reader segments are intended beyond signed-in and signed-out users.
- The context mentions personalized continuation cues, but it does not confirm the exact personalization logic or eligibility rules.
- The context does not fully specify whether the optional recently read section is shown only to signed-in users in every implementation variant.

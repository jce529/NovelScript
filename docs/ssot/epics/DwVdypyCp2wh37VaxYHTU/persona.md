---
id: "doc:MTELCbBjxPiCcTt5cRp3c"
name: "Chapter Reading Experience Persona"
type: "persona"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: []
relatedDocs: []
serviceMapNodes: []
---
# Chapter Reading Experience Persona

Actors for the chapter reading experience centered on loading a chapter, reading its content, navigating between chapters, and handling locked or access-limited states.

## Actors

- Reader
  - description: A person reading a chapter in the work viewer and moving through chapter content and navigation states.
  - aliases: Authenticated reader
  - aliases: Chapter reader
  - typicalActions: Open a chapter
  - typicalActions: Read chapter content
  - typicalActions: Move to the next or previous chapter
  - typicalActions: Use the table of contents to jump between chapters
  - typicalActions: Encounter a locked or unavailable chapter state
- Visitor
  - description: A person reaching the chapter view without confirmed access or sign-in state.
  - aliases: Unauthenticated visitor
  - aliases: Public viewer
  - typicalActions: Open a chapter link
  - typicalActions: See chapter availability or access messaging
  - typicalActions: Decide whether to continue toward access
- Authorized member
  - description: A person who can view chapter content that is not available to everyone.
  - aliases: Access-granted reader
  - typicalActions: Access restricted chapter content
  - typicalActions: Continue reading after access is confirmed
  - typicalActions: Use reading navigation within available chapters

## Evidence Gaps

- The source context confirms a chapter reader screen for /works/:workId/chapters/:chapterId, but it does not fully confirm whether additional reading modes or alternate entry points exist.
- The available context shows chapter loading, table of contents access, navigation, and locked-state handling, but it does not fully confirm all reader preferences or access rules for every variant.

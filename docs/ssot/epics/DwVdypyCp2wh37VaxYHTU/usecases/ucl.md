---
id: "doc:pW-7QXuB2-A8AuT_QnFku"
name: "Chapter Reading Experience use case list"
type: "ucl"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-read-public-chapter","title":"Read a public chapter with navigation and viewing preferences","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]},{"stableKey":"use-case-report-from-chapter-reader","title":"Submit a chapter report as an authenticated reader","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Reading Experience use case list

Routing index for reading a public chapter and reporting issues from the chapter reader.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-read-public-chapter | Public reader | Read a public chapter and control the reading experience | 1 doc |
| use-case-report-from-chapter-reader | Authenticated reader | Report a problem encountered while reading a chapter | 1 doc |

## use-case-read-public-chapter — Read a public chapter with navigation and viewing preferences

A public reader opens a public chapter, sees content or a locked-state message, and uses navigation, table of contents, and reading settings.

Actor: Public reader

Goal: Read a public chapter and control the reading experience

Claim: A public reader can open a public work chapter, view the current chapter or its locked-state message, move through chapter navigation and table of contents, and adjust reading display options within the supported font sizes and themes.

Cautions:
- If the work or chapter is not public or missing, the screen falls through to an unavailable page.
- Locked chapters hide chapter content and show only the preparation message.
- Font sizes are limited to 17, 19, 21, and 24, and themes are limited to light, sepia, and dark.

## use-case-report-from-chapter-reader — Submit a chapter report as an authenticated reader

An authenticated reader reports an issue from the chapter reader with login-gated access and reason-based validation.

Actor: Authenticated reader

Goal: Report a problem encountered while reading a chapter

Claim: An authenticated reader can submit a report from the chapter reader, and the report flow requires login when the report UI opens and again when the submission action runs.

Cautions:
- If the report reason is 기타, detailed content is required by validation.
- The source does not confirm the full list of report reasons or the post-submission review process.
- This source proves authenticated access for reporting, not elevated moderation or admin authority.

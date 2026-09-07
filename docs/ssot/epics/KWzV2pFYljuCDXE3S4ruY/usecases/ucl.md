---
id: "doc:OXdCS9MkYFpq-HWQATVd2"
name: "Chapter Editing and Publishing Use Case List"
type: "ucl"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"use-case-studio-chapter-edit-save-publish","title":"Edit, save, and publish a chapter from the studio editor","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]},{"stableKey":"use-case-studio-chapter-ai-proposals","title":"Use AI proposals while drafting a chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":[]}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Editing and Publishing Use Case List

Routing index for the chapter editing workspace, covering chapter drafting, saving, publishing, and AI-assisted proposal handling from the studio chapter editor.

## Use Case Index

| Use case | Actor | Goal | Linked specs |
| --- | --- | --- | --- |
| use-case-studio-chapter-edit-save-publish | studio user | Revise, save, and publish chapter content from the studio chapter editor | 1 doc |
| use-case-studio-chapter-ai-proposals | studio user | Use AI suggestions and proposal saving while drafting a chapter | 1 doc |

## use-case-studio-chapter-edit-save-publish — Edit, save, and publish a chapter from the studio editor

A studio user revises loaded chapter content, saves draft changes, and publishes the chapter as free or paid from the chapter editor.

Actor: studio user

Goal: Revise, save, and publish chapter content from the studio chapter editor

Claim: A studio user works in a chapter editor that loads existing chapter content, allows revision after the record loads, supports saving draft content, and supports publishing with free or paid pricing plus unpublish confirmation.

Cautions:
- The actor is not proven as owner, admin, or any stronger role.
- Free publication uses no price tier, while paid publication is constrained to 10, 30, 50, and 100.
- No source-backed fallback is shown for load failure or a missing chapter.

## use-case-studio-chapter-ai-proposals — Use AI proposals while drafting a chapter

A studio user uses the chapter editor's AI assistant and can save a proposal when one exists and no other save is in progress.

Actor: studio user

Goal: Use AI suggestions and proposal saving while drafting a chapter

Claim: A studio user can use the chapter editor's AI assistant workflow to review interactive chat output and save a proposal into chapter-related knowledge only when a proposal exists and no other proposal save is in progress.

Cautions:
- The detailed implementation of generation, regeneration, and rejection is not fully confirmed in the provided context.
- Only the last displayed chat message is confirmed as interactive.
- Mention autocomplete opens only when the text immediately before the caret matches an @ query.

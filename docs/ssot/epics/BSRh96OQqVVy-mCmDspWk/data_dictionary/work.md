---
id: "item:nIDP84PkFdkBfd-VJJrLp"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "BSRh96OQqVVy-mCmDspWk"
parentDocumentId: "doc:EU4zddMQ1vOGAZVGYHtGS"
stableKey: "work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

A work is the parent record for chapter creation and chapter listing, and ownership of the work is part of source-backed validation.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Optional cover image location for the work. |
| created_at | created_at | Timestamp for when the work record was created. |
| deleted_at | deleted_at | Soft-delete timestamp for the work. |
| genre | genre | Optional genre of the work. |
| id | id | Unique identifier for a work record and route-level parent for chapter screens. |
| owner_id | owner_id | Identifier of the user who owns the work. Chapter creation validation requires a valid work owned by the logged-in user. |
| synopsis | synopsis | Optional synopsis of the work. |
| title | title | Stored title of the work. |
| updated_at | updated_at | Timestamp for when the work record was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany |  |  |  |  |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany |  |  |  |  |
| reports | Report | oneToMany |  |  |  |  |
| workBookmarks | WorkBookmark | oneToMany |  |  |  |  |
| workLikes | WorkLike | oneToMany |  |  |  |  |
| workSubscriptions | WorkSubscription | oneToMany |  |  |  |  |

_Parent data dictionary: ../data_dictionary.md_

---
id: "item:hW3KqNdYMUV9qSzyxwsKw"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

Stores the main work record shown on the detail screen, including ownership, presentation fields, and engagement links.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Image location used to display the work cover. |
| created_at | created_at | Timestamp when the work record was created. |
| deleted_at | deleted_at | Timestamp used when the work record has been soft-deleted. |
| genre | genre | Genre label associated with the work. |
| id | id | Unique identifier for the work shown on the detail screen. |
| owner_id | owner_id | Identifier of the profile that owns the work. |
| synopsis | synopsis | Introduction text for the work when present. |
| title | title | Reader-facing title of the work. |
| updated_at | updated_at | Timestamp when the work record was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany | primary | Links a work to its chapter records that support the chapters tab. |  |  |
| kbNodes | KbNode | oneToMany | out_of_scope | Links a work to related knowledge-base nodes, but this chunk does not confirm how the detail screen uses them. |  |  |
| owner_id | Profile | manyToOne | reference | Links each work to its owner profile. | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany | reference | Links a work to reader progress records used to load reading progress state. |  |  |
| reports | Report | oneToMany | reference | Links a work to report records associated with reader reporting actions. |  |  |
| workBookmarks | WorkBookmark | oneToMany | reference | Links a work to bookmark records used to load bookmark state. |  |  |
| workLikes | WorkLike | oneToMany | primary | Links a work to like records used for like state and like count. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | primary | Links a work to subscription records used for reader subscription state. |  |  |

_Parent data dictionary: ../data_dictionary.md_

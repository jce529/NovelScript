---
id: "item:a09uWo7DgmVMLfCu2iqO8"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "yzFrm9l4_RMevijWnGVDf"
parentDocumentId: "doc:vASDcXr8SmFxXveXVCtCz"
stableKey: "entity-work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

A writer-owned work record used to populate the studio work list and route into a specific title.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Optional image reference stored with the work. |
| created_at | created_at | Creation timestamp used to order the studio work list from most recent to oldest. |
| deleted_at | deleted_at | Optional deletion timestamp; only works with deleted_at equal to null are listed on /studio. |
| genre | genre | Optional genre value stored with the work. |
| id | id | Unique identifier for a work record and the value used in the work detail route. |
| owner_id | owner_id | Identifier of the authenticated user who owns the work and is used to filter the studio work list. |
| synopsis | synopsis | Optional summary text for the work; when absent on /studio, it may render as an empty string. |
| title | title | Primary name of the work shown in the studio work list and used as the clickable label to open the work. |
| updated_at | updated_at | Last update timestamp stored with the work record. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany | reference | A work can have multiple chapters linked to it. |  |  |
| kbNodes | KbNode | oneToMany | reference | A work can have multiple knowledge base nodes linked to it. |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany | out_of_scope | A work can have multiple reading progress records linked to it. |  |  |
| reports | Report | oneToMany | out_of_scope | A work can have multiple report records linked to it. |  |  |
| workBookmarks | WorkBookmark | oneToMany | out_of_scope | A work can have multiple bookmark records linked to it. |  |  |
| workLikes | WorkLike | oneToMany | out_of_scope | A work can have multiple like records linked to it. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | out_of_scope | A work can have multiple subscription records linked to it. |  |  |

_Parent data dictionary: ../data_dictionary.md_

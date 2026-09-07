---
id: "item:8BLnbLw0ClzzdTizLqZ6F"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "_Pnwofz1Iq27Y-rvAkG7q"
parentDocumentId: "doc:WOiRk5BM8mEg6rsdVkvAV"
stableKey: "entity:work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

Model-backed work record scoped to the current user and loaded for the Work Workspace landing page.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b1016d8fb207d897

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Stored cover image reference for the work; screen usage is not confirmed in the provided evidence. |
| created_at | created_at | Timestamp for when the work record was created. |
| deleted_at | deleted_at | Optional timestamp indicating soft deletion state for the work record. |
| genre | genre | Stored genre value for the work; screen usage is not confirmed in the provided evidence. |
| id | id | Unique identifier for the work record. |
| owner_id | owner_id | Identifier of the user who owns the work and scopes access on this screen. |
| synopsis | synopsis | Work synopsis shown in the description area, or an empty string when absent. |
| title | title | Work title shown in the page heading when present. |
| updated_at | updated_at | Timestamp for the most recent update to the work record. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany | primary | A work can have many chapters; the workspace provides navigation to the chapter list for the current work. |  |  |
| kbNodes | KbNode | oneToMany | reference | A work can have many related knowledge-base nodes. |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany | reference | A work can have many related reading progress records. |  |  |
| reports | Report | oneToMany | reference | A work can have many related reports. |  |  |
| workBookmarks | WorkBookmark | oneToMany | reference | A work can have many bookmark records associated with it. |  |  |
| workLikes | WorkLike | oneToMany | reference | A work can have many like records associated with it. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | reference | A work can have many subscription records associated with it. |  |  |

_Parent data dictionary: ../data_dictionary.md_

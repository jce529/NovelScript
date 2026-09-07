---
id: "item:WB_Ie8E9u7RA5g-xB02B3"
name: "Work"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
parentDocumentId: "doc:cRQ5MnQcBsOiDxUynCU6j"
stableKey: "entity:work"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"]
modelLinksOmitted: 4
table_name: "works"
column_names: "cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"
---
# Work

Work record that groups chapters and related knowledge-base content for the editing and publishing flow.

- Table: works
- Model links: YvT2lTG9SMxvmrmmzTkGu:Work, YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url, YvT2lTG9SMxvmrmmzTkGu:Work#created_at, YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Work#genre, YvT2lTG9SMxvmrmmzTkGu:Work#id, YvT2lTG9SMxvmrmmzTkGu:Work#owner_id, YvT2lTG9SMxvmrmmzTkGu:Work#synopsis, YvT2lTG9SMxvmrmmzTkGu:Work#title, YvT2lTG9SMxvmrmmzTkGu:Work#updated_at
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| cover_image_url | cover_image_url | Optional cover image location for the work. |
| created_at | created_at | Timestamp when the work record was created. |
| deleted_at | deleted_at | Optional timestamp that marks the work as soft-deleted. |
| genre | genre | Optional genre assigned to the work. |
| id | id | Unique identifier for the work. |
| owner_id | owner_id | Identifier of the profile that owns the work. |
| synopsis | synopsis | Optional summary text for the work. |
| title | title | Title of the work. |
| updated_at | updated_at | Timestamp when the work record was last updated. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapters | Chapter | oneToMany | primary | A work groups the chapters edited and published in this epic. |  |  |
| kbNodes | KbNode | oneToMany | reference | A work can be linked to knowledge-base nodes that the chapter editor reads and updates. |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| readingProgreses | ReadingProgres | oneToMany | out_of_scope | A work can be linked to reader progress records, but this chunk does not show chapter editing behavior that uses them. |  |  |
| reports | Report | oneToMany | out_of_scope | A work can be linked to report records, but this chunk does not show chapter editing behavior that uses them. |  |  |
| workBookmarks | WorkBookmark | oneToMany | out_of_scope | A work can be linked to bookmark records, but this chunk does not show chapter editing behavior that uses them. |  |  |
| workLikes | WorkLike | oneToMany | out_of_scope | A work can be linked to like records, but this chunk does not show chapter editing behavior that uses them. |  |  |
| workSubscriptions | WorkSubscription | oneToMany | out_of_scope | A work can be linked to subscription records, but this chunk does not show chapter editing behavior that uses them. |  |  |

_Parent data dictionary: ../data_dictionary.md_

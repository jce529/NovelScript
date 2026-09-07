---
id: "item:88ro2FuGE9WSHS2UImYJ6"
name: "WorkBookmark"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-workbookmark"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:WorkBookmark","YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#work_id"]
table_name: "work_bookmarks"
column_names: "created_at, user_id, work_id"
---
# WorkBookmark

Stores reader bookmark records for works.

- Table: work_bookmarks
- Model links: YvT2lTG9SMxvmrmmzTkGu:WorkBookmark, YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#created_at, YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#user_id, YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Stores when the bookmark was created. |
| user_id | user_id | Identifies the reader who bookmarked the work. |
| work_id | work_id | Identifies the bookmarked work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| user_id | Profile | manyToOne | reference | Each bookmark belongs to one reader profile. | user_id | id |
| work_id | Work | manyToOne | primary | Each bookmark belongs to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

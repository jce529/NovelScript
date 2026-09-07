---
id: "item:o0EXMXIwLBpCzUZHICzq9"
name: "WorkLike"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-worklike"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:WorkLike","YvT2lTG9SMxvmrmmzTkGu:WorkLike#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkLike#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkLike#work_id"]
table_name: "work_likes"
column_names: "created_at, user_id, work_id"
---
# WorkLike

Stores reader like records for works.

- Table: work_likes
- Model links: YvT2lTG9SMxvmrmmzTkGu:WorkLike, YvT2lTG9SMxvmrmmzTkGu:WorkLike#created_at, YvT2lTG9SMxvmrmmzTkGu:WorkLike#user_id, YvT2lTG9SMxvmrmmzTkGu:WorkLike#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Timestamp when the like record was created. |
| user_id | user_id | Identifier of the reader who liked the work. |
| work_id | work_id | Identifier of the liked work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| user_id | Profile | manyToOne | reference | Links each like record to the profile that created the like. | user_id | id |
| work_id | Work | manyToOne | primary | Links each like record to the work that was liked. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

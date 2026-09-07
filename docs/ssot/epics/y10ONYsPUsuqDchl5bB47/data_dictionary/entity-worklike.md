---
id: "item:2iVf3hL2PNe-Gp64JntID"
name: "WorkLike"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
parentDocumentId: "doc:i8nz5cyThMV-9swf3Coac"
stableKey: "entity-worklike"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:WorkLike","YvT2lTG9SMxvmrmmzTkGu:WorkLike#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkLike#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkLike#work_id"]
table_name: "work_likes"
column_names: "created_at, user_id, work_id"
---
# WorkLike

Reader like state connecting a profile to a work.

- Table: work_likes
- Model links: YvT2lTG9SMxvmrmmzTkGu:WorkLike, YvT2lTG9SMxvmrmmzTkGu:WorkLike#created_at, YvT2lTG9SMxvmrmmzTkGu:WorkLike#user_id, YvT2lTG9SMxvmrmmzTkGu:WorkLike#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| created_at | created_at | Time when the like record was created. |
| user_id | user_id | Identifier of the profile that liked the work. |
| work_id | work_id | Identifier of the liked work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| user_id | Profile | manyToOne |  |  | user_id | id |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

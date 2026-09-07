---
id: "item:y84UxY8UbOndI5yk8-ADL"
name: "ReadingProgres"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
parentDocumentId: "doc:i8nz5cyThMV-9swf3Coac"
stableKey: "entity-readingprogres"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:ReadingProgres","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id"]
table_name: "reading_progress"
column_names: "chapter_id, updated_at, user_id, work_id"
---
# ReadingProgres

Continuation state linking a reader profile to the latest tracked work and chapter.

- Table: reading_progress
- Model links: YvT2lTG9SMxvmrmmzTkGu:ReadingProgres, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| chapter_id | chapter_id | Identifier of the chapter most recently tracked in the reading progress record. |
| updated_at | updated_at | Timestamp for the latest reading progress update. |
| user_id | user_id | Identifier of the reader profile tied to the reading progress record. |
| work_id | work_id | Identifier of the work associated with the reading progress record. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapter_id | Chapter | manyToOne |  |  | chapter_id | id |
| user_id | Profile | manyToOne |  |  | user_id | id |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

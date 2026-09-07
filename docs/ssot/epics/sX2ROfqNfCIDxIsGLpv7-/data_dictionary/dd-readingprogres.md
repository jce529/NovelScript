---
id: "item:9q6QRuqjUgcdhy6-Ch4bH"
name: "ReadingProgres"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-readingprogres"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:ReadingProgres","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id"]
table_name: "reading_progress"
column_names: "chapter_id, updated_at, user_id, work_id"
---
# ReadingProgres

Stores a reader’s progress link between profile, work, and chapter.

- Table: reading_progress
- Model links: YvT2lTG9SMxvmrmmzTkGu:ReadingProgres, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| chapter_id | chapter_id | Identifier of the most relevant chapter linked to this reading progress record. |
| updated_at | updated_at | Timestamp when the reading progress record was last updated. |
| user_id | user_id | Identifier of the profile associated with the reading progress record. |
| work_id | work_id | Identifier of the work associated with the reading progress record. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapter_id | Chapter | manyToOne | primary | Each reading progress record points to one chapter. | chapter_id | id |
| user_id | Profile | manyToOne | primary | Each reading progress record belongs to one profile. | user_id | id |
| work_id | Work | manyToOne | reference | Each reading progress record belongs to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

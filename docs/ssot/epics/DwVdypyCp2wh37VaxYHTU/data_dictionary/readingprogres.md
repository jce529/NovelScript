---
id: "item:V3iCWJIqJQuF9cTkarnar"
name: "ReadingProgres"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
parentDocumentId: "doc:KYT3fh2YL-FePA2rTk-8n"
stableKey: "readingprogres"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:ReadingProgres","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id"]
table_name: "reading_progress"
column_names: "chapter_id, updated_at, user_id, work_id"
---
# ReadingProgres

Tracks the chapter a reader most recently opened within a work.

- Table: reading_progress
- Model links: YvT2lTG9SMxvmrmmzTkGu:ReadingProgres, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id, YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| chapter_id | chapter_id | Identifies the chapter that the reader most recently opened for progress tracking. |
| updated_at | updated_at | Timestamp for the latest progress update. |
| user_id | user_id | Identifies the reader whose progress is stored. |
| work_id | work_id | Identifies the work being read. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapter_id | Chapter | manyToOne | primary | Each progress record points to one chapter. | chapter_id | id |
| user_id | Profile | manyToOne | reference | Each progress record belongs to one reader profile. | user_id | id |
| work_id | Work | manyToOne | reference | Each progress record is scoped to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

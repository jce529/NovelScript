---
id: "item:lhtYxZtHTjqWoTbq8Vzrx"
name: "Report"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-report"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Report","YvT2lTG9SMxvmrmmzTkGu:Report#chapter_id","YvT2lTG9SMxvmrmmzTkGu:Report#created_at","YvT2lTG9SMxvmrmmzTkGu:Report#detail","YvT2lTG9SMxvmrmmzTkGu:Report#id","YvT2lTG9SMxvmrmmzTkGu:Report#reason_category"]
modelLinksOmitted: 6
table_name: "reports"
column_names: "chapter_id, created_at, detail, id, reason_category, reporter_id, resolution_note, resolved_at, resolved_by, status, work_id"
---
# Report

Stores reader-submitted report records tied to a work and optionally a chapter.

- Table: reports
- Model links: YvT2lTG9SMxvmrmmzTkGu:Report, YvT2lTG9SMxvmrmmzTkGu:Report#chapter_id, YvT2lTG9SMxvmrmmzTkGu:Report#created_at, YvT2lTG9SMxvmrmmzTkGu:Report#detail, YvT2lTG9SMxvmrmmzTkGu:Report#id, YvT2lTG9SMxvmrmmzTkGu:Report#reason_category, YvT2lTG9SMxvmrmmzTkGu:Report#reporter_id, YvT2lTG9SMxvmrmmzTkGu:Report#resolution_note, YvT2lTG9SMxvmrmmzTkGu:Report#resolved_at, YvT2lTG9SMxvmrmmzTkGu:Report#resolved_by, YvT2lTG9SMxvmrmmzTkGu:Report#status, YvT2lTG9SMxvmrmmzTkGu:Report#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| chapter_id | chapter_id | Identifies the reported chapter when the report is tied to a specific chapter. |
| created_at | created_at | Stores when the report was created. |
| detail | detail | Stores optional free-text detail entered with the report. |
| id | id | Unique identifier for the report record. |
| reason_category | reason_category | Stores the selected report reason category. |
| reporter_id | reporter_id | Identifies the person who submitted the report. |
| resolution_note | resolution_note | Stores optional notes recorded when resolving the report. |
| resolved_at | resolved_at | Stores when the report was resolved. |
| resolved_by | resolved_by | Identifies the person who resolved the report. |
| status | status | Tracks the current processing state of the report. |
| work_id | work_id | Identifies the reported work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapter_id | Chapter | manyToOne | reference | A report can point to one chapter when the issue is chapter-specific. | chapter_id | id |
| reporter_id | Profile | manyToOne | reference | Each report is submitted by one profile. | reporter_id | id |
| resolved_by | Profile | manyToOne | reference | A resolved report can reference the profile that handled the resolution. | resolved_by | id |
| work_id | Work | manyToOne | primary | Each report belongs to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

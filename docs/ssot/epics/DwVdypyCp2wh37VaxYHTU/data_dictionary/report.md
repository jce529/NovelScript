---
id: "item:Cg1vbQIrl4gu_8-S48o7E"
name: "Report"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
parentDocumentId: "doc:KYT3fh2YL-FePA2rTk-8n"
stableKey: "report"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Report","YvT2lTG9SMxvmrmmzTkGu:Report#chapter_id","YvT2lTG9SMxvmrmmzTkGu:Report#created_at","YvT2lTG9SMxvmrmmzTkGu:Report#detail","YvT2lTG9SMxvmrmmzTkGu:Report#id","YvT2lTG9SMxvmrmmzTkGu:Report#reason_category"]
modelLinksOmitted: 6
table_name: "reports"
column_names: "chapter_id, created_at, detail, id, reason_category, reporter_id, resolution_note, resolved_at, resolved_by, status, work_id"
---
# Report

Stores a reader-submitted report for a work or chapter, including reason, status, and resolution details.

- Table: reports
- Model links: YvT2lTG9SMxvmrmmzTkGu:Report, YvT2lTG9SMxvmrmmzTkGu:Report#chapter_id, YvT2lTG9SMxvmrmmzTkGu:Report#created_at, YvT2lTG9SMxvmrmmzTkGu:Report#detail, YvT2lTG9SMxvmrmmzTkGu:Report#id, YvT2lTG9SMxvmrmmzTkGu:Report#reason_category, YvT2lTG9SMxvmrmmzTkGu:Report#reporter_id, YvT2lTG9SMxvmrmmzTkGu:Report#resolution_note, YvT2lTG9SMxvmrmmzTkGu:Report#resolved_at, YvT2lTG9SMxvmrmmzTkGu:Report#resolved_by, YvT2lTG9SMxvmrmmzTkGu:Report#status, YvT2lTG9SMxvmrmmzTkGu:Report#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| chapter_id | chapter_id | Identifies the chapter referenced by the report when the report is tied to a specific chapter. |
| created_at | created_at | Timestamp for when the report was created. |
| detail | detail | Optional reader-provided report details. |
| id | id | Unique report identifier. |
| reason_category | reason_category | Stores the selected report reason category. |
| reporter_id | reporter_id | Identifies the reader who submitted the report. |
| resolution_note | resolution_note | Optional note recorded when the report is resolved. |
| resolved_at | resolved_at | Timestamp for when the report was resolved. |
| resolved_by | resolved_by | Identifies the profile that resolved the report. |
| status | status | Current handling state of the report. |
| work_id | work_id | Identifies the work referenced by the report. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| chapter_id | Chapter | manyToOne | primary | A report can point to one chapter when the issue is chapter-specific. | chapter_id | id |
| reporter_id | Profile | manyToOne | reference | Each report is submitted by one reader profile. | reporter_id | id |
| resolved_by | Profile | manyToOne | reference | A resolved report can reference the profile that handled it. | resolved_by | id |
| work_id | Work | manyToOne | reference | Each report is attached to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

---
id: "item:Ykns5vd-YwCb0mTAhe_GX"
name: "Chapter"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "BSRh96OQqVVy-mCmDspWk"
parentDocumentId: "doc:EU4zddMQ1vOGAZVGYHtGS"
stableKey: "chapter"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"]
modelLinksOmitted: 7
table_name: "chapters"
column_names: "content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"
---
# Chapter

A chapter belongs to a work and stores ordering, publication state, and chapter body content used by chapter creation and chapter list views.

- Table: chapters
- Model links: YvT2lTG9SMxvmrmmzTkGu:Chapter, YvT2lTG9SMxvmrmmzTkGu:Chapter#content, YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#id, YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published, YvT2lTG9SMxvmrmmzTkGu:Chapter#order_index, YvT2lTG9SMxvmrmmzTkGu:Chapter#price_tier, YvT2lTG9SMxvmrmmzTkGu:Chapter#published_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#title, YvT2lTG9SMxvmrmmzTkGu:Chapter#unpublished_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#updated_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45, doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| content | content | Stored chapter body content. |
| created_at | created_at | Timestamp for when the chapter record was created. |
| deleted_at | deleted_at | Soft-delete timestamp. Chapter listing excludes rows where this value is not null. |
| id | id | Unique identifier for a chapter record. |
| is_published | is_published | Whether the chapter is published. The chapter list shows an unpublished badge when this value is false. |
| order_index | order_index | Sort position within a work. Chapter lists are ordered ascending by this value, and new chapter creation uses the next value after the current maximum for the work. |
| price_tier | price_tier | Optional token price shown for published chapters; when absent, the chapter list shows the chapter as free. |
| published_at | published_at | Timestamp for when the chapter became published. |
| title | title | User-entered chapter title. The new chapter form requires a non-blank value after trimming. |
| unpublished_at | unpublished_at | Timestamp for when the chapter became unpublished. |
| updated_at | updated_at | Timestamp for when the chapter record was last updated. |
| work_id | work_id | Identifier of the work that owns the chapter. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| readingProgreses | ReadingProgres | oneToMany |  |  |  |  |
| reports | Report | oneToMany |  |  |  |  |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

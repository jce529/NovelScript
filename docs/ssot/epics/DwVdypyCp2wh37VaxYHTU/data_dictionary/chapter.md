---
id: "item:ESw_LW9RkjDJKjNqAWiyT"
name: "Chapter"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
parentDocumentId: "doc:KYT3fh2YL-FePA2rTk-8n"
stableKey: "chapter"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"]
modelLinksOmitted: 7
table_name: "chapters"
column_names: "content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"
---
# Chapter

Stores the chapter a reader opens, including its title, body, order, publication state, and pricing tier.

- Table: chapters
- Model links: YvT2lTG9SMxvmrmmzTkGu:Chapter, YvT2lTG9SMxvmrmmzTkGu:Chapter#content, YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#id, YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published, YvT2lTG9SMxvmrmmzTkGu:Chapter#order_index, YvT2lTG9SMxvmrmmzTkGu:Chapter#price_tier, YvT2lTG9SMxvmrmmzTkGu:Chapter#published_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#title, YvT2lTG9SMxvmrmmzTkGu:Chapter#unpublished_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#updated_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| content | content | Full chapter body shown when the chapter is available to read. |
| created_at | created_at | Timestamp for when the chapter record was created. |
| deleted_at | deleted_at | Timestamp used when the chapter record is soft deleted. |
| id | id | Unique chapter identifier. |
| is_published | is_published | Publication state field used in backend chapter records. |
| order_index | order_index | Display order used to sort chapter rows in the table of contents. |
| price_tier | price_tier | Pricing tier field for the chapter record. |
| published_at | published_at | Timestamp for when the chapter became published. |
| title | title | Reader-facing chapter title shown in the header and table of contents. |
| unpublished_at | unpublished_at | Timestamp for when the chapter became unpublished. |
| updated_at | updated_at | Timestamp for the latest chapter record update. |
| work_id | work_id | Identifies the work that owns the chapter. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| readingProgreses | ReadingProgres | oneToMany | primary | A chapter can have many reader progress records tied to it. |  |  |
| reports | Report | oneToMany | primary | A chapter can have many reader reports associated with it. |  |  |
| work_id | Work | manyToOne | reference | Each chapter belongs to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

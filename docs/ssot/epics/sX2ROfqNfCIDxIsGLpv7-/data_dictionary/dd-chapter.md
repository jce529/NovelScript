---
id: "item:H7-hrtDseWgQRf-xL8qUd"
name: "Chapter"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
parentDocumentId: "doc:PHFPilcIyeRFlYeJ6GmPw"
stableKey: "dd-chapter"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"]
modelLinksOmitted: 7
table_name: "chapters"
column_names: "content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"
---
# Chapter

Stores chapter records for a work, including publication state, ordering, content, and related reader progress links.

- Table: chapters
- Model links: YvT2lTG9SMxvmrmmzTkGu:Chapter, YvT2lTG9SMxvmrmmzTkGu:Chapter#content, YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#id, YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published, YvT2lTG9SMxvmrmmzTkGu:Chapter#order_index, YvT2lTG9SMxvmrmmzTkGu:Chapter#price_tier, YvT2lTG9SMxvmrmmzTkGu:Chapter#published_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#title, YvT2lTG9SMxvmrmmzTkGu:Chapter#unpublished_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#updated_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| content | content | Main written content stored for the chapter. |
| created_at | created_at | Timestamp when the chapter record was created. |
| deleted_at | deleted_at | Timestamp used for soft deletion when the chapter record has been removed from active use. |
| id | id | Unique identifier for the chapter record. |
| is_published | is_published | Whether the chapter is marked as published. |
| order_index | order_index | Sequence position used to order chapters within a work. |
| price_tier | price_tier | Optional pricing tier associated with the chapter. |
| published_at | published_at | Timestamp when the chapter was published, if publication has occurred. |
| title | title | Reader-facing title of the chapter. |
| unpublished_at | unpublished_at | Timestamp when the chapter was unpublished, if that state was applied. |
| updated_at | updated_at | Timestamp when the chapter record was last updated. |
| work_id | work_id | Identifier of the work that owns the chapter. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| readingProgreses | ReadingProgres | oneToMany | primary | A chapter can have multiple reader progress records tied to it. |  |  |
| reports | Report | oneToMany | out_of_scope | A chapter can be connected to multiple report records. |  |  |
| work_id | Work | manyToOne | reference | Each chapter belongs to one work. | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

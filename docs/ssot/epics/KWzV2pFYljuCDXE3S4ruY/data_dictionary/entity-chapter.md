---
id: "item:TSKg1FmoV5a-wBCoQkFn-"
name: "Chapter"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
parentDocumentId: "doc:cRQ5MnQcBsOiDxUynCU6j"
stableKey: "entity:chapter"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"]
modelLinksOmitted: 7
table_name: "chapters"
column_names: "content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"
---
# Chapter

Primary chapter record that stores chapter text, ordering, and publishing state for the editing and publishing flow.

- Table: chapters
- Model links: YvT2lTG9SMxvmrmmzTkGu:Chapter, YvT2lTG9SMxvmrmmzTkGu:Chapter#content, YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#id, YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published, YvT2lTG9SMxvmrmmzTkGu:Chapter#order_index, YvT2lTG9SMxvmrmmzTkGu:Chapter#price_tier, YvT2lTG9SMxvmrmmzTkGu:Chapter#published_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#title, YvT2lTG9SMxvmrmmzTkGu:Chapter#unpublished_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#updated_at, YvT2lTG9SMxvmrmmzTkGu:Chapter#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| content | content | Main chapter text that the editor loads and saves. |
| created_at | created_at | Time when the chapter record was created. |
| deleted_at | deleted_at | Time when the chapter was soft deleted, when present. |
| id | id | Unique identifier for the chapter record. |
| is_published | is_published | Whether the chapter is currently published. |
| order_index | order_index | Sequence value that places the chapter within its work. |
| price_tier | price_tier | Optional paid tier value used when the chapter is sold instead of free. |
| published_at | published_at | Time when the chapter became published, when present. |
| title | title | Writer-facing chapter title. |
| unpublished_at | unpublished_at | Time when the chapter was unpublished, when present. |
| updated_at | updated_at | Time when the chapter record was last updated. |
| work_id | work_id | Identifier for the work that owns this chapter. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| readingProgreses | ReadingProgres | oneToMany |  |  |  |  |
| reports | Report | oneToMany |  |  |  |  |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

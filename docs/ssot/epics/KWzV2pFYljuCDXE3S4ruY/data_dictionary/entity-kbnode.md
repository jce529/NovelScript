---
id: "item:AF_zTMmil3R3MJETnxzKf"
name: "Knowledge Base Node"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
parentDocumentId: "doc:cRQ5MnQcBsOiDxUynCU6j"
stableKey: "entity:kbnode"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"]
modelLinksOmitted: 10
table_name: "kb_nodes"
column_names: "ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"
---
# Knowledge Base Node

Knowledge base node record linked to a work and organized in a hierarchy that can support the editing workspace.

- Table: kb_nodes
- Model links: YvT2lTG9SMxvmrmmzTkGu:KbNode, YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids, YvT2lTG9SMxvmrmmzTkGu:KbNode#category, YvT2lTG9SMxvmrmmzTkGu:KbNode#content, YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#depth, YvT2lTG9SMxvmrmmzTkGu:KbNode#id, YvT2lTG9SMxvmrmmzTkGu:KbNode#is_locked, YvT2lTG9SMxvmrmmzTkGu:KbNode#name, YvT2lTG9SMxvmrmmzTkGu:KbNode#node_type, YvT2lTG9SMxvmrmmzTkGu:KbNode#owner_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#parent_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#scope, YvT2lTG9SMxvmrmmzTkGu:KbNode#updated_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| ancestor_ids | ancestor_ids | Stored ancestry path for hierarchical placement. |
| category | category | Category label used to organize the node. |
| content | content | Optional body content stored for the node. |
| created_at | created_at | Time when the node was created. |
| deleted_at | deleted_at | Time when the node was soft deleted, when present. |
| depth | depth | Hierarchy depth of the node. |
| id | id | Unique identifier for the knowledge base node. |
| is_locked | is_locked | Whether the node is locked against editing. |
| name | name | Display name of the node. |
| node_type | node_type | Type value describing the kind of knowledge base node. |
| owner_id | owner_id | Identifier for the owner of the node. |
| parent_id | parent_id | Optional identifier for the parent node in the hierarchy. |
| scope | scope | Grouping value that indicates what area the node belongs to. |
| updated_at | updated_at | Time when the node was last updated. |
| work_id | work_id | Optional identifier for the work linked to the node. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| parent_id | KbNode | manyToOne |  |  | parent_id | id |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

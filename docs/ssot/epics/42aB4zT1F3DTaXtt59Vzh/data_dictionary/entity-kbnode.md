---
id: "item:HTJtmHZ-xI8cUobN-5Ddw"
name: "KbNode"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "42aB4zT1F3DTaXtt59Vzh"
parentDocumentId: "doc:NGzVBIRW8gOcaqIo6wbs1"
stableKey: "entity:KbNode"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"]
modelLinksOmitted: 10
table_name: "kb_nodes"
column_names: "ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"
---
# KbNode

Model-backed knowledge/work node data touched by the new work creation flow through kb_nodes table access.

- Table: kb_nodes
- Model links: YvT2lTG9SMxvmrmmzTkGu:KbNode, YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids, YvT2lTG9SMxvmrmmzTkGu:KbNode#category, YvT2lTG9SMxvmrmmzTkGu:KbNode#content, YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#depth, YvT2lTG9SMxvmrmmzTkGu:KbNode#id, YvT2lTG9SMxvmrmmzTkGu:KbNode#is_locked, YvT2lTG9SMxvmrmmzTkGu:KbNode#name, YvT2lTG9SMxvmrmmzTkGu:KbNode#node_type, YvT2lTG9SMxvmrmmzTkGu:KbNode#owner_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#parent_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#scope, YvT2lTG9SMxvmrmmzTkGu:KbNode#updated_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| ancestor_ids | ancestor_ids | Stored ancestor path information for the node hierarchy. |
| category | category | Category value assigned to the node. |
| content | content | Text content stored on the node when present. |
| created_at | created_at | Timestamp when the node record was created. |
| deleted_at | deleted_at | Timestamp when the node record was soft deleted, when present. |
| depth | depth | Hierarchy depth value of the node. |
| id | id | Unique identifier for the node record. |
| is_locked | is_locked | Flag indicating whether the node is locked. |
| name | name | Human-readable name of the node. |
| node_type | node_type | Type value that categorizes the node. |
| owner_id | owner_id | Identifier of the owning user profile for the node record. |
| parent_id | parent_id | Identifier of the parent node when this node is part of a hierarchy. |
| scope | scope | Scope value that classifies where the node belongs. |
| updated_at | updated_at | Timestamp when the node record was last updated. |
| work_id | work_id | Identifier of the related work when the node is attached to a work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| parent_id | KbNode | manyToOne |  |  | parent_id | id |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

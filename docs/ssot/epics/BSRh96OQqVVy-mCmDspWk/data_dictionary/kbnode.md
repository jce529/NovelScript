---
id: "item:CvOyvTh7I8DoCHRpffJBV"
name: "KbNode"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "BSRh96OQqVVy-mCmDspWk"
parentDocumentId: "doc:EU4zddMQ1vOGAZVGYHtGS"
stableKey: "kbnode"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"]
modelLinksOmitted: 10
table_name: "kb_nodes"
column_names: "ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"
---
# KbNode

A knowledge-base node linked to a work and owner. In this epic it appears only as supporting data checked during chapter creation validation.

- Table: kb_nodes
- Model links: YvT2lTG9SMxvmrmmzTkGu:KbNode, YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids, YvT2lTG9SMxvmrmmzTkGu:KbNode#category, YvT2lTG9SMxvmrmmzTkGu:KbNode#content, YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#depth, YvT2lTG9SMxvmrmmzTkGu:KbNode#id, YvT2lTG9SMxvmrmmzTkGu:KbNode#is_locked, YvT2lTG9SMxvmrmmzTkGu:KbNode#name, YvT2lTG9SMxvmrmmzTkGu:KbNode#node_type, YvT2lTG9SMxvmrmmzTkGu:KbNode#owner_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#parent_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#scope, YvT2lTG9SMxvmrmmzTkGu:KbNode#updated_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| ancestor_ids | ancestor_ids | Stored ancestor path value for hierarchy tracking. |
| category | category | Stored category value for the node. |
| content | content | Optional stored content for the node. |
| created_at | created_at | Timestamp for when the node record was created. |
| deleted_at | deleted_at | Soft-delete timestamp for the node. |
| depth | depth | Stored hierarchy depth for the node. |
| id | id | Unique identifier for a knowledge-base node record. |
| is_locked | is_locked | Whether the node is locked. |
| name | name | Display name of the node. |
| node_type | node_type | Stored node type value. |
| owner_id | owner_id | Identifier of the user who owns the node. |
| parent_id | parent_id | Optional identifier of the parent node. |
| scope | scope | Stored scope value for the node. |
| updated_at | updated_at | Timestamp for when the node record was last updated. |
| work_id | work_id | Optional identifier of the related work. Chapter creation validation requires an optional folder to belong to the same work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| parent_id | KbNode | manyToOne |  |  | parent_id | id |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

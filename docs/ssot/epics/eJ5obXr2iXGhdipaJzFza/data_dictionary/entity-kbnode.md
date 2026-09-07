---
id: "item:SySQknZIXnDM4pL-Xu0w7"
name: "Knowledge Base Node"
type: "data_dictionary_entity"
scope: "epic"
scopeId: "eJ5obXr2iXGhdipaJzFza"
parentDocumentId: "doc:G1np58CyP5KvqsvKtTVt4"
stableKey: "entity-kbnode"
status: "active"
docLinks: ["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d"]
modelLinks: ["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"]
modelLinksOmitted: 10
table_name: "kb_nodes"
column_names: "ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"
---
# Knowledge Base Node

Model-backed record for reusable story knowledge content, including hierarchy, ownership, and editable text content.

- Table: kb_nodes
- Model links: YvT2lTG9SMxvmrmmzTkGu:KbNode, YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids, YvT2lTG9SMxvmrmmzTkGu:KbNode#category, YvT2lTG9SMxvmrmmzTkGu:KbNode#content, YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#depth, YvT2lTG9SMxvmrmmzTkGu:KbNode#id, YvT2lTG9SMxvmrmmzTkGu:KbNode#is_locked, YvT2lTG9SMxvmrmmzTkGu:KbNode#name, YvT2lTG9SMxvmrmmzTkGu:KbNode#node_type, YvT2lTG9SMxvmrmmzTkGu:KbNode#owner_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#parent_id, YvT2lTG9SMxvmrmmzTkGu:KbNode#scope, YvT2lTG9SMxvmrmmzTkGu:KbNode#updated_at, YvT2lTG9SMxvmrmmzTkGu:KbNode#work_id
- Source docs: doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d

## Fields

| Field | Column | Meaning |
| --- | --- | --- |
| ancestor_ids | ancestor_ids | Stored ancestry path value for the node hierarchy. |
| category | category | Stored category label used to classify the node. |
| content | content | Editable text content shown in the knowledge base node editor and saved from the textarea. |
| created_at | created_at | Timestamp when the node record was created. |
| deleted_at | deleted_at | Timestamp used when the node record is soft-deleted, when present. |
| depth | depth | Stored hierarchy depth of the node. |
| id | id | Unique identifier for the knowledge base node record. |
| is_locked | is_locked | Flag indicating whether the node is locked. |
| name | name | Human-readable name of the knowledge base node. |
| node_type | node_type | Stored type label for the knowledge base node. |
| owner_id | owner_id | Identifier of the owner account that scopes access to the node. |
| parent_id | parent_id | Identifier of the parent knowledge base node when this record is nested under another node. |
| scope | scope | Stored scope label for where this node applies. |
| updated_at | updated_at | Timestamp when the node record was last updated. |
| work_id | work_id | Identifier of the related work when the node is attached to a specific work. |

## Relationships

| Relation | Target | Type | Role | Meaning | FK fields | References |
| --- | --- | --- | --- | --- | --- | --- |
| kbNodes | KbNode | oneToMany |  |  |  |  |
| owner_id | Profile | manyToOne |  |  | owner_id | id |
| parent_id | KbNode | manyToOne |  |  | parent_id | id |
| work_id | Work | manyToOne |  |  | work_id | id |

_Parent data dictionary: ../data_dictionary.md_

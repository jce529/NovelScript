---
id: "doc:G1np58CyP5KvqsvKtTVt4"
name: "Story Knowledge Management Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "eJ5obXr2iXGhdipaJzFza"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity-kbnode","title":"Knowledge Base Node","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:059847e49639d22d"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"],"modelLinksOmitted":10,"table_name":"kb_nodes","column_names":"ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"}]
relatedDocs: []
serviceMapNodes: []
---
# Story Knowledge Management Data Dictionary

Data dictionary draft for the model-backed knowledge-base node entity used by the Story Knowledge Management epic.

## Evidence Gaps

- The provided evidence confirms the KbNode model and its editor usage, but it does not define the allowed values or business taxonomy for scope, node_type, category, ancestor_ids, or is_locked.
- The provided context references related Profile and Work entities through foreign keys, but it does not include their own model definitions or field-level evidence in this task bundle.
- The one-to-many child-node relation is evidenced, but the reverse relation name does not include additional business constraints such as ordering, cascade behavior, or deletion rules.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Knowledge Base Node | kb_nodes | Model-backed record for reusable story knowledge content, including hierarchy, ownership, and editable text content. | data_dictionary/entity-kbnode.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

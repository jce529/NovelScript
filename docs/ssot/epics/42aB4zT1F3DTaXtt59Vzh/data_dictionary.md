---
id: "doc:NGzVBIRW8gOcaqIo6wbs1"
name: "Data Dictionary Draft: New Work Creation"
type: "data_dictionary"
scope: "epic"
scopeId: "42aB4zT1F3DTaXtt59Vzh"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity:KbNode","title":"KbNode","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:fda44a274c9d7b9b"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"],"modelLinksOmitted":10,"table_name":"kb_nodes","column_names":"ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"}]
relatedDocs: []
serviceMapNodes: []
---
# Data Dictionary Draft: New Work Creation

This draft captures the model-backed data entity evidenced for the New Work Creation epic and highlights where the create-work screen uses or touches that entity.

## Evidence Gaps

- The provided evidence confirms that /studio/works/new selects from and inserts into kb_nodes, but it does not confirm which specific form values map to which KbNode fields at write time.
- The provided evidence does not confirm whether create_work writes any additional models besides KbNode, because create_work is referenced as an unknown implementation.
- The provided evidence does not confirm how KbNode records are structured for the newly created work beyond the model fields and observed table operations.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| KbNode | kb_nodes | Model-backed knowledge/work node data touched by the new work creation flow through kb_nodes table access. | data_dictionary/entity-kbnode.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

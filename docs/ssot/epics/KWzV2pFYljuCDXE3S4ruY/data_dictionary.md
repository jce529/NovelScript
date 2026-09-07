---
id: "doc:cRQ5MnQcBsOiDxUynCU6j"
name: "Data Dictionary Draft for Chapter Editing and Publishing"
type: "data_dictionary"
scope: "epic"
scopeId: "KWzV2pFYljuCDXE3S4ruY"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity:chapter","title":"Chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"],"modelLinksOmitted":7,"table_name":"chapters","column_names":"content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"},{"stableKey":"entity:kbnode","title":"Knowledge Base Node","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"],"modelLinksOmitted":10,"table_name":"kb_nodes","column_names":"ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"},{"stableKey":"entity:wallet","title":"Wallet","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"],"table_name":"wallets","column_names":"balance, id, updated_at"},{"stableKey":"entity:work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:4835eab26aa2d783"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Data Dictionary Draft for Chapter Editing and Publishing

Canonical data dictionary draft for the Chapter Editing and Publishing epic, combining the provided upstream data dictionary chunks with model-backed storage evidence.

## Evidence Gaps

- The provided evidence does not confirm the allowed value sets or business meanings for Chapter.price_tier beyond it being an optional tier value.
- The provided evidence does not confirm the allowed value sets for KbNode.scope, KbNode.node_type, or KbNode.category.
- The provided evidence does not show how Wallet is used inside the chapter editing workspace, so its role in this epic remains only a referenced data dependency.
- The provided evidence does not confirm whether Work fields other than linked chapter and knowledge-base relationships are edited in this epic.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Chapter | chapters | Primary chapter record that stores chapter text, ordering, and publishing state for the editing and publishing flow. | data_dictionary/entity-chapter.md |
| Knowledge Base Node | kb_nodes | Knowledge base node record linked to a work and organized in a hierarchy that can support the editing workspace. | data_dictionary/entity-kbnode.md |
| Wallet | wallets | Referenced wallet record that exposes a balance and profile link, but whose chapter-editor behavior is not confirmed by the provided evidence. | data_dictionary/entity-wallet.md |
| Work | works | Work record that groups chapters and related knowledge-base content for the editing and publishing flow. | data_dictionary/entity-work.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

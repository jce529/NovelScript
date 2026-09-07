---
id: "doc:EU4zddMQ1vOGAZVGYHtGS"
name: "Data Dictionary: Chapter Planning and Structure"
type: "data_dictionary"
scope: "epic"
scopeId: "BSRh96OQqVVy-mCmDspWk"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"chapter","title":"Chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"],"modelLinksOmitted":7,"table_name":"chapters","column_names":"content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"},{"stableKey":"kbnode","title":"KbNode","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:KbNode","YvT2lTG9SMxvmrmmzTkGu:KbNode#ancestor_ids","YvT2lTG9SMxvmrmmzTkGu:KbNode#category","YvT2lTG9SMxvmrmmzTkGu:KbNode#content","YvT2lTG9SMxvmrmmzTkGu:KbNode#created_at","YvT2lTG9SMxvmrmmzTkGu:KbNode#deleted_at"],"modelLinksOmitted":10,"table_name":"kb_nodes","column_names":"ancestor_ids, category, content, created_at, deleted_at, depth, id, is_locked, name, node_type, owner_id, parent_id, scope, updated_at, work_id"},{"stableKey":"work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:c4cf1d172cd19b45","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:d1ef4c00a83488d3"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Data Dictionary: Chapter Planning and Structure

Model-backed data entities observed for chapter creation, chapter listing, and supporting work context in this epic.

## Evidence Gaps

- The exact business use of KbNode in this epic is not fully confirmed; the source only shows that kb_nodes are read during chapter creation validation.
- The implementation details and persisted shape of reorder_chapters are not confirmed; the source only marks an unknown reorder_chapters relation term for the chapter list screen.
- Profile, ReadingProgres, Report, WorkBookmark, WorkLike, and WorkSubscription relationships are model-evidenced but their behavior within this epic is not confirmed by the provided source documents.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Chapter | chapters | A chapter belongs to a work and stores ordering, publication state, and chapter body content used by chapter creation and chapter list views. | data_dictionary/chapter.md |
| KbNode | kb_nodes | A knowledge-base node linked to a work and owner. In this epic it appears only as supporting data checked during chapter creation validation. | data_dictionary/kbnode.md |
| Work | works | A work is the parent record for chapter creation and chapter listing, and ownership of the work is part of source-backed validation. | data_dictionary/work.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

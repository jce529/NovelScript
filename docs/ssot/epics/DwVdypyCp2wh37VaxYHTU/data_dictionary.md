---
id: "doc:KYT3fh2YL-FePA2rTk-8n"
name: "Chapter Reading Experience Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "DwVdypyCp2wh37VaxYHTU"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"chapter","title":"Chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"],"modelLinksOmitted":7,"table_name":"chapters","column_names":"content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"},{"stableKey":"readingprogres","title":"Reading Progress","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:ReadingProgres","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id"],"table_name":"reading_progress","column_names":"chapter_id, updated_at, user_id, work_id"},{"stableKey":"report","title":"Report","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Report","YvT2lTG9SMxvmrmmzTkGu:Report#chapter_id","YvT2lTG9SMxvmrmmzTkGu:Report#created_at","YvT2lTG9SMxvmrmmzTkGu:Report#detail","YvT2lTG9SMxvmrmmzTkGu:Report#id","YvT2lTG9SMxvmrmmzTkGu:Report#reason_category"],"modelLinksOmitted":6,"table_name":"reports","column_names":"chapter_id, created_at, detail, id, reason_category, reporter_id, resolution_note, resolved_at, resolved_by, status, work_id"},{"stableKey":"work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:b105058b84a85955"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Chapter Reading Experience Data Dictionary

Canonical data dictionary for the chapter reading experience, covering the chapter record, reader progress tracking, reader reports, and the parent work record used by chapter navigation and access flows.

## Evidence Gaps

- The provided context does not include model details for related entities such as Profile, KbNode, WorkBookmark, WorkLike, and WorkSubscription, so those relationships can only be recorded as references from the confirmed models.
- The provided context is a merged model and upstream dictionary view, so screen-specific behavior for when report records or progress updates are created is not fully confirmed here.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Chapter | chapters | Stores the chapter a reader opens, including its title, body, order, publication state, and pricing tier. | data_dictionary/chapter.md |
| ReadingProgres | reading_progress | Tracks the chapter a reader most recently opened within a work. | data_dictionary/readingprogres.md |
| Report | reports | Stores a reader-submitted report for a work or chapter, including reason, status, and resolution details. | data_dictionary/report.md |
| Work | works | Stores the parent work that supplies the title, summary, cover image, and chapter grouping for the reading experience. | data_dictionary/work.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

---
id: "doc:PHFPilcIyeRFlYeJ6GmPw"
name: "Work Detail and Engagement Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "sX2ROfqNfCIDxIsGLpv7-"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"dd-chapter","title":"Chapter","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Chapter","YvT2lTG9SMxvmrmmzTkGu:Chapter#content","YvT2lTG9SMxvmrmmzTkGu:Chapter#created_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Chapter#id","YvT2lTG9SMxvmrmmzTkGu:Chapter#is_published"],"modelLinksOmitted":7,"table_name":"chapters","column_names":"content, created_at, deleted_at, id, is_published, order_index, price_tier, published_at, title, unpublished_at, updated_at, work_id"},{"stableKey":"dd-profile","title":"Profile","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"],"modelLinksOmitted":3,"table_name":"profiles","column_names":"created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"},{"stableKey":"dd-readingprogres","title":"ReadingProgres","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:ReadingProgres","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id"],"table_name":"reading_progress","column_names":"chapter_id, updated_at, user_id, work_id"},{"stableKey":"dd-report","title":"Report","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Report","YvT2lTG9SMxvmrmmzTkGu:Report#chapter_id","YvT2lTG9SMxvmrmmzTkGu:Report#created_at","YvT2lTG9SMxvmrmmzTkGu:Report#detail","YvT2lTG9SMxvmrmmzTkGu:Report#id","YvT2lTG9SMxvmrmmzTkGu:Report#reason_category"],"modelLinksOmitted":6,"table_name":"reports","column_names":"chapter_id, created_at, detail, id, reason_category, reporter_id, resolution_note, resolved_at, resolved_by, status, work_id"},{"stableKey":"dd-wallet","title":"Wallet","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"],"table_name":"wallets","column_names":"balance, id, updated_at"},{"stableKey":"dd-work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"},{"stableKey":"dd-workbookmark","title":"WorkBookmark","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:WorkBookmark","YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkBookmark#work_id"],"table_name":"work_bookmarks","column_names":"created_at, user_id, work_id"},{"stableKey":"dd-worklike","title":"WorkLike","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:WorkLike","YvT2lTG9SMxvmrmmzTkGu:WorkLike#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkLike#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkLike#work_id"],"table_name":"work_likes","column_names":"created_at, user_id, work_id"},{"stableKey":"dd-worksubscription","title":"WorkSubscription","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:a22b016c31220d75"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:WorkSubscription","YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkSubscription#work_id"],"table_name":"work_subscriptions","column_names":"created_at, user_id, work_id"}]
relatedDocs: []
serviceMapNodes: []
---
# Work Detail and Engagement Data Dictionary

Canonical data dictionary for work detail, chapter reading progress, and engagement records supported by the provided model evidence and upstream data dictionary chunks.

## Evidence Gaps

- The provided context references related entities User, KbNode, and LedgerEntry, but no model definitions for those entities were included here.
- The provided context does not confirm whether Wallet is actively used in this epic beyond being a referenced related record.
- The provided context does not confirm implementation details for how Report status values, reason_category values, or resolution flows are constrained.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Chapter | chapters | Stores chapter records for a work, including publication state, ordering, content, and related reader progress links. | data_dictionary/dd-chapter.md |
| Profile | profiles | Stores the reader or author profile identity used across work ownership, reading progress, and engagement relationships. | data_dictionary/dd-profile.md |
| ReadingProgres | reading_progress | Stores a reader’s progress link between profile, work, and chapter. | data_dictionary/dd-readingprogres.md |
| Report | reports | Stores reader-submitted report records tied to a work and optionally a chapter. | data_dictionary/dd-report.md |
| Wallet | wallets | Stores wallet balance data linked by identifier to a profile. | data_dictionary/dd-wallet.md |
| Work | works | Stores the main work record shown on the detail screen, including ownership, presentation fields, and engagement links. | data_dictionary/dd-work.md |
| WorkBookmark | work_bookmarks | Stores reader bookmark records for works. | data_dictionary/dd-workbookmark.md |
| WorkLike | work_likes | Stores reader like records for works. | data_dictionary/dd-worklike.md |
| WorkSubscription | work_subscriptions | Stores reader subscription records for works. | data_dictionary/dd-worksubscription.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

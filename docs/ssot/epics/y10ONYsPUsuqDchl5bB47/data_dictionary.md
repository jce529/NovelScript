---
id: "doc:i8nz5cyThMV-9swf3Coac"
name: "Home Discovery Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "y10ONYsPUsuqDchl5bB47"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity-profile","title":"Profile","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"],"modelLinksOmitted":3,"table_name":"profiles","column_names":"created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"},{"stableKey":"entity-readingprogres","title":"ReadingProgres","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:ReadingProgres","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#chapter_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#updated_at","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#user_id","YvT2lTG9SMxvmrmmzTkGu:ReadingProgres#work_id"],"table_name":"reading_progress","column_names":"chapter_id, updated_at, user_id, work_id"},{"stableKey":"entity-wallet","title":"Wallet","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"],"table_name":"wallets","column_names":"balance, id, updated_at"},{"stableKey":"entity-work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"},{"stableKey":"entity-worklike","title":"WorkLike","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:406184af4ba83897"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:WorkLike","YvT2lTG9SMxvmrmmzTkGu:WorkLike#created_at","YvT2lTG9SMxvmrmmzTkGu:WorkLike#user_id","YvT2lTG9SMxvmrmmzTkGu:WorkLike#work_id"],"table_name":"work_likes","column_names":"created_at, user_id, work_id"}]
relatedDocs: []
serviceMapNodes: []
---
# Home Discovery Data Dictionary

Canonical data dictionary for source-backed entities evidenced for the Home Discovery epic.

## Evidence Gaps

- No backend model evidence was provided here for User, Chapter, KbNode, Report, LedgerEntry, WorkBookmark, or WorkSubscription, so their storage details are not confirmed in this epic data dictionary.
- The provided evidence shows select access for these models, but it does not confirm broader write behavior or lifecycle rules for Home Discovery.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Profile | profiles | Reader or writer profile data used as the anchor for home personalization and related discovery records. | data_dictionary/entity-profile.md |
| ReadingProgres | reading_progress | Continuation state linking a reader profile to the latest tracked work and chapter. | data_dictionary/entity-readingprogres.md |
| Wallet | wallets | Supporting account balance data linked to a profile. | data_dictionary/entity-wallet.md |
| Work | works | Core discoverable content item presented on the home experience. | data_dictionary/entity-work.md |
| WorkLike | work_likes | Reader like state connecting a profile to a work. | data_dictionary/entity-worklike.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

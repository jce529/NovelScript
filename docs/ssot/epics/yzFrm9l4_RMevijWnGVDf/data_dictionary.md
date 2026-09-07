---
id: "doc:vASDcXr8SmFxXveXVCtCz"
name: "Work Portfolio Management Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "yzFrm9l4_RMevijWnGVDf"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity-work","title":"Work","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:0fa7f8ae42157474"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Work","YvT2lTG9SMxvmrmmzTkGu:Work#cover_image_url","YvT2lTG9SMxvmrmmzTkGu:Work#created_at","YvT2lTG9SMxvmrmmzTkGu:Work#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Work#genre","YvT2lTG9SMxvmrmmzTkGu:Work#id"],"modelLinksOmitted":4,"table_name":"works","column_names":"cover_image_url, created_at, deleted_at, genre, id, owner_id, synopsis, title, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Work Portfolio Management Data Dictionary

Canonical data dictionary for the Work entity used to list and open a writer's works on /studio.

## Evidence Gaps

- The provided evidence confirms the Work model and its fields, but it does not provide model definitions for related entities such as Profile, Chapter, KbNode, ReadingProgres, Report, WorkBookmark, WorkLike, or WorkSubscription.
- The provided evidence shows that /studio reads from works, but it does not confirm whether cover_image_url, genre, or updated_at are displayed on that screen.
- The provided evidence confirms that deleted works are excluded when deleted_at is not null, but it does not describe who or what process sets deleted_at.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Work | works | A writer-owned work record used to populate the studio work list and route into a specific title. | data_dictionary/entity-work.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

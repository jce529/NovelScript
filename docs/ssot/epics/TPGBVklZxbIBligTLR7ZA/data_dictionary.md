---
id: "doc:bMV5WsvNEinEvm-frZQ8t"
name: "Writer Upgrade Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "TPGBVklZxbIBligTLR7ZA"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity-profile","title":"Profile","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:api_spec:881e24b5984c6f29","doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"],"modelLinksOmitted":3,"table_name":"profiles","column_names":"created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"},{"stableKey":"entity-wallet","title":"Wallet","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:f55b2a55c6ec78f9"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"],"table_name":"wallets","column_names":"balance, id, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Writer Upgrade Data Dictionary

Data dictionary for the Writer Upgrade epic, covering the model-backed Profile and Wallet entities observed in the provided source documents.

## Evidence Gaps

- The provided evidence does not confirm the business meaning or runtime use of most Profile relations beyond the authenticated profile row update and the screen-level wallet lookup.
- The provided evidence shows that wallets are selected on /write/start, but it does not confirm how Wallet.balance is used in the writer-upgrade flow.
- The provided evidence names related entities such as User, KbNode, ReadingProgres, Report, WorkBookmark, WorkLike, WorkSubscription, Work, and LedgerEntry, but it does not include their source specifications or model details in this task context.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Profile | profiles | Model-backed profile record used to verify reader status and store writer-upgrade pen name data. | data_dictionary/entity-profile.md |
| Wallet | wallets | Model-backed wallet record referenced by the write-start screen through a supporting wallet lookup. | data_dictionary/entity-wallet.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

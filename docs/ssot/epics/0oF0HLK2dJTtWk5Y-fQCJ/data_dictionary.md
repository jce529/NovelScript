---
id: "doc:CCK9oxqDMF58gsQ1ImfiM"
name: "Account Overview Data Dictionary"
type: "data_dictionary"
scope: "epic"
scopeId: "0oF0HLK2dJTtWk5Y-fQCJ"
validity: "fresh"
status: "active"
sourceCommit: "unknown"
items: [{"stableKey":"entity-profile","title":"Profile","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Profile","YvT2lTG9SMxvmrmmzTkGu:Profile#created_at","YvT2lTG9SMxvmrmmzTkGu:Profile#deleted_at","YvT2lTG9SMxvmrmmzTkGu:Profile#id","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name","YvT2lTG9SMxvmrmmzTkGu:Profile#pen_name_bio"],"modelLinksOmitted":3,"table_name":"profiles","column_names":"created_at, deleted_at, id, pen_name, pen_name_bio, pen_name_set_at, role, updated_at"},{"stableKey":"entity-wallet","title":"Wallet","docLinks":["doc:qlEXtwsu7YJjMVDZhrC2H:screen_spec:ad11cb91be5b493f"],"modelLinks":["YvT2lTG9SMxvmrmmzTkGu:Wallet","YvT2lTG9SMxvmrmmzTkGu:Wallet#balance","YvT2lTG9SMxvmrmmzTkGu:Wallet#id","YvT2lTG9SMxvmrmmzTkGu:Wallet#updated_at"],"table_name":"wallets","column_names":"balance, id, updated_at"}]
relatedDocs: []
serviceMapNodes: []
---
# Account Overview Data Dictionary

Data entities evidenced for the Account Overview epic cover the signed-in user's profile record and linked wallet record used or referenced by the account settings area.

## Evidence Gaps

- The account settings evidence shows that wallets are selected, but it does not confirm which wallet fields are displayed or how balance is used on the screen.
- The account settings evidence does not describe how pen_name_bio, pen_name_set_at, created_at, or updated_at are presented to the user in this epic.
- Several Profile relationships and the Wallet to LedgerEntry relationship are present in model evidence, but this epic does not confirm business behavior for those linked records beyond their existence.

## Entities

| Entity | Table | Summary | Detail |
| --- | --- | --- | --- |
| Profile | profiles | Represents the signed-in person's account profile state for the account settings area, including role, pen name visibility, and inactive account soft-delete status. | data_dictionary/entity-profile.md |
| Wallet | wallets | Represents a wallet record linked to a profile and referenced by account settings evidence, with balance and update time stored on the model. | data_dictionary/entity-wallet.md |

## Retrieval Note

이 문서는 데이터 딕셔너리의 엔티티 목록과 라우팅 색인입니다.
특정 엔티티의 필드, 관계, 모델 링크, 근거 문서가 필요하면 `data_dictionary/<entity>.md` 하위 문서를 읽으세요.

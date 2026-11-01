---
id: 07-09
title: fixture 정리가 0023 잠금 트리거(locked_node_immutable)에 막힘
fixed: 2026-10-23
files:
  - scripts/lib/report-fixture-cleanup.mjs
  - scripts/cleanup-reader-report-fixtures.mjs
  - tests/helpers/work-fixture.ts
  - tests/reader/reports-cleanup.database.test.ts
  - tests/reader/reports.test.ts
  - tests/uat/cleanup-uat-accounts.database.test.ts
---

# 07-09: fixture 정리와 잠금 트리거 충돌 수정

## 증상
일회용 DB에서 `deleteFixtures`가 `locked_node_immutable`로 실패(테스트 5건 + afterAll). 실패한 실행은 작품 잔여물을 남겼다.

## 원인
`create_work`가 만드는 잠금 구조 폴더를 정리 스크립트가 `delete from kb_nodes`로 직접 지우려 했다. FK는 cascade가 아니고 제품에 작품 삭제 경로가 없다.

## 수정
0023/0034 불변식은 건드리지 않았다. fixture를 `createRemovableWork`(works + 비잠금 폴더)로 만들고, 정리 스크립트는 잠금 노드·확정 가지 작품을 `locked_kb_nodes`/`confirmed_world_branch` blocker로 사전 거부하며 dry-run에 개수를 표시한다.

## 검증
`reports-cleanup`, `reports`, `cleanup-uat-accounts` 3파일 20개 통과(일회용 DB). 롤백 트랜잭션 회귀로 직접 DELETE가 여전히 거부됨을 확인. 전체 suite 1건 실패는 별개 원인(일회용 DB의 UAT 확정 가지 잔여물, 17-BASELINE 참고).

## 커밋
- `407b51a` fix(17-05): 정리 스크립트가 잠금 노드와 확정 가지 작품을 사전 거부

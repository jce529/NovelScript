---
id: BUG-02
title: 토글이 읽기 후 쓰기라서 빠른 연속 클릭 시 한 번만 반영될 수 있다
status: open
severity: low
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 03 (b5db0eb feat(03-04): implement likes/subscriptions/bookmarks toggle modules)
files:
  - lib/reader/likes.ts
  - lib/reader/bookmarks.ts
  - lib/reader/subscriptions.ts
  - supabase/migrations/0003_reader.sql
---

# BUG-02: 토글 읽기→쓰기 경합

## 증상
같은 사용자가 같은 작품에 대해 토글을 거의 동시에 두 번 보내면(더블클릭, 느린 응답 중 재클릭, 두 탭), 두 요청이 같은 현재 상태를 읽고 같은 동작을 수행한다. 두 번 토글했는데 결과가 "켜짐"으로 남을 수 있다.

## 재현
1. 현재 상태가 "없음"인 작품에 대해 `toggleLike`를 `Promise.all`로 2회 호출한다.
2. 두 호출이 모두 `existing = null`을 읽고 둘 다 INSERT를 시도한다.
3. 한 INSERT는 성공하고 다른 INSERT는 PK `(work_id, user_id)` 위반으로 실패한다. BUG-01 때문에 실패가 무시되어 두 호출 모두 `liked: true`를 반환한다.

## 기대 / 실제
- 기대: 두 번 토글하면 최종 상태가 원래대로(없음)이다. 또는 최소한 반환값이 실제 DB 상태와 일치한다.
- 실제: 최종 상태는 "있음"이고 두 응답 모두 `liked: true`다. 데이터 중복은 PK가 막으므로 오염은 없고 UX 불일치만 발생한다.

## 원인
- select → insert/delete가 별도 요청이며 트랜잭션·락·조건부 쓰기가 없다.
- 테이블 PK는 있으나(0003_reader.sql) 실패를 처리하지 않아 경합이 은폐된다.

## 수정 방향
- 상태 전환을 DB에서 원자적으로 처리한다: `delete ... returning`으로 삭제 성공 여부를 먼저 확인하고, 삭제된 행이 없을 때만 `insert ... on conflict do nothing`을 수행한다(또는 단일 RPC). 최종 반환값은 쓰기 결과에서 도출한다.
- 클라이언트 쪽에서도 요청 중 버튼 비활성화(중복 클릭 방지)를 함께 적용하면 체감 문제는 대부분 사라진다.
- BUG-01과 같은 변경 단위로 처리한다. 정책 결정은 필요 없다.

## 검증
- 독립 호출 2회 동시 실행 후 최종 DB 행 수와 반환값이 일치하는지 확인하는 DB 테스트를 추가(먼저 실패 확인).
- 순차 토글 on→off→on 회귀 통과 확인.

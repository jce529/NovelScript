---
id: BUG-01
title: 좋아요·북마크·구독 토글이 DB 쓰기 오류를 무시하고 성공을 반환한다
status: open
severity: medium
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 03 (b5db0eb feat(03-04): implement likes/subscriptions/bookmarks toggle modules)
files:
  - lib/reader/likes.ts
  - lib/reader/bookmarks.ts
  - lib/reader/subscriptions.ts
---

# BUG-01: 토글 DB 쓰기 오류 무시

## 증상
RLS 거부·일시적 DB 오류·FK 위반으로 INSERT/DELETE가 실패해도 `toggleLike`/`toggleBookmark`/`toggleSubscription`은 성공 상태(`liked: true` 등)를 반환한다. UI는 반영된 것처럼 보이다가 새로고침하면 원래 상태로 돌아간다.

## 재현
1. 토글 대상 테이블 쓰기를 실패시킨다(예: 존재하지 않는 `workId`, 또는 쓰기 권한이 없는 상태로 `delete/insert`).
2. 토글 함수를 호출한다.
3. 반환값이 `{ liked: true }`(또는 `false`)이고 오류 정보가 없다.

## 기대 / 실제
- 기대: 쓰기 실패 시 상태를 바꾸지 않고 오류를 호출자에게 알린다.
- 실제: 세 함수 모두 `await supabase.from(...).delete()/insert(...)`의 반환값(`error`)을 읽지 않고 곧바로 낙관적인 상태를 반환한다. 또한 상태 조회(`existing`)의 `error`도 확인하지 않아 조회 실패가 "없음"으로 취급된다.

## 원인
- 03-04 구현이 RESEARCH Pattern 6(select → insert/delete)의 단순 형태를 따랐고 오류 분기를 두지 않았다.
- 정지 계정 차단은 `checkWriteAccess`가 별도로 처리하므로(D-07) 영향받는 것은 그 외 실패 경로다.

## 수정 방향
- 세 함수가 조회·쓰기의 `error`를 확인하고, 실패 시 `{ liked/bookmarked/subscribed: <기존 상태>, error: '...' }` 형태로 반환한다. 반환 타입에 선택적 `error`를 추가하고 호출 액션(`app/.../actions.ts`)과 UI가 이를 사용자 문구로 표시하게 한다.
- BUG-02(경합)와 같은 코드를 건드리므로 함께 수정하는 것을 권장한다. 정책 결정은 필요 없다.

## 검증
- fake client로 insert/delete가 `{ error }`를 돌려줄 때 반환값이 기존 상태 + 오류인지 확인하는 단위 테스트를 세 모듈에 추가(먼저 실패 확인).
- 기존 `tests/reader/*` 회귀 통과 확인.

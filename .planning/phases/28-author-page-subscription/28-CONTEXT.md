# Phase 28 — 작가 페이지 · 작가 알림 구독: 선행 결정 (2026-11-13)

요구사항 APAGE-01~03, 설계 근거 `design/UI-DESIGN-BACKLOG.md` 작가 페이지(22번 보드), 목업 `design/mockups/project/AuthorPage.dc.html`. 코드 구현은 이 문서 범위 밖이다.

## 사용자 확정 결정

1. **URL·식별자:** `/author/[uuid]` — `profiles.id`를 그대로 쓴다(필명 변경에도 링크 유지). Phase 27 검색 결과의 작가 링크와 작품 상세의 작가 이름 링크가 같은 형태다. 필명(`pen_name`)이 없는 계정·삭제 계정(`deleted_at`)·작품이 없는 계정은 작가 페이지가 없는 것으로 보고 안내 화면(404 성격)을 보인다.
2. **구독자 수:** 실시간 count. 공개 조회용 SECURITY DEFINER 함수가 `author_subscriptions` 행 수를 센다. 작가가 숨기는 스위치는 두지 않는다. 규모가 커지면 캐시 컬럼으로 전환(후속).
3. **구독 테이블:** `author_subscriptions` 신설 — `(author_id, user_id)` PK, 본인 RLS, `toggle_author_subscriptions` RPC(`work_subscriptions`의 `toggle_*` 패턴과 동일, 로그인 필수·정지 계정 차단). `work_subscriptions`(READ-07)와 완전히 분리 저장한다. 마이그레이션 번호는 **미정**(다른 phase와 충돌 방지, 실행 직전에 확정).
4. **작가 본인 페이지:** `작가 알림 구독` 버튼을 숨기고 구독자 수만 보인다. DB RPC도 자기 자신 구독을 거부한다.

## 기본값으로 정한 사항 (사용자 확인 불필요한 관례)

- 공개 작품 = `world_work_reader_visible(work_id)`(삭제·가지 초안·블라인드 아님 + 발행 회차 1개 이상) 단일 정의를 재사용한다. 작품 수·연재중/완결 수·그리드는 이 기준의 공개 작품만 센다.
- 프로필 공개 필드는 `pen_name`, `pen_name_bio`만이다. `profiles`의 select RLS는 본인 한정이므로 공개 조회는 SECURITY DEFINER 함수(허용 컬럼만 반환)로 만들고 anon 실행을 허용한다. 이메일·역할·정지 상태 등은 반환하지 않는다.
- 연재 상태(연재중/완결)는 기존 작품 상태 데이터를 따른다. 정렬 3종은 업데이트(최근 발행 회차)·신작(작품 생성)·인기(현행 피드 지표 어댑터, Phase 23 랭킹과 같은 지표 한 곳 재사용)이다.
- 비로그인 독자가 구독 버튼을 누르면 로그인 안내(작품 알림 구독과 동일 동작). 정지 계정은 write-access 거부 메시지.
- 이 phase는 구독 **데이터·조회 API**(내 구독 작가 목록, 구독 토글)를 제공하고, 내서재 `알림 구독` 탭 UI는 Phase 22가 소비한다. 전달 채널(푸시·메일)은 정의하지 않는다.

## 연동

- Phase 27: 검색 작가 결과 → `/author/[uuid]` (2026-11-13 통보).
- Phase 22: `listMyAuthorSubscriptions` 류 조회와 토글 액션 재사용. 구독 끄면 행을 지우지 않고 목록 유지가 요구되므로(APAGE-03) **plan 단계 설계 이슈**: `toggle` 삭제 방식이면 목록에서 사라진다 → `author_subscriptions`에 `notify boolean`(또는 `muted_at`)을 두고 행은 유지, 구독자 수는 notify=true만 센다. UI-SPEC·PLAN에서 이 방식으로 확정한다.
- Phase 3: 작품 상세의 작가 이름이 작가 페이지로 링크.

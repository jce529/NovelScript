# Phase 28 PLAN 인덱스 — 작가 페이지·작가 알림 구독

Phase 목표: 독자가 공개 작가 페이지에서 프로필·공개 작품을 보고 작가 알림 구독을 켜고 끈다. 작품 상세의 작가명은 `/author/{profiles.id}`로 연결한다. Phase 22가 사용할 구독 목록·토글 API를 제공한다. 검색 결과 링크 구현은 Phase 27, 내서재 탭 UI는 Phase 22가 소유한다.

| Wave | PLAN | 실행 산출물 | 선행 PLAN | 요구사항 |
|---|---|---|---|---|
| 1 | [28-01](28-01-PLAN.md) | 번호 미정 마이그레이션·DB 테스트 | 없음 | APAGE-01, APAGE-02, APAGE-03 |
| 2 | [28-02](28-02-PLAN.md) | lib/author 공개/개인 API·상태 저장 연결 | 28-01 | APAGE-01, APAGE-02, APAGE-03 |
| 3 | [28-03](28-03-PLAN.md) | 작가 페이지·구독 액션·작품 상세 링크 | 28-02 | APAGE-01, APAGE-02 |
| 4 | [28-04](28-04-PLAN.md) | DB·순수 로직·타입·린트 통합 검증과 화면 수동 UAT | 28-01~03 | APAGE-01, APAGE-02, APAGE-03 |

## 요구사항 매핑

| 요구사항 | 구현 PLAN | 검증 PLAN | 이 phase의 경계 |
|---|---|---|---|
| APAGE-01 | 28-01 공개 조회, 28-02 조회 API, 28-03 페이지·작품 상세 링크 | 28-04 | Phase 27 검색 결과 링크는 검색 phase 소유. URL 계약은 `/author/{profiles.id}`. |
| APAGE-02 | 28-01 별도 구독 테이블/RPC, 28-02 서비스, 28-03 버튼/액션 | 28-04 | 알림 전달 채널 제외. |
| APAGE-03 | 28-01 notify 유지 모델, 28-02 목록·토글 API | 28-04 | Phase 22 내서재 탭 UI 제외. 꺼진 구독도 목록에 유지. |

## 실행 전 확인

- **확인된 사실:** 현재 확인한 0002 스키마의 works에는 연재 상태 컬럼이 없다. published_at은 chapters에 있다. 공개 판정 함수 `world_work_reader_visible`은 0033에 있다. 인기 지표는 `computeTrendingScores` 및 세계수 `metric-adapter`에 있다.
- **인기순 계약:** Phase 23 지표가 아직 없으므로 현행 피드/세계수의 공개 전역 기준을 쓴다. 발행 회차 view_count 합계, work_likes 행 수, 인접 발행 회차 조회 비율 평균을 0.4/0.3/0.3으로 결합하고 전체 공개 후보를 점수 DESC·created_at DESC·id로 정렬한 다음 12개씩 나눈다. 28-01 SQL과 28-02·04 fixture가 같은 입력·점수·순서를 확인한다.
- **실행 시 가변 사항:** 다른 phase가 상태 컬럼·인기 기준·마이그레이션 번호를 추가할 수 있다. 28-01이 실행 직전 이를 확인해 재사용 또는 보완한다. 파일명 `NNNN_author_subscriptions.sql`의 NNNN은 자리표시자이며 확정 번호가 아니다.
- **공유 파일 경계:** 28-02의 `lib/works/actions.ts`는 소유자의 연재 상태 저장 경로, 28-03의 같은 파일은 작품 상세의 공개 작가 DTO를 다룬다. 28-03은 28-02 완료 후 수정한다.
- **Next.js:** 코드 작성 PLAN은 반드시 현재 체크아웃의 `node_modules/next/dist/docs/` 중 관련 가이드를 읽고 API·deprecation을 확인한다.
- **검증:** `vitest.config.ts`는 `.test.ts`만 수집하고 Node 환경이며 `package.json`에 jsdom·testing-library가 없다. 검증 파일은 `.test.ts`로 두고, 순수 로직·서버 액션은 자동 테스트, 컴포넌트 렌더·반응형·포커스는 수동 UAT로 확인한다. 공용 카운트 검증 명령은 실제 실행 N&gt;0·skip 0을 요구한다. DB suite는 `SUPABASE_DB_URL`이 있을 때 실DB 실행하며, 부재로 skip되면 미검증으로 보고한다.

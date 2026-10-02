# NovelScript 기획·구현 통합 SSOT

최종 대조일: 2026-10-01  
Platty 프로젝트: `NovelScript MVP` (`qlEXtwsu7YJjMVDZhrC2H`)

## 문서의 역할

이 문서는 완성형 제품 기획, MVP 범위, 현재 구현 사이의 차이를 판정하는 기준 문서다. 세부 코드 명세와 에픽 문서는 [`docs/ssot/`](./ssot/README.md)에서 찾는다.

충돌 시 우선순위는 다음과 같다.

1. `.planning/REQUIREMENTS.md`의 현재 v1 요구사항과 명시적 Out of Scope
2. `.planning/PROJECT.md`의 확정 결정과 제약
3. `.planning/ROADMAP.md`, `STATE.md`, phase `SUMMARY/VERIFICATION`의 실행 상태
4. `docs/1~5`의 완성형 서비스 비전
5. `RESEARCH` 문서의 조사·제안
6. 현재 코드와 테스트는 구현 사실의 기준이며, 기획 의도를 자동으로 변경하지 않는다.

## 판정 범례

- **구현됨**: 코드·DB·테스트 또는 phase 검증 근거가 존재한다.
- **부분 구현**: 주요 코드가 있으나 필수 외부 연동 또는 실사용 검증이 남았다.
- **미구현**: v1 요구사항이지만 구현 phase가 시작되지 않았다.
- **유예(v2)**: 정의돼 있으나 현재 마일스톤에 포함되지 않는다.
- **범위 밖**: 완성형 비전에는 있으나 현재 MVP에서 명시적으로 제외됐다.

## 현재 제품 경계

- 핵심 가치: 작가의 설정 관리·집필·AI 보조와 독자의 탐색·열람이 한 서비스에서 이어지는 창작/소비 루프.
- 현재 구현 범위(v1.0): 인증, 작가 전환, 작품/KB/회차 관리, 독자 탐색/열람/반응, 멘션 기반 AI 생성, 지갑 원장, 유료 회차 소장과 작가 90/10 정산(Phase 6), 관리자 신고 검토·제재(Phase 7).
- 현재 구현 범위(v1.1): 멀티 프로바이더 어댑터와 OpenAI·Anthropic 지원(Phase 8~9), BYOK 키 등록·검증·관리와 모델 피커(Phase 10), Jev 선계획 기반 AI 문서 생성(Phase 15, 코드 완료·활성화 보류).
- 진행/다음: Phase 11 BYOK 호출 경로(계획 완료, 실행 전) → Phase 12~14 MCP. v1.0 잔여는 Phase 5 Toss 결제(05-01·05-02 서버 기반만 구현, 05-03~07 미실행).
- 현재 차단/확인 사항: Toss 가맹·사업자 심사 상태, 선불전자지급수단 규제 검토, 라이브 `GEMINI_API_KEY` 쿼터(429), Phase 15 활성화 조건(데이터 정책 승인·벤더 holdout 평가·그림자 표본), Phase 6 브라우저 E2E와 독립 세션 동시성 검증.

## v1 요구사항 구현 매트릭스

| 영역 | 요구사항 | 판정 | 근거/비고 |
| --- | --- | --- | --- |
| 인증 | AUTH-01 소셜 로그인 | 구현됨 | Supabase OAuth, `/login`, `/auth/callback`; Kakao scope 이슈 해결 기록 |
| 인증 | AUTH-02 단일 계정의 독자/작가 역할 | 구현됨 | `/write/start`, writer upgrade action |
| 인증 | AUTH-03 세션 유지 | 구현됨 | Supabase SSR와 `proxy.ts` 세션 갱신 |
| KB | KB-01 5종 템플릿 문서 CRUD | 구현됨 | 인물/장소/사건/세력/아이템 템플릿과 KB actions |
| KB | KB-02 작품별 IDE형 트리 | 구현됨 | Studio KB tree와 잠금 구조 폴더 |
| KB | KB-03 사용자 정의 폴더 | 구현됨 | migration `0004`, `createFolder`, 중첩 폴더 UI |
| KB | KB-04 계정 공유 폴더 | 구현됨 | work/account scope 분리 및 교차 작품 멘션 |
| KB | KB-05 회차 폴더 트리 | 구현됨 | 고정 회차 폴더, `chapters.folder_id`, 하위 폴더 |
| AI | EDIT-01 `@` 멘션 검색 | 구현됨 | mention search/autocomplete/quick-add |
| AI | EDIT-02 컨텍스트 문서 목록 | 구현됨 | AI panel chip list |
| AI | EDIT-03 3단계 프리셋 | 구현됨 | 초보자/중급자/자유형 및 자유 입력 |
| AI | EDIT-04 Gemini 생성 후 캔버스 삽입 | 부분 구현 | 코드·mock 테스트·일부 실연동 근거는 있으나 현재 STATE는 실제 키 기반 전체 흐름 재검증을 요구 |
| AI | EDIT-05 생성 전 비용 추정 | 부분 구현 | 추정 및 실제 사용량 차감 코드 존재; 실제 키/실잔액 정확도 검증 미완료. 같은 지갑의 유료 생성은 한 번에 하나(지갑별 lease `ai_generation_locks`, 0021)이며 공급자 호출 120초 상한·lease TTL 180초 |
| 콘텐츠 | CONT-01 회차 초안 생성/저장 | 구현됨 | chapter actions와 편집 UI. 순번 부여는 `create_chapter_atomic` RPC(0020)로 원자화해 동시 생성도 연속 순번(2026-10-02) |
| 콘텐츠 | CONT-02 무료/유료 발행 | 구현됨 | 발행 상태와 0/10/30/50/100 가격 tier |
| 콘텐츠 | CONT-03 수정/발행 취소 | 구현됨 | ownership guard와 unpublish flow |
| 독자 | READ-01 디스커버리 피드 | 구현됨 | 조회·좋아요 중심 간소화 점수; 정밀 완독률은 제외 |
| 독자 | READ-02 뷰어/이전·다음/목차 | 구현됨 | ViewerPage와 TOC |
| 독자 | READ-03 글꼴/테마 설정 | 구현됨 | viewer settings |
| 독자 | READ-04 이어보기 | 구현됨 | reading progress와 recently-read |
| 독자 | READ-05 작품/회차 신고 | 구현됨 | report dialog와 reports table |
| 독자 | READ-07 새 회차 알림 구독 상태 | 구현됨 | 구독 toggle 저장(`toggle_work_subscriptions` RPC, 0019); 실제 알림 전달 채널은 미정 |
| 독자 | READ-08 선호작 저장 | 구현됨 | bookmark toggle(`toggle_work_bookmarks` RPC, 0019); 좋아요와 별개. 좋아요·구독·북마크 토글은 DB에서 원자 반전하고 오류는 `ok: false`로 전달, 진행 중 버튼 비활성(브라우저 확인 대기) |
| 독자 | READ-09 프로모션 배너 슬롯 | 구현됨 | 정적 슬롯이며 운영 스케줄링은 범위 아님 |
| 결제 | PAY-01 Toss 토큰 충전 | 미구현 | Phase 5 05-01·05-02에서 `payment_orders`(0016_payments)·주문 생성·Toss 서버 클라이언트만 구현(DB 테스트 통과). 충전 UI·확정 흐름(05-03~07) 미실행 |
| 결제 | PAY-02 유료 회차 원자적 해금 | 부분 구현 | 구매·소장·작가 90/10 정산 구현(0005, 0017_author_settlement). 2026-10-01 DB 테스트 통과(분배 스냅샷·멱등·롤백). 브라우저 E2E·독립 세션 동시성 미검증, 실충전은 Phase 5 의존 |
| 결제 | PAY-03 webhook 검증 후에만 적립 | 미구현 | Phase 5 확정 흐름 미실행; 클라이언트 redirect 적립 금지 원칙 확정 |
| 관리자 | ADMIN-01 신고 큐 | 구현됨 | Phase 7 완료(2026-09-17), 실DB·브라우저 UAT 통과 |
| 관리자 | ADMIN-02 회차 blind/unpublish | 구현됨 | Phase 7, `0009_blind_access` 접근 차단 포함 |
| 관리자 | ADMIN-03 경고/정지/차단과 이력 | 구현됨 | Phase 7, 제재 집행 `0008_sanction_enforcement`. 경고 확인 유지·정지 사용자 화면 2건은 브라우저 재확인 필요 |
| 관리자 | ADMIN-04 신고 해결/기각 | 구현됨 | Phase 7 |

집계: **구현됨 26 / 부분 구현 3 / 미구현 2 = v1 총 31개**.

## v1.1 요구사항 진행 (31개)

`.planning/REQUIREMENTS.md` 추적표 기준. 이 문서는 요약만 두고 개별 판정은 요구사항 문서를 따른다.

| 영역 | 상태 |
| --- | --- |
| PROV-01~05, 07 (어댑터·OpenAI·Anthropic·기본 제공자·모델 피커) | 완료 (Phase 8~10). 라이브 호출·브라우저 UAT 통과 |
| BYOK-01~04 (키 등록·검증·마스킹·삭제) | 완료 (Phase 10). Vault 보관, 계정 삭제 시 시크릿 정리(0015_byok_secret_cleanup) |
| COST-01 | 완료 (Phase 8, 멱등 차감) |
| PROV-06, BYOK-05~09, COST-02 | 미구현 — Phase 11 계획 8개 작성, 실행 전 |
| MCP-01~09 | 미구현 — Phase 12~14 |
| AIDOC-01~04 | 코드 완료(Phase 15), 활성화 보류·브라우저 UAT 대기 |

## v2 및 완성형 비전

### 유예(v2)

- EDIT-06: KB 문서 간 `[[wiki-link]]`
- EDIT-07: 초보자용 동적 추천 프롬프트 chip
- EDIT-08: Tab 수락형 ghost text
- READ-06: 독자에게 공개하는 AI 작성/lore wiki showcase
- ADMIN-05: 신고 검색·필터, 감사 로그 UI, 답변 템플릿

### 현재 MVP 범위 밖

| 완성형 기획 | 현재 결정 |
| --- | --- |
| 에셋 스토어와 판매자 대시보드 | 핵심 집필-열람-결제 검증 뒤로 유예 |
| BYOK/API Key Vault | v1.0은 플랫폼 Gemini 키만 운영했고, v1.1(Phase 10~11)에서 BYOK 도입 |
| 작가 토큰 현금화 | 현금화는 범위 밖. 구매 시 작가 지갑 크레딧(90/10, 잠정)만 PAY-02로 구현 |
| SLM 비동기 자동 사전검수 | 베타는 관리자 수동 검토로 대체 |
| 정밀 스크롤 완독률·관계 지역성 랭킹 | 단순 조회/좋아요 기반으로 시작 |
| 3-Strike 자동 제재 | 관리자 수동 판단 이후 검토 |
| 완전한 3패널 IDE·KB 그래프·파일 DnD | 기본 tree/textarea/AI panel만 구현; 정교화는 후속 범위 |
| Zustand local-first/persist, pgvector RAG, Cloud Run worker | 현재 코드에서 채택되지 않은 완성형 아키텍처 제안 |
| PortOne 등 PG 추상화 | Toss Payments 직접 연동으로 확정 |

## 문서 간 충돌과 해석

1. `docs/`는 완성형 서비스 청사진이고 `.planning`은 현재 MVP 계약이다. 완성형 기능이 코드에 없다는 사실은 결함이 아니라, 요구사항에 포함된 경우에만 미구현으로 판정한다.
2. Phase 4의 Gemini 라이브 왕복은 키 쿼터 문제(429)로 아직 재검증되지 않았다. EDIT-04/05는 부분 구현으로 유지한다. 다른 제공자(gpt-4o-mini, claude-haiku-4-5 등)의 라이브 호출은 Phase 9에서 통과했다.
3. PAY-02는 소장·정산 로직과 DB 테스트가 있으나 실충전(PAY-01)이 없어 실제 구매 흐름 전체는 검증되지 않았다. 완료(체크)와 E2E 검증 완료를 구분한다.
4. 신고 제출(READ-05)과 관리자 처리(ADMIN-01~04)는 모두 구현됐다. Phase 7의 미확인 2건은 `.planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md`에서 추적한다.
5. 기존 phase 문서의 `LayoutProps` 및 discovery test 문제 기록은 과거 worktree 환경 기록이다. 현재 사실은 최신 테스트/빌드로 다시 확인해야 한다.

## 변경 규칙

- 요구사항 상태 변경은 코드만 보고 자동 승격하지 않는다. 요구사항, 검증 결과, 외부 연동 상태를 함께 갱신한다.
- 새 기능은 먼저 v1/v2/범위 밖 중 하나로 분류한다.
- 코드 변경 후 `platty sync static-map`, sync plan/run/confirm을 거쳐 `docs/ssot`를 재생성한다.
- 인간의 의도·정책 변경은 Platty `memory`에 근거 문서 경로와 함께 기록한다.
- 테스트: `npm test`는 `vitest.config.ts`의 `unit`(병렬)·`db`(원격 Supabase를 쓰는 파일, 직렬) 두 프로젝트로 실행되며 DB 파일은 내용으로 자동 분류된다. `npm run lint`는 `--max-warnings=0`이다(2026-10-02).
- 이 문서와 `.planning/REQUIREMENTS.md`가 달라지면 요구사항 문서를 먼저 수정하고 이 매트릭스를 동기화한다.

## 근거 문서 레지스트리

- 완성형 제품 기획: `docs/1. 개요.md` ~ `docs/5-4 통합 결제 시스템 및 글로벌 헤더 (UI,UX & BM).md`
- KB 템플릿: `docs/Template/*.md`
- 현재 제품 계약: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`
- 실행 순서와 상태: `.planning/ROADMAP.md`, `.planning/STATE.md`
- 마이그레이션 번호: 2026-10-02 중복 해소 — `0015_byok_secret_cleanup`, `0016_payments`, `0017_author_settlement`. `0018`은 Phase 11 `ai_usage`용으로 예약됐고 2026-10-02 버그 수정으로 `0019_reader_atomic_toggle`, `0020_create_chapter_atomic`, `0021_ai_generation_locks`가 추가됐다(원격 테스트 DB 적용 완료). 신규는 `0022`부터(Phase 11이 `0018`을 쓰기 전이면 번호 조율)이며 `tests/migrations/numbering.test.ts`가 번호 유일성을 검사한다.
- 완료 근거: `.planning/phases/**/**-SUMMARY.md`, `**-VERIFICATION.md`
- 미완료·환경 이슈: `.planning/phases/**/deferred-items.md`, `04-HUMAN-UAT.md`
- 조사 근거(비확정): `.planning/research/*.md`, 각 phase `*-RESEARCH.md`
- 코드 기반 Platty 문서: `docs/ssot/`

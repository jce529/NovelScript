# NovelScript 기획·구현 통합 SSOT

최종 대조일: 2026-09-02  
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
- 현재 구현 범위: 인증, 작가 전환, 작품/KB/회차 관리, 독자 탐색/열람/반응, Gemini 기반 멘션 생성 코드, 지갑 원장 기반.
- 다음 구현 순서: Phase 5 실제 Toss 결제 → Phase 6 유료 회차 해금 → Phase 7 관리자 검토/제재.
- 현재 차단/확인 사항: Toss 가맹·사업자 심사 상태, 선불전자지급수단 규제 검토, 실제 `GEMINI_API_KEY` 기반 생성·비용·차감 검증.

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
| AI | EDIT-05 생성 전 비용 추정 | 부분 구현 | 추정 및 실제 사용량 차감 코드 존재; 실제 키/실잔액 정확도 검증 미완료 |
| 콘텐츠 | CONT-01 회차 초안 생성/저장 | 구현됨 | chapter actions와 편집 UI |
| 콘텐츠 | CONT-02 무료/유료 발행 | 구현됨 | 발행 상태와 0/10/30/50/100 가격 tier |
| 콘텐츠 | CONT-03 수정/발행 취소 | 구현됨 | ownership guard와 unpublish flow |
| 독자 | READ-01 디스커버리 피드 | 구현됨 | 조회·좋아요 중심 간소화 점수; 정밀 완독률은 제외 |
| 독자 | READ-02 뷰어/이전·다음/목차 | 구현됨 | ViewerPage와 TOC |
| 독자 | READ-03 글꼴/테마 설정 | 구현됨 | viewer settings |
| 독자 | READ-04 이어보기 | 구현됨 | reading progress와 recently-read |
| 독자 | READ-05 작품/회차 신고 | 구현됨 | report dialog와 reports table |
| 독자 | READ-07 새 회차 알림 구독 상태 | 구현됨 | 구독 toggle 저장; 실제 알림 전달 채널은 미정 |
| 독자 | READ-08 선호작 저장 | 구현됨 | bookmark toggle; 좋아요와 별개 |
| 독자 | READ-09 프로모션 배너 슬롯 | 구현됨 | 정적 슬롯이며 운영 스케줄링은 범위 아님 |
| 결제 | PAY-01 Toss 토큰 충전 | 미구현 | Phase 5 UI 명세 승인, 구현 계획/코드 없음 |
| 결제 | PAY-02 유료 회차 원자적 해금 | 미구현 | Phase 6 미착수; 현재 유료 회차는 잠금 표시만 수행 |
| 결제 | PAY-03 webhook 검증 후에만 적립 | 미구현 | Phase 5 미착수; 클라이언트 redirect 적립 금지 원칙 확정 |
| 관리자 | ADMIN-01 신고 큐 | 미구현 | 신고 접수 데이터는 있으나 관리자 화면 없음 |
| 관리자 | ADMIN-02 회차 blind/unpublish | 미구현 | 작가의 자기 회차 취소와 관리자 조치는 별개 |
| 관리자 | ADMIN-03 경고/정지/차단과 이력 | 미구현 | Phase 7 미착수 |
| 관리자 | ADMIN-04 신고 해결/기각 | 미구현 | Phase 7 미착수 |

집계: **구현됨 22 / 부분 구현 2 / 미구현 7 = v1 총 31개**.

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
| BYOK/API Key Vault | v1은 플랫폼 Gemini 키 하나만 운영 |
| 작가 토큰 현금화/정산 | 초기에는 AI 비용 상쇄에 집중 |
| SLM 비동기 자동 사전검수 | 베타는 관리자 수동 검토로 대체 |
| 정밀 스크롤 완독률·관계 지역성 랭킹 | 단순 조회/좋아요 기반으로 시작 |
| 3-Strike 자동 제재 | 관리자 수동 판단 이후 검토 |
| 완전한 3패널 IDE·KB 그래프·파일 DnD | 기본 tree/textarea/AI panel만 구현; 정교화는 후속 범위 |
| Zustand local-first/persist, pgvector RAG, Cloud Run worker | 현재 코드에서 채택되지 않은 완성형 아키텍처 제안 |
| PortOne 등 PG 추상화 | Toss Payments 직접 연동으로 확정 |

## 문서 간 충돌과 해석

1. `docs/`는 완성형 서비스 청사진이고 `.planning`은 현재 MVP 계약이다. 완성형 기능이 코드에 없다는 사실은 결함이 아니라, 요구사항에 포함된 경우에만 미구현으로 판정한다.
2. ROADMAP은 Phase 4를 `In Progress`로 표시하지만 6/6 계획은 완료됐다. 실제 의미는 코드 완료 후 **실제 Gemini 키·실잔액 검증 대기**이므로 EDIT-04/05를 부분 구현으로 유지한다.
3. 회차는 가격 정보를 이미 저장하지만 PAY-02가 없으므로 유료 구매가 가능한 것으로 해석하면 안 된다.
4. 신고 제출은 구현됐지만 관리자 처리 surface는 없으므로 READ-05 완료가 ADMIN-01~04 완료를 의미하지 않는다.
5. 기존 phase 문서의 `LayoutProps` 및 discovery test 문제 기록은 과거 worktree 환경 기록이다. 현재 사실은 최신 테스트/빌드로 다시 확인해야 한다.

## 변경 규칙

- 요구사항 상태 변경은 코드만 보고 자동 승격하지 않는다. 요구사항, 검증 결과, 외부 연동 상태를 함께 갱신한다.
- 새 기능은 먼저 v1/v2/범위 밖 중 하나로 분류한다.
- 코드 변경 후 `platty sync static-map`, sync plan/run/confirm을 거쳐 `docs/ssot`를 재생성한다.
- 인간의 의도·정책 변경은 Platty `memory`에 근거 문서 경로와 함께 기록한다.
- 이 문서와 `.planning/REQUIREMENTS.md`가 달라지면 요구사항 문서를 먼저 수정하고 이 매트릭스를 동기화한다.

## 근거 문서 레지스트리

- 완성형 제품 기획: `docs/1. 개요.md` ~ `docs/5-4 통합 결제 시스템 및 글로벌 헤더 (UI,UX & BM).md`
- KB 템플릿: `docs/Template/*.md`
- 현재 제품 계약: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`
- 실행 순서와 상태: `.planning/ROADMAP.md`, `.planning/STATE.md`
- 완료 근거: `.planning/phases/**/**-SUMMARY.md`, `**-VERIFICATION.md`
- 미완료·환경 이슈: `.planning/phases/**/deferred-items.md`, `04-HUMAN-UAT.md`
- 조사 근거(비확정): `.planning/research/*.md`, 각 phase `*-RESEARCH.md`
- 코드 기반 Platty 문서: `docs/ssot/`

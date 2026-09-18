# NovelScript

## What This Is

LLM API 기반의 인터랙티브 웹소설 창작·열람 플랫폼의 MVP다. 작가는 멘션(`@`) 기반 컨텍스트 주입 에디터(웹 IDE)로 AI와 협업하며 설정 붕괴 없이 연재하고, 독자는 큐레이션된 뷰어에서 몰입해서 읽는다. 결제(토큰 충전)로 들어온 수익이 AI 추론 비용을 상쇄하는 구조로, 커뮤니티를 통해 모은 베타 유저(작가/독자)를 대상으로 반응을 검증한다.

## Core Value

작가가 이 IDE로 실제로 반복해서 집필하고, 독자가 그 결과물에 몰입해서 완독·연독한다 — 창작과 소비 양쪽 루프가 동시에 성립해야 의미가 있다. 한쪽만 되는 건 실패로 간주한다.

## Current Milestone: v1.1 멀티 프로바이더 AI 연결 · BYOK · 구독형 AI MCP

**Goal:** 작가가 Gemini 외 다른 AI 제공자를 자기 API 키(BYOK)로 쓸 수 있게 하고, 평소 쓰는 구독형 AI에서 MCP로 NovelScript 작품·설정집에 접근해 초안을 되돌려 저장할 수 있게 한다.

**Target features:**
- 공통 AI 제공자 인터페이스 + 어댑터 (Gemini 전환, OpenAI, Anthropic)
- 제공자/모델 선택 — 계정 설정에서 관리, AI 패널 드롭다운에서 호출별 전환
- BYOK 키 등록·검증·암호화 저장·교체·삭제 (서버 소유권 검증, 키 비노출)
- 서비스 키 모드 / BYOK 모드 분리 — BYOK는 플랫폼 토큰 0 차감, 사용 기록만 남김
- 제공자 오류·사용 한도·타임아웃 처리 및 중복 정산 방지
- 원격 HTTP MCP 서버 + OAuth 계정 연결 — 작품/회차/설정집 읽기 + 초안·설정 변경안 저장 (기존 본문 자동 덮어쓰기 없음), 연결 해제

**Milestone notes:**
- v1.0 잔여 작업(Phase 5 Toss 결제 / Phase 6 작가 90:10 정산 / Phase 7 운영자 도구)은 v1.0 트랙에 그대로 남긴다. v1.1 로드맵에 포함하지 않으며, 페이즈 번호는 8부터 이어간다.
- BYOK 키 암호화 저장 방식(Supabase Vault vs 앱 레벨 AES-GCM)은 리서치 단계에서 결정한다.
- MCP 클라이언트별 공식 커넥터 지원 범위는 2차 착수 시 재확인한다 — 모든 구독 서비스 일괄 지원을 가정하지 않는다.
- 작업 브랜치 `codex/multi-provider-byok`, 목표 원문 `docs/ai-integration-roadmap.md`.

## Requirements

### Validated

- [x] 작가가 마크다운 지식베이스(인물/장소/사건/세력/아이템)를 만들고 관리할 수 있다 — Validated in Phase 2: studio-core-writer-loop-no-ai
- [x] 작가가 회차를 등록/발행할 수 있다 — Validated in Phase 2: studio-core-writer-loop-no-ai
- [x] 독자가 작품을 탐색(디스커버리)하고 회차를 읽을 수 있는 뷰어가 있다 — Validated in Phase 3: reader-core-reading-loop-no-payment
- [x] 독자 디스커버리에 간소화된 인기/추천 지표(조회수·좋아요·다음화 이동률 등)가 반영된다 — Validated in Phase 3: reader-core-reading-loop-no-payment
- [x] Gemini 생성이 공통 프로바이더 어댑터(`ProviderClient`)로 이관된 뒤에도 멘션·프리셋·문체·초안/제안 파싱이 그대로 동작한다 (PROV-01) — Validated in Phase 8: provider-adapter-idempotent-debit
- [x] 같은 AI 호출을 재시도해도 지갑 토큰이 한 번만 차감된다 — 전송마다 고정 idempotencyKey (COST-01) — Validated in Phase 8: provider-adapter-idempotent-debit

### Active

- [ ] 작가가 본문 에디터에서 `@` 멘션으로 설정 문서를 선택 주입하고 AI로 본문을 생성/어시스트 받을 수 있다 (외부 LLM API 1개 벤더, 플랫폼 키)
- [ ] 작가가 3단계 프리셋(초보자/중급자/자유형) 중 선택해 AI 톤을 제어할 수 있다
- [ ] 유저가 실제 결제(PG 연동)로 토큰을 충전하고, 유료 회차 열람 등에 토큰을 소비할 수 있다
- [ ] 운영자가 신고된/문제 있는 콘텐츠를 수동으로 검토하고 조치할 수 있는 최소한의 운영 도구가 있다
- [ ] 작가가 Gemini 외 다른 AI 제공자(OpenAI, Anthropic)를 선택해 집필 기능을 쓸 수 있다 (v1.1)
- [ ] 작가가 자신의 API 키를 등록(BYOK)해 플랫폼 토큰 차감 없이 AI를 쓸 수 있다 (v1.1)
- [ ] 작가가 평소 쓰는 구독형 AI에서 MCP로 자신의 작품·설정집을 읽고 초안을 저장할 수 있다 (v1.1)

### Out of Scope

- 에셋 스토어(설정집/프롬프트 판매 마켓플레이스) — v1 핵심 루프(집필-열람-결제) 검증 이후로 유예
- 토큰 현금 환전(Cash-out, 작가 정산) — 초기엔 수익이 AI 비용을 상쇄하는 데 집중, 작가 정산은 별도 트랙
- SLM 기반 비동기 자동 사전검수(시놉시스-본문 정합성, 표절 탐지) 파이프라인 — 베타 규모에서는 운영자 수동 검토로 대체
- 스크롤 심도 기반 정밀 유효완독률 알고리즘 — 간소화 지표로 시작, 데이터 쌓이면 고도화
- 3-Strike 자동 제재 체계 — 수동 검토 체계 안정화 이후 고려
- 구독제(월정액 무제한 열람) — 정기결제(빌링) 인프라가 없어 v1엔 구현하지 않음. 지금은 개발하지 않고, v1 핵심 루프(소장형 결제) 검증 이후 별도 마일스톤에서 재검토할 후보 기능으로 명시 (REQUIREMENTS.md PAY-04)

## Context

- `docs/` 폴더에 서비스 전체 기획서(개요, 핵심기능, BM/정책, 아키텍처, 독자/집필/에셋스토어/결제 UI설계) 8개 문서가 이미 존재. 이 문서들은 "완성형 서비스"의 최종 그림이며, 이번 마일스톤은 그중 핵심 루프만 잘라낸 MVP.
- 저장소는 `create-next-app` 스캐폴드 상태(Next.js 16 / React 19 / Tailwind 4)로 실제 기능 코드는 아직 없음.
- 원기획서(docs/4)는 Supabase(PostgreSQL/pgvector/Vault) + Vercel + Zustand 스택을 전제로 함 — MVP도 이 스택을 기본으로 이어받되, 세부 채택 여부는 리서치/roadmap 단계에서 재확인.
- 베타 유저는 특정 커뮤니티(작가/독자)를 통해 모집하며, 초대 인원 제한 없이 열 계획. 실제로 얼마나 모일지는 미지수.
- AI 비용은 플랫폼이 부담하되, 실제 결제(토큰 충전)로 들어오는 매출이 이를 상쇄하도록 설계 — 결제 시스템을 처음부터 실제로 구현하는 이유.
- **실행(execute-phase) 방식**: 계획(plan-phase)까지는 GSD 표준(Claude Code 서브에이전트: researcher/roadmapper/planner/verifier, model_profile=balanced)을 그대로 쓴다. 단 실제 코드 구현은 GSD 표준 executor가 아니라, Claude(이 세션)가 `agy --print --dangerously-skip-permissions --output-format json`으로 Antigravity CLI를 직접 호출해 위임하고, 결과를 GSD verifier로 검증하는 방식을 쓴다. TDD(테스트 먼저 작성 → 구현) 방식을 PLAN.md에 명시해 AGY가 따르게 한다.

## Constraints

- **비용 구조**: AI 추론 비용은 실비이며 플랫폼이 선부담 — 결제로 유입되는 매출이 이를 상쇄해야 지속 가능. 결제 미구현 상태로 무제한 오픈하지 않는다.
- **AI 벤더**: v1.0은 Google Gemini 단일 벤더 + 플랫폼 키. v1.1부터 OpenAI·Anthropic을 어댑터로 추가하고 BYOK를 허용하되, 플랫폼 키 모드의 비용 통제 구조는 그대로 유지한다.
- **기술 스택 연속성**: 기존 docs 기획서와 현재 스캐폴드(Next.js/React/Tailwind)를 최대한 존중.
- **커뮤니티 베타**: 정식 마케팅이 아닌 커뮤니티 배포 기반 — 초기 온보딩/가입 마찰을 낮게 유지해야 함.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 결제는 모의(mock) 토큰이 아닌 실제 PG 연동으로 처음부터 구현, PG는 Toss Payments 직접 연동 | 유저 규모를 인위적으로 제한하고 싶지 않고, 결제 매출로 AI 비용을 자동 상쇄하는 구조를 원함. Toss는 카드/카카오페이/네이버페이/토스페이를 위젯 하나로 커버 | 결정됨 |
| AI 벤더는 1개만, 플랫폼 키로 운영 (BYOK는 v2) — 벤더는 Google Gemini | MVP 복잡도를 낮추고 비용 통제를 결제 시스템 하나로 단순화 | 결정됨 — v1.1에서 멀티 프로바이더 + BYOK로 확장 |
| v1.1 추가 제공자는 OpenAI, Anthropic 2개로 한정 | docs/ai-integration-roadmap.md 기준. 커스텀 OpenAI 호환 엔드포인트는 범위 밖 | 결정됨 |
| BYOK 모드는 플랫폼 AI 토큰을 차감하지 않는다 | 사용자가 자기 비용으로 호출하므로 이중 과금이 됨. 사용 기록만 남겨 한도·남용 방지에 사용 | 결정됨 |
| MCP는 원격 HTTP + OAuth 계정 연결, 읽기 + 초안 저장까지만 | 설치 없이 공식 커넥터 경로를 타고, 외부 AI가 기존 본문을 덮어쓰지 못하게 초안/제안으로만 되돌린다 | 결정됨 |
| BYOK 키 암호화 저장 방식은 리서치 단계에서 결정 | Supabase Vault와 앱 레벨 AES-GCM의 현재 지원 상태·운영 부담 비교 필요 | — Pending |
| 랭킹/큐레이션은 간소화 지표로 시작 | 스크롤 심도 알고리즘은 정밀 설계·튜닝 비용이 크고, 베타에서는 반응 확인이 우선 | — Pending |
| SLM 자동 사전검수 대신 운영자 수동 검토 | 베타 규모에서는 자동화 인프라(Cloud Run 큐 등) 구축 비용 대비 효용이 낮음 | — Pending |
| 비용 상한에 로컬 입력 토큰 추정을 쓰지 않는다 — 출력 상한은 잔액 전체 기준, 차감은 실사용량을 호출 전 잔액까지만 | 실측에서 로컬 추정이 실제의 약 3배로 부정확했고, 호출 전 입력 비용 예약은 잔액이 바닥난 사용자에게만 의미가 있음 (2026-09-18) | 결정됨 — 사고 토큰 차감 여부는 미결(Phase 8 bugs/BUG-04) |
| 에셋 스토어는 v1 범위 밖 | 집필-열람-결제 핵심 루프 검증이 먼저 | — Pending |
| 실제 코드 구현은 GSD 표준 executor 대신 Antigravity CLI(`agy`)로 위임 | 사용자가 이미 사용 중인 별도 코딩 에이전트 CLI를 구현 단계에 활용하고 싶어함. `agy --print --dangerously-skip-permissions --output-format json`으로 비대화형 호출 가능함을 확인 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-18 — Phase 8 완료 (프로바이더 어댑터 + 멱등 차감, 로컬 토큰 추정 제거)*
*Previously updated: 2026-09-08 — added 구독제(월정액) to Out of Scope as an explicit v2 candidate (per Phase 6 discussion follow-up)*

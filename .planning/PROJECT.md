# NovelScript

## What This Is

LLM API 기반의 인터랙티브 웹소설 창작·열람 플랫폼의 MVP다. 작가는 멘션(`@`) 기반 컨텍스트 주입 에디터(웹 IDE)로 AI와 협업하며 설정 붕괴 없이 연재하고, 독자는 큐레이션된 뷰어에서 몰입해서 읽는다. 결제(토큰 충전)로 들어온 수익이 AI 추론 비용을 상쇄하는 구조로, 커뮤니티를 통해 모은 베타 유저(작가/독자)를 대상으로 반응을 검증한다.

## Core Value

작가가 이 IDE로 실제로 반복해서 집필하고, 독자가 그 결과물에 몰입해서 완독·연독한다 — 창작과 소비 양쪽 루프가 동시에 성립해야 의미가 있다. 한쪽만 되는 건 실패로 간주한다.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 작가가 마크다운 지식베이스(인물/장소/사건/세력/아이템)를 만들고 관리할 수 있다
- [ ] 작가가 본문 에디터에서 `@` 멘션으로 설정 문서를 선택 주입하고 AI로 본문을 생성/어시스트 받을 수 있다 (외부 LLM API 1개 벤더, 플랫폼 키)
- [ ] 작가가 3단계 프리셋(초보자/중급자/자유형) 중 선택해 AI 톤을 제어할 수 있다
- [ ] 작가가 회차를 등록/발행할 수 있다
- [ ] 독자가 작품을 탐색(디스커버리)하고 회차를 읽을 수 있는 뷰어가 있다
- [ ] 독자 디스커버리에 간소화된 인기/추천 지표(조회수·좋아요·다음화 이동률 등)가 반영된다
- [ ] 유저가 실제 결제(PG 연동)로 토큰을 충전하고, 유료 회차 열람 등에 토큰을 소비할 수 있다
- [ ] 운영자가 신고된/문제 있는 콘텐츠를 수동으로 검토하고 조치할 수 있는 최소한의 운영 도구가 있다

### Out of Scope

- 에셋 스토어(설정집/프롬프트 판매 마켓플레이스) — v1 핵심 루프(집필-열람-결제) 검증 이후로 유예
- BYOK(외부 API 키 연동) — v1은 플랫폼 키 단일 운영으로 시작, 헤비 유저 대응은 반응 확인 후 추가
- 토큰 현금 환전(Cash-out, 작가 정산) — 초기엔 수익이 AI 비용을 상쇄하는 데 집중, 작가 정산은 별도 트랙
- SLM 기반 비동기 자동 사전검수(시놉시스-본문 정합성, 표절 탐지) 파이프라인 — 베타 규모에서는 운영자 수동 검토로 대체
- 스크롤 심도 기반 정밀 유효완독률 알고리즘 — 간소화 지표로 시작, 데이터 쌓이면 고도화
- 3-Strike 자동 제재 체계 — 수동 검토 체계 안정화 이후 고려

## Context

- `docs/` 폴더에 서비스 전체 기획서(개요, 핵심기능, BM/정책, 아키텍처, 독자/집필/에셋스토어/결제 UI설계) 8개 문서가 이미 존재. 이 문서들은 "완성형 서비스"의 최종 그림이며, 이번 마일스톤은 그중 핵심 루프만 잘라낸 MVP.
- 저장소는 `create-next-app` 스캐폴드 상태(Next.js 16 / React 19 / Tailwind 4)로 실제 기능 코드는 아직 없음.
- 원기획서(docs/4)는 Supabase(PostgreSQL/pgvector/Vault) + Vercel + Zustand 스택을 전제로 함 — MVP도 이 스택을 기본으로 이어받되, 세부 채택 여부는 리서치/roadmap 단계에서 재확인.
- 베타 유저는 특정 커뮤니티(작가/독자)를 통해 모집하며, 초대 인원 제한 없이 열 계획. 실제로 얼마나 모일지는 미지수.
- AI 비용은 플랫폼이 부담하되, 실제 결제(토큰 충전)로 들어오는 매출이 이를 상쇄하도록 설계 — 결제 시스템을 처음부터 실제로 구현하는 이유.

## Constraints

- **비용 구조**: AI 추론 비용은 실비이며 플랫폼이 선부담 — 결제로 유입되는 매출이 이를 상쇄해야 지속 가능. 결제 미구현 상태로 무제한 오픈하지 않는다.
- **AI 벤더**: MVP는 외부 LLM API 1개 벤더만 지원 (플랫폼 키로 호출). 벤더 선정은 리서치 단계에서 확정.
- **기술 스택 연속성**: 기존 docs 기획서와 현재 스캐폴드(Next.js/React/Tailwind)를 최대한 존중.
- **커뮤니티 베타**: 정식 마케팅이 아닌 커뮤니티 배포 기반 — 초기 온보딩/가입 마찰을 낮게 유지해야 함.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 결제는 모의(mock) 토큰이 아닌 실제 PG 연동으로 처음부터 구현 | 유저 규모를 인위적으로 제한하고 싶지 않고, 결제 매출로 AI 비용을 자동 상쇄하는 구조를 원함 | — Pending |
| AI 벤더는 1개만, 플랫폼 키로 운영 (BYOK는 v2) | MVP 복잡도를 낮추고 비용 통제를 결제 시스템 하나로 단순화 | — Pending |
| 랭킹/큐레이션은 간소화 지표로 시작 | 스크롤 심도 알고리즘은 정밀 설계·튜닝 비용이 크고, 베타에서는 반응 확인이 우선 | — Pending |
| SLM 자동 사전검수 대신 운영자 수동 검토 | 베타 규모에서는 자동화 인프라(Cloud Run 큐 등) 구축 비용 대비 효용이 낮음 | — Pending |
| 에셋 스토어는 v1 범위 밖 | 집필-열람-결제 핵심 루프 검증이 먼저 | — Pending |

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
*Last updated: 2026-08-25 after initialization*

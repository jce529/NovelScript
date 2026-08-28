# Requirements: NovelScript

**Defined:** 2026-08-25
**Core Value:** 작가가 이 IDE로 실제로 반복해서 집필하고, 독자가 그 결과물에 몰입해서 완독·연독한다 — 창작과 소비 양쪽 루프가 동시에 성립해야 의미가 있다.

## v1 Requirements

### Auth (AUTH)

- [x] **AUTH-01**: User can sign up/log in via social login (Kakao 또는 Google 중 1개 이상)
- [x] **AUTH-02**: One account serves both reader and writer roles — no separate signup flow; a "글쓰기 시작하기" entry point upgrades the same account
- [x] **AUTH-03**: User session persists across visits/browser refresh

### Knowledge Base (KB)

- [ ] **KB-01**: Writer can create, edit, and delete KB documents across 5 templates (인물/장소/사건/세력/아이템)
- [ ] **KB-02**: Writer can browse their KB documents in an IDE-style folder/file tree, organized by template type (인물/장소/사건/세력/아이템), scoped per work (amended in Phase 2 discussion — see `.planning/phases/02-studio-core-writer-loop-no-ai/02-CONTEXT.md`; supersedes the original "flat, filterable list" framing)

### Editor / AI Generation (EDIT)

- [ ] **EDIT-01**: Writer can insert `@`-mention references to KB documents via autocomplete search by name/type
- [ ] **EDIT-02**: Writer can see a visible list of currently-mentioned/in-context documents before generating
- [ ] **EDIT-03**: Writer can select one of 3 tone presets (초보자/중급자/자유형), with 자유형 offering a custom-instruction textarea
- [ ] **EDIT-04**: Writer can trigger AI generation that sends mentioned KB docs + preset + instruction to Gemini and inserts the result into the canvas
- [ ] **EDIT-05**: Writer sees a token/cost estimate before generating

### Content / Publishing (CONT)

- [ ] **CONT-01**: Writer can create and save chapter drafts with title and order
- [ ] **CONT-02**: Writer can publish a chapter, marking it free or paid with a price
- [ ] **CONT-03**: Writer can edit or unpublish their own chapters after publishing

### Reader / Discovery (READ)

- [ ] **READ-01**: Reader can browse a discovery feed showing cover, title, synopsis, and a simplified ranking signal (views/likes/next-chapter click-through)
- [ ] **READ-02**: Reader can read chapters in a viewer with prev/next chapter navigation and a table of contents
- [ ] **READ-03**: Reader can adjust font size and toggle a dark/alternate theme in the viewer
- [ ] **READ-04**: Reader's last-read chapter is remembered and resumed on return (이어보기)
- [ ] **READ-05**: Reader can report a novel or chapter for review from the detail page or viewer

### Payments (PAY)

- [ ] **PAY-01**: User can purchase tokens through Toss Payments and see the charge reflected as a wallet balance
- [ ] **PAY-02**: User can spend tokens to unlock a paid chapter, with balance deducted atomically at unlock time
- [ ] **PAY-03**: Wallet balance is only credited by a verified Toss webhook event, never by a client-side redirect/return callback

### Admin / Moderation (ADMIN)

- [ ] **ADMIN-01**: Admin can view a queue of open reports (reporter, target content, reason category, timestamp, status)
- [ ] **ADMIN-02**: Admin can unpublish/blind a specific chapter
- [ ] **ADMIN-03**: Admin can warn, suspend, or ban a user account with a logged reason, and view that user's past reports/actions
- [ ] **ADMIN-04**: Admin can mark a report resolved or dismissed with a short note

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Editor

- **EDIT-06**: Wiki-linking (`[[ ]]`) between KB documents
- **EDIT-07**: Dynamic recommended-prompt chips for beginner-tier writers
- **EDIT-08**: Ghost-text inline AI continuation (Tab-to-accept)

### Reader

- **READ-06**: Reader-facing opt-in "AI로 작성됨" / lore-wiki showcase

### Admin

- **ADMIN-05**: Report queue search/filter, audit log UI, canned-response templates

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 에셋 스토어 (설정집/프롬프트 마켓플레이스) | v1 핵심 루프(집필-열람-결제) 검증 이후로 유예 |
| BYOK (외부 API 키 연동) | v1은 플랫폼 키 단일 운영, 헤비 유저 대응은 반응 확인 후 |
| 토큰 현금 환전 (작가 정산/Cash-out) | 초기엔 매출이 AI 비용을 상쇄하는 데 집중 |
| SLM 기반 자동 사전검수 파이프라인 | 베타 규모에서는 운영자 수동 검토(ADMIN-01~04)로 대체 |
| 정밀 스크롤 심도 기반 유효완독률 알고리즘 | 간소화 지표(READ-01)로 시작 |
| 3-Strike 자동 제재 체계 | 계정 조치는 v1에서 전부 수동 판단(ADMIN-03) |
| 3패널 AI 협업 캔버스 (`@`멘션 컨텍스트 주입, 전용 시스템프롬프트 모달, KB 그래프 뷰), 파일트리 내 드래그앤드롭 이동 | 멘션 기반 컨텍스트 주입 메커니즘 자체를 먼저 검증; UI 정교화는 그 다음. (Phase 2 amendment: 기본 폴더/파일 트리 탐색·생성·이름변경·삭제 자체는 범위에 포함됨 — 위 KB-02 참고. 드래그앤드롭 이동만 계속 범위 밖) |
| 실시간 색상 그라데이션 비용 게이지 / 관계 지역성 가중치 | 단순 추정치(EDIT-05)로 충분, 튜닝은 사용 데이터 확보 후 |
| PortOne 등 PG 추상화 레이어 | Toss Payments 직접 연동으로 확정 (founder decision, 2026-08-25) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Mapped |
| AUTH-02 | Phase 1 | Mapped |
| AUTH-03 | Phase 1 | Mapped |
| KB-01 | Phase 2 | Mapped |
| KB-02 | Phase 2 | Mapped |
| EDIT-01 | Phase 4 | Mapped |
| EDIT-02 | Phase 4 | Mapped |
| EDIT-03 | Phase 4 | Mapped |
| EDIT-04 | Phase 4 | Mapped |
| EDIT-05 | Phase 4 | Mapped |
| CONT-01 | Phase 2 | Mapped |
| CONT-02 | Phase 2 | Mapped |
| CONT-03 | Phase 2 | Mapped |
| READ-01 | Phase 3 | Mapped |
| READ-02 | Phase 3 | Mapped |
| READ-03 | Phase 3 | Mapped |
| READ-04 | Phase 3 | Mapped |
| READ-05 | Phase 3 | Mapped |
| PAY-01 | Phase 5 | Mapped |
| PAY-02 | Phase 6 | Mapped |
| PAY-03 | Phase 5 | Mapped |
| ADMIN-01 | Phase 7 | Mapped |
| ADMIN-02 | Phase 7 | Mapped |
| ADMIN-03 | Phase 7 | Mapped |
| ADMIN-04 | Phase 7 | Mapped |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0 ✓ (fully mapped — see .planning/ROADMAP.md)

---
*Requirements defined: 2026-08-25*
*Last updated: 2026-08-28 — AUTH-01/02/03 checked off after Phase 1 completion*

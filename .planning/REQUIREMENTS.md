# Requirements: NovelScript

**Defined:** 2026-08-25
**Core Value:** 작가가 이 IDE로 실제로 반복해서 집필하고, 독자가 그 결과물에 몰입해서 완독·연독한다 — 창작과 소비 양쪽 루프가 동시에 성립해야 의미가 있다.

## v1 Requirements

### Auth (AUTH)

- [x] **AUTH-01**: User can sign up/log in via social login (Kakao 또는 Google 중 1개 이상)
- [x] **AUTH-02**: One account serves both reader and writer roles — no separate signup flow; a "글쓰기 시작하기" entry point upgrades the same account
- [x] **AUTH-03**: User session persists across visits/browser refresh

### Knowledge Base (KB)

- [x] **KB-01**: Writer can create, edit, and delete KB documents across 5 templates (인물/장소/사건/세력/아이템)
- [x] **KB-02**: Writer can browse their KB documents in an IDE-style folder/file tree, organized by template type (인물/장소/사건/세력/아이템), scoped per work (amended in Phase 2 discussion — see `.planning/phases/02-studio-core-writer-loop-no-ai/02-CONTEXT.md`; supersedes the original "flat, filterable list" framing)
- [x] **KB-03**: Writer can create new folders (not just documents) at any point in the KB tree except the two root containers themselves (the work root and the account-shared root) — including brand-new user-defined top-level folders directly under a work or under the account-shared space, with no template auto-applied to user-defined folders (added in Phase 04.1 discussion — see `.planning/phases/04.1-kb/04.1-CONTEXT.md`)
- [x] **KB-04**: The account-level KB space is a "계정 공유 폴더" root containing multiple top-level shared folders (the existing `template` folder plus any user-created shared folders, e.g. world-bible content meant to be reused across works); every document inside it is mentionable (`@`) from any of the writer's works, one-directionally (added in Phase 04.1 discussion)
- [x] **KB-05**: 회차(chapters) appear as a fixed, locked "회차" folder inside each work's KB tree (alongside template/인물/장소/사건/세력/아이템), and writers can create sub-folders inside it to organize episodes (e.g. story arcs); individual chapter items keep all existing fields/behavior (title, draft/publish state, price tier, view count) unchanged — chapters remain a distinct, non-mentionable content type, not merged into generic KB documents (added in Phase 04.1 discussion)

### Editor / AI Generation (EDIT)

- [x] **EDIT-01**: Writer can insert `@`-mention references to KB documents via autocomplete search by name/type
- [x] **EDIT-02**: Writer can see a visible list of currently-mentioned/in-context documents before generating
- [x] **EDIT-03**: Writer can select one of 3 tone presets (초보자/중급자/자유형), with 자유형 offering a custom-instruction textarea
- [x] **EDIT-04**: Writer can trigger AI generation that sends mentioned KB docs + preset + instruction to Gemini and inserts the result into the canvas
- [x] **EDIT-05**: Writer sees a token/cost estimate before generating

### Content / Publishing (CONT)

- [x] **CONT-01**: Writer can create and save chapter drafts with title and order
- [x] **CONT-02**: Writer can publish a chapter, marking it free or paid with a price
- [x] **CONT-03**: Writer can edit or unpublish their own chapters after publishing

### Reader / Discovery (READ)

- [x] **READ-01**: Reader can browse a discovery feed showing cover, title, synopsis, and a simplified ranking signal (views/likes/next-chapter click-through)
- [x] **READ-02**: Reader can read chapters in a viewer with prev/next chapter navigation and a table of contents
- [x] **READ-03**: Reader can adjust font size and toggle a dark/alternate theme in the viewer
- [x] **READ-04**: Reader's last-read chapter is remembered and resumed on return (이어보기)
- [x] **READ-05**: Reader can report a novel or chapter for review from the detail page or viewer
- [x] **READ-07**: Reader can toggle a per-work new-chapter notification subscription (알림) from the work detail page header, login-gated; subscription state persists to the account. Actual delivery channel (push/email/in-app inbox) is not defined by this requirement and remains open for a later phase — v1 scope is the subscription toggle and its persisted state only.
- [x] **READ-08**: Reader can save/unsave a work to a personal 선호작 (bookmark) list from the work detail page header, login-gated — distinct from the 좋아요 (like) action, which remains a separate count-based control.
- [x] **READ-09**: Home/discovery screen displays a promotional banner slot above the "최근 읽은 작품" section — a static content slot (no scheduling/targeting system implied).

### Payments (PAY)

- [ ] **PAY-01**: User can purchase tokens through Toss Payments and see the charge reflected as a wallet balance
- [ ] **PAY-02**: User can spend tokens to unlock a paid chapter, with balance deducted atomically at unlock time; the chapter's author is credited 90% of the spent tokens, with the remaining 10% retained as a platform fee. This 90/10 split is a **provisional figure** (not final — subject to revision), and must be implemented behind a single adjustable constant rather than hardcoded inline (see `.planning/phases/06-paid-chapter-unlock/06-CONTEXT.md` D-10)
- [ ] **PAY-03**: Wallet balance is only credited by a verified Toss webhook event, never by a client-side redirect/return callback

### Admin / Moderation (ADMIN)

- [ ] **ADMIN-01**: Admin can view a queue of open reports (reporter, target content, reason category, timestamp, status)
- [ ] **ADMIN-02**: Admin can unpublish/blind a specific chapter
- [ ] **ADMIN-03**: Admin can warn, suspend, or ban a user account with a logged reason, and view that user's past reports/actions
- [ ] **ADMIN-04**: Admin can mark a report resolved or dismissed with a short note

## v1.1 Requirements (멀티 프로바이더 AI · BYOK · 구독형 AI MCP)

**Defined:** 2026-09-16 · **Milestone:** v1.1 · **Phases:** 8~ (v1.0 잔여 Phase 5/6/7은 별도 트랙)

### 프로바이더 추상화 · 선택 (PROV)

- [x] **PROV-01**: 작가가 공통 프로바이더 어댑터로 이관된 뒤에도 기존과 똑같이 Gemini로 생성할 수 있다 — 멘션 주입, 3단계 프리셋, 4종 문체, `[REPLY]/[DRAFT]/[DOCUMENT]` 초안·제안 파싱이 모두 그대로 동작한다
- [ ] **PROV-02**: 작가가 OpenAI 모델을 선택해 본문 생성·어시스트를 받을 수 있다 (비스트리밍, 고정 base URL)
- [ ] **PROV-03**: 작가가 Anthropic 모델을 선택해 본문 생성·어시스트를 받을 수 있다 (비스트리밍, 고정 base URL)
- [ ] **PROV-04**: 작가가 계정 설정에서 기본 제공자·모델을 지정하고, AI 패널 드롭다운에서 이번 호출만 다른 제공자·모델로 전환할 수 있다
- [ ] **PROV-05**: 모델 피커에는 작가가 실제로 호출 가능한 모델만 나타나고, 각 모델에 `BYOK` / `서비스 키` 배지가 붙어 누가 비용을 내는지 선택 시점에 보인다 (전역 모드 토글 없음)
- [ ] **PROV-06**: 선택한 제공자·모델을 쓸 수 없을 때 작가는 무엇으로 대체됐는지 화면에서 보고 진행 여부를 결정한다 — 서비스 키↔BYOK 간 조용한 전환은 일어나지 않는다
- [ ] **PROV-07**: 서비스 키 모드에서 작가는 선택한 제공자·모델의 실제 단가가 반영된 비용 추정치를 생성 전에 본다 (Gemini 단가를 다른 제공자에 재사용하지 않는다)

### BYOK 키 관리 (BYOK)

- [ ] **BYOK-01**: 작가가 계정 설정 화면에서 제공자별로 자신의 API 키를 등록할 수 있다 (제공자당 1개)
- [ ] **BYOK-02**: 서버가 저장 전에 제공자의 모델 목록 엔드포인트로 키의 유효성·소유권을 검증하고, 실패하면 활성 키로 저장하지 않는다 (실제 생성 호출로 검증해 사용자에게 과금하지 않는다)
- [ ] **BYOK-03**: 저장된 키는 제공자·끝 4자리·등록일과 `연결됨/검증 실패/미등록` 상태로만 표시되고, 평문은 클라이언트 응답이나 로그로 다시 노출되지 않는다
- [ ] **BYOK-04**: 작가가 키를 삭제할 수 있고, 삭제 시 해당 제공자가 어떻게 되는지 안내받는다. 삭제된 키가 기본 선택이었다면 선택이 자동 대체된다. 교체는 삭제 후 재등록으로 이뤄진다
- [ ] **BYOK-05**: 무효·폐기된 키 / 레이트리밋 / 크레딧 소진 / 타임아웃·장애 네 가지 실패가 각각 구분되는 메시지로 안내되고, 경우마다 키 상태 변화와 재시도 동작이 다르다 (무효 키만 `검증 실패`로 표시, 자동 재시도 없음, 서비스 키로 자동 폴백하지 않음)
- [ ] **BYOK-06**: BYOK 모델로 호출하면 플랫폼 토큰이 전혀 차감되지 않고, 지갑 잔액이 0이어도 호출이 차단되지 않는다
- [ ] **BYOK-07**: 작가가 이번 달 제공자별 BYOK 호출 수·토큰 수·예상 비용(금액)을 볼 수 있다
- [ ] **BYOK-08**: BYOK 모델을 선택하면 AI 패널의 지갑 토큰 비용 게이지가 숨겨진다
- [ ] **BYOK-09**: BYOK 호출은 서비스 키 호출보다 높은 1회 출력 토큰 상한을 사용한다

### AI 과금 경로 (COST)

- [x] **COST-01**: 서비스 키 호출의 토큰 차감이 멱등하다 — 같은 호출이 재시도돼도 두 번 차감되지 않는다 (현재 매 호출 랜덤 `reference_id`를 넘겨 RPC 중복 방지가 무력화된 상태를 수정)
- [ ] **COST-02**: 모든 AI 호출이 지갑 원장과 분리된 사용 기록에 남아 제공자·모델·토큰 수를 조회할 수 있다 — 지갑 원장에는 0원 행이 기록되지 않는다

### MCP 서버 (MCP)

- [ ] **MCP-01**: 작가가 Claude에서 NovelScript를 커스텀 커넥터로 연결하고, OAuth 계정 연결로 자기 계정 데이터에만 접근하도록 승인할 수 있다
- [ ] **MCP-02**: 연결된 AI가 작가의 작품 목록·회차 목록·회차 본문을 조회할 수 있다
- [ ] **MCP-03**: 연결된 AI가 작가의 설정집 문서를 검색하고 내용을 읽을 수 있다
- [ ] **MCP-04**: 연결된 AI가 멘션 방식 집필 컨텍스트 번들(설정집 + 프리셋 + 문체 조합)을 한 번에 받아 앱 안에서와 같은 구성으로 초안을 쓸 수 있다
- [ ] **MCP-05**: 연결된 AI가 특정 회차에 '제안된 초안'을 저장할 수 있고, 기존 본문은 어떤 경우에도 덮어쓰이지 않는다 (본문 직접 수정 툴 자체를 제공하지 않는다)
- [ ] **MCP-06**: 연결된 AI가 설정집 문서의 신규 생성안 또는 기존 문서 수정안을 제안할 수 있고, 수정안은 작가가 원문과 나란히 비교해 수락/거절한다
- [ ] **MCP-07**: 작가가 스튜디오에서 MCP로 도착한 초안·제안을 출처(어느 클라이언트에서, 언제)와 함께 검토하고 수락 또는 거절할 수 있다
- [ ] **MCP-08**: 작가가 NovelScript에서 연결된 클라이언트 목록과 마지막 사용 시각을 보고 연결을 해제할 수 있으며, 해제 후에는 해당 토큰의 접근이 즉시 차단된다
- [ ] **MCP-09**: 모든 MCP 툴에 읽기/쓰기 성격 annotation이 붙어, 클라이언트가 읽기 툴에 불필요한 확인을 요구하지 않는다

**v1.1 범위 노트**

- **MCP 인수 기준 클라이언트는 Claude.** ChatGPT는 쓰기 가능한 커스텀 커넥터를 Business/Enterprise/Edu 워크스페이스로 제한하고 Free는 커스텀 MCP 자체를 차단하므로, 개인 Plus 작가에게 MCP-05~07이 도달하지 못할 수 있다. ChatGPT는 best-effort로 문서화하며 성공 기준에 넣지 않는다.
- **1차(PROV/BYOK/COST)와 2차(MCP)는 코드를 공유하지 않는다.** BYOK는 "우리가 남의 비밀을 보관해 밖으로 호출", MCP OAuth는 "우리가 비밀을 발급해 밖에서 들어옴" — 방향이 반대이므로 하나의 '인증 페이즈'로 묶지 않는다.
- **로컬 토큰 추정이 어댑터 리팩터링의 숨은 선행 조건이다.** 원격 `countTokens`는 Gemini만 제공하므로 어댑터 시그니처에 넣을 수 없다. 사전 상한은 로컬 추정, 사후 차감은 제공자가 반환한 실사용량 기준.
- **멱등 차감(COST-01)이 재시도 로직보다 먼저 와야 한다.** 순서가 뒤집히면 429 재시도가 이중 차감을 만든다.
- **BYOK 경로는 "상한 0인 서비스 경로"가 아니다.** 현재 `maxOutputTokens <= 0`에서 하드 에러를 던지는 분기를 BYOK에서는 구조적으로 건너뛰어야 한다.

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

### v1.1 후속 (AI / MCP)

- **PROV-08**: 한국 소설 창작 관점의 모델 힌트 1줄("대사체가 자연스러움" 등) — 실사용 데이터 확보 후
- **BYOK-10**: 사용자별 월간 BYOK 호출 상한 (남용 방지) — `ai_usage` 데이터가 필요성을 보여줄 때
- **MCP-10**: MCP prompts로 3단계 프리셋 × 4종 문체를 슬래시 커맨드로 노출 — 대상 클라이언트가 prompts를 실제로 렌더링하는 것이 확인된 뒤
- **MCP-11**: MCP resources로 설정집 문서 노출 — 지원 클라이언트가 소비하는 것이 확인된 뒤

### Payments

- **PAY-04**: 구독제(월정액 무제한 열람) — 정기결제(빌링) 인프라가 필요하며 v1엔 존재하지 않음. 지금 당장 개발하지 않고, v1 핵심 루프(소장형 결제) 검증 이후 별도 마일스톤에서 재검토할 후보 기능으로만 명시한다. Phase 6(06-CONTEXT.md D-09)에서 v1 범위 밖으로 확인됨.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 에셋 스토어 (설정집/프롬프트 마켓플레이스) | v1 핵심 루프(집필-열람-결제) 검증 이후로 유예 |
| ~~BYOK (외부 API 키 연동)~~ | v1.0 한정 제외였음 — **v1.1에서 범위 안으로 이동** (BYOK-01~09) |
| 커스텀 OpenAI 호환 엔드포인트 / 로컬 모델 (Ollama, LM Studio, OpenRouter, LiteLLM) | 서버를 임의 외부 HTTP 프록시로 만들어 SSRF 노출·응답 형태 불확정·단가 추정 불가. 고정 3개 제공자로 한정 |
| 전역 "BYOK 모드" on/off 토글 | 지난주에 켠 모드는 오늘 누가 돈 내는지 알려주지 못함. 모드는 선택한 모델 + 키 존재 여부에서 파생되고 피커 배지로 노출 (PROV-05) |
| BYOK 실패 시 서비스 키로 자동 폴백 | 플랫폼 과금을 거부한 사용자에게 조용히 플랫폼 비용을 쓰게 됨. 실패는 가시적으로 알리고 1탭 재시도 버튼으로 명시 동의 (BYOK-05) |
| 스트리밍 응답 | 현재 패널이 전체 응답 텍스트에서 `[REPLY]/[DRAFT]/[DOCUMENT]` 블록을 파싱하는 구조 — 스트리밍은 응답 프로토콜 교체가 선행돼야 하는 별도 마일스톤 |
| 제공자당 다중 키 / 모델별 키 스코핑 | 페르소나는 계정 하나를 쓰는 1인 작가. 선택 UI·폴백·검증 상태가 N배로 늘어남. 제공자당 1키, 교체는 삭제+재등록 |
| MCP 회차 본문 직접 수정 툴 (`update_chapter_body` 류) | 프롬프트 인젝션 하나로 발행 본문이 조용히 재작성될 수 있음. 초안/제안 객체만 제공해 구조적으로 차단 (MCP-05) |
| MCP 성공 기준에 ChatGPT E2E 검증 포함 | ChatGPT가 쓰기 가능 커스텀 커넥터를 Business/Enterprise/Edu로 제한 — 개인 Plus 작가에게 달성 불가능한 기준이 됨. Claude만 검증 대상 |
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
| KB-03 | Phase 04.1 | Mapped |
| KB-04 | Phase 04.1 | Mapped |
| KB-05 | Phase 04.1 | Mapped |
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
| READ-07 | Phase 3 | Mapped |
| READ-08 | Phase 3 | Mapped |
| READ-09 | Phase 3 | Mapped |
| PAY-01 | Phase 5 | Mapped |
| PAY-02 | Phase 6 | Mapped |
| PAY-03 | Phase 5 | Mapped |
| ADMIN-01 | Phase 7 | Mapped |
| ADMIN-02 | Phase 7 | Mapped |
| ADMIN-03 | Phase 7 | Mapped |
| ADMIN-04 | Phase 7 | Mapped |

**v1.1 (멀티 프로바이더 AI · BYOK · 구독형 AI MCP)**

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROV-01 | Phase 8 | Complete |
| PROV-02 | Phase 9 | Mapped |
| PROV-03 | Phase 9 | Mapped |
| PROV-04 | Phase 9 | Mapped |
| PROV-05 | Phase 10 | Mapped |
| PROV-06 | Phase 11 | Mapped |
| PROV-07 | Phase 9 | Mapped |
| BYOK-01 | Phase 10 | Mapped |
| BYOK-02 | Phase 10 | Mapped |
| BYOK-03 | Phase 10 | Mapped |
| BYOK-04 | Phase 10 | Mapped |
| BYOK-05 | Phase 11 | Mapped |
| BYOK-06 | Phase 11 | Mapped |
| BYOK-07 | Phase 11 | Mapped |
| BYOK-08 | Phase 11 | Mapped |
| BYOK-09 | Phase 11 | Mapped |
| COST-01 | Phase 8 | Complete |
| COST-02 | Phase 11 | Mapped |
| MCP-01 | Phase 12 | Mapped |
| MCP-02 | Phase 13 | Mapped |
| MCP-03 | Phase 13 | Mapped |
| MCP-04 | Phase 13 | Mapped |
| MCP-05 | Phase 14 | Mapped |
| MCP-06 | Phase 14 | Mapped |
| MCP-07 | Phase 14 | Mapped |
| MCP-08 | Phase 12 | Mapped |
| MCP-09 | Phase 13 | Mapped |

**Coverage:**
- v1.0 requirements: 31 total / mapped 31 / unmapped 0 ✓ (Phases 1–04.1, 5–7)
- v1.1 requirements: 27 total (PROV 7 + BYOK 9 + COST 2 + MCP 9) / mapped 27 / unmapped 0 ✓ (Phases 8–14)
- 전체: 58 mapped, 0 unmapped ✓ (see .planning/ROADMAP.md)

---
*Requirements defined: 2026-08-25*
*Last updated: 2026-09-16 — v1.1 traceability mapped: PROV/BYOK/COST/MCP 27개 전수를 Phase 8~14에 배정 (roadmapper)*
*Previously updated: 2026-09-08 — PAY-02 amended: author-credit-on-unlock confirmed at 90/10 (provisional, D-10); added PAY-04 (구독제, v2 candidate) per Phase 6 discussion follow-up*
*Previously updated: 2026-08-31 — added KB-03/04/05 (custom folder creation, account-shared folder restructure, 회차 folder tree) for inserted Phase 04.1*

# Roadmap: NovelScript

## Overview

NovelScript ships as one Next.js app with two loops that must both work: writers drafting with mention-injected AI assistance, and readers discovering/consuming what gets published — bound together by a real-money token wallet. The build order follows the strongest cross-cutting signal from research: the wallet/ledger must be built and concurrency-proven with fake credits before any real AI spend or real payment code touches it, so a payment bug can never block AI validation and vice versa. Concretely: prove auth + the ledger first (Phase 1), build the writer's non-AI loop and the reader's non-payment loop independently on top of it (Phases 2-3), wire AI generation against the still-fake wallet with cost guardrails built in from day one (Phase 4), swap in real Toss Payments behind the same wallet interface (Phase 5), let the paid-chapter-unlock feature use both proven pieces together (Phase 6), and close the trust/safety loop last with the admin moderation surface (Phase 7). PG paperwork (사업자등록, Toss merchant application) should start in parallel from Phase 1's kickoff — it runs on an external ~2+ week clock independent of the engineering sequence below.

### v1.1 Overview (멀티 프로바이더 AI · BYOK · 구독형 AI MCP)

v1.1은 새 제품이 아니라 기존 `lib/ai/` 모듈의 증축 마일스톤이다 — 새 배포 단위도, 새 서비스도 없다. 마일스톤은 방향이 반대인 2단 구조를 가진다: 1단계(Phase 8~11)는 "NovelScript가 LLM을 호출한다"(멀티 프로바이더 어댑터 + BYOK), 2단계(Phase 12~14)는 "LLM이 NovelScript를 호출한다"(원격 MCP 서버). 두 단계는 공유 코드가 사실상 없으므로 하나의 '인증 페이즈'로 묶지 않는다. 빌드 순서는 리서치 4건이 독립적으로 도출한 동일한 결론을 따른다 — 벤더를 늘리기 전에 어댑터 추상화를 Gemini로 회귀 증명하고(Phase 8), 같은 페이즈에서 현존하는 멱등 차감 버그를 먼저 고친 뒤(재시도 로직이 이중 차감을 만들지 않도록), 플랫폼 키로 새 벤더를 증명하고(Phase 9), BYOK 키 보관·검증과 그 검증이 생산하는 모델 피커를 함께 올리고(Phase 10), BYOK 호출 경로를 엮은 뒤(Phase 11), 하드 경계를 넘어 MCP OAuth → 읽기 도구 → 쓰기 도구+리뷰 큐 순으로 간다(Phase 12~14). 외부 리드타임(OpenAI Organization Verification, Anthropic 빌링 tier)은 v1.0 Phase 5의 PG 심사와 같은 모양의 외부 큐이므로 Phase 8 킥오프와 **병행** 착수한다.

**v1.0 잔여 트랙:** Phase 5(Toss 결제) / Phase 6(작가 90:10 정산) / Phase 7(운영자 도구)은 v1.0 트랙에 그대로 남으며 v1.1 범위가 아니다.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Wallet Infrastructure** - Auth works, and the token wallet/ledger is proven safe with fake credits before anything real touches it (completed 2026-08-29)
- [x] **Phase 2: Studio Core (Writer Loop, No AI)** - Writers build a knowledge base and draft/publish chapters without AI involved (completed 2026-08-29)
- [x] **Phase 3: Reader Core (Reading Loop, No Payment)** - Readers discover and read published chapters end-to-end, all free at this stage (completed 2026-08-30)
- [x] **Phase 4: AI Gateway (Mention-Based Generation)** - Writers generate AI-assisted prose from mentioned KB docs, with cost guardrails from the start (completed 2026-08-30 — live GEMINI_API_KEY round-trip deferred, see 04-VERIFICATION.md)
- [x] **Phase 04.1: 사용자 정의 폴더 기능 (KB 커스텀 폴더 + 회차 폴더 트리)** (INSERTED) - Custom folder creation anywhere in the KB tree, 회차 as a fixed tree folder, account-shared folder space mentionable from any work (completed 2026-08-31)
- [ ] **Phase 5: Real Payment Integration** - Users convert real money into tokens via a verified, non-spoofable Toss Payments flow
- [ ] **Phase 6: Paid Chapter Unlock** - Users spend real tokens to unlock paid chapters (partially shipped outside GSD — see Phase 6 detail)
- [ ] **Phase 7: Admin Moderation Surface** - Admins review reports and take corrective action, closing the loop opened by reader reports

**v1.1 (멀티 프로바이더 AI · BYOK · 구독형 AI MCP) — 1단계: NovelScript가 LLM을 호출한다**

- [ ] **Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정** - Gemini가 공통 어댑터로 이관된 뒤에도 동작이 그대로이고, 같은 AI 호출을 재시도해도 토큰이 두 번 빠지지 않는다
- [ ] **Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가** - 작가가 플랫폼 키로 OpenAI·Anthropic 모델을 골라 집필하고, 그 모델의 실제 단가가 반영된 비용 추정을 본다
- [ ] **Phase 10: BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지** - 작가가 자기 API 키를 안전하게 맡기고, 피커에서 실제 호출 가능한 모델과 누가 비용을 내는지를 본다
- [ ] **Phase 11: BYOK 호출 경로 · 사용 기록 · 실패 UX** - 지갑 잔액이 0인 작가도 자기 키로 생성하고, 실패는 원인별로 구분돼 보이며, 이번 달 내 키 사용량을 확인한다

**v1.1 — 하드 경계 — 2단계: LLM이 NovelScript를 호출한다**

- [ ] **Phase 12: MCP OAuth 기반 · 연결/해제** - 작가가 Claude에 NovelScript를 커넥터로 연결하고, 해제하면 그 즉시 접근이 실제로 끊긴다
- [ ] **Phase 13: MCP 읽기 도구 + 집필 컨텍스트 번들** - 연결된 AI가 작가 본인의 작품·회차·설정집을 읽고, 앱과 동일한 구성의 집필 컨텍스트를 한 번에 받는다
- [ ] **Phase 14: MCP 쓰기 도구 + 스튜디오 리뷰 큐** - 외부 AI가 '제안된 초안·설정 변경안'만 되돌리고, 작가가 스튜디오에서 출처와 함께 수락/거절한다

## Phase Details

### Phase 1: Foundation & Wallet Infrastructure
**Goal**: Users can create and access an account, and the token wallet's ledger logic is proven correct under concurrent load using fake/stubbed credits — before any AI spend or real payment code exists.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03
**Success Criteria** (what must be TRUE):
  1. User can sign up/log in via Kakao or Google social login
  2. A single account serves both reader and writer roles — a "글쓰기 시작하기" entry point upgrades the same account, with no separate signup flow
  3. User's session persists across visits and browser refresh
**Plans**: 5 plans (Wave 0: env/service setup; Wave 1: wallet+profile schema, auth session infra; Wave 2: OAuth login flow, writer upgrade + account settings)

Plans:
- [x] 01-01-PLAN.md — Create Supabase project, register Google/Kakao OAuth apps, install deps + Vitest
- [x] 01-02-PLAN.md — Wallet/profile schema + apply_wallet_delta function, concurrency-proof test
- [x] 01-03-PLAN.md — Supabase client wrappers + proxy.ts session refresh
- [x] 01-04-PLAN.md — Login page, OAuth callback, D-02 email-completion fallback
- [x] 01-05-PLAN.md — Writer upgrade flow + account settings/deletion

### Phase 2: Studio Core (Writer Loop, No AI)
**Goal**: Writers can build a knowledge base and draft/publish chapters, independent of AI assistance.
**Depends on**: Phase 1
**Requirements**: KB-01, KB-02, CONT-01, CONT-02, CONT-03
**Success Criteria** (what must be TRUE):
  1. Writer can create, edit, and delete KB documents across all 5 templates (인물/장소/사건/세력/아이템)
  2. Writer can view their KB documents in an IDE-style folder/file tree, organized by template type, scoped per work
  3. Writer can create and save a chapter draft with a title and order
  4. Writer can publish a chapter, marking it free or paid with a price
  5. Writer can edit or unpublish a chapter after publishing
**Plans**: 6 plans (Wave 0: dependencies + schema + template-substitution library; Wave 1: work CRUD, KB tree/node business logic, chapter business logic — all parallel; Wave 2: KB tree UI, chapter UI — parallel)

Plans:
- [x] 02-01-PLAN.md — @dnd-kit + shadcn components + indigo accent; works/kb_nodes/chapters schema migration; template-substitution library
- [x] 02-02-PLAN.md — Work CRUD business logic + 작품 목록/새 작품 만들기 UI + /studio writer-role gate
- [x] 02-03-PLAN.md — KB tree query + node CRUD business logic (template resolution, locked-folder + ownership guards)
- [x] 02-04-PLAN.md — Chapter business logic (draft/publish/unpublish/reorder + ownership guards)
- [x] 02-05-PLAN.md — KB tree UI + document editor + create/rename/delete dialogs
- [x] 02-06-PLAN.md — Chapter list (drag-reorder) + chapter editor/publish UI
**UI hint**: yes

### Phase 3: Reader Core (Reading Loop, No Payment)
**Goal**: Readers can discover and read published chapters end-to-end with a Korean-market-standard viewer, and can flag problem content — all chapters free at this stage.
**Depends on**: Phase 2
**Requirements**: READ-01, READ-02, READ-03, READ-04, READ-05, READ-07, READ-08, READ-09
**Success Criteria** (what must be TRUE):
  1. Reader can browse a discovery feed showing cover, title, synopsis, and a simplified ranking signal (views/likes/next-chapter click-through)
  2. Reader can read chapters in a viewer with prev/next chapter navigation and a table of contents
  3. Reader can adjust font size and toggle a dark/alternate theme in the viewer
  4. Reader's last-read chapter is remembered and resumed on return (이어보기)
  5. Reader can report a novel or chapter for review from the detail page or viewer
  6. Reader can toggle a per-work new-chapter notification subscription (알림) from the work detail page — state persists, delivery channel out of scope
  7. Reader can save/unsave a work to a personal 선호작 (bookmark) list from the work detail page, distinct from 좋아요
  8. Home/discovery screen shows a static promotional banner slot above "최근 읽은 작품"
**Plans**: 7 plans (Wave 1: reader schema migration + RLS fix; Wave 2: discovery/public-read lib, view+progress lib, likes/subscriptions/bookmarks/reports lib — parallel; Wave 3: discovery feed UI, work detail UI — parallel; Wave 4: chapter viewer UI)
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md — Reader schema migration: RLS public-read fix, view_count + increment RPC, work_likes/reading_progress/reports/work_subscriptions/work_bookmarks
- [x] 03-02-PLAN.md — Discovery feed lib (trending score) + content-leak-safe public work/chapter readers
- [x] 03-03-PLAN.md — View-count increment wrapper + reading-progress upsert/read/recently-read lib
- [x] 03-04-PLAN.md — Likes/subscriptions/bookmarks toggle lib + report submission lib
- [x] 03-05-PLAN.md — Discovery feed UI (app/page.tsx): banner, recently-read, genre/sort filters, trending grid
- [x] 03-06-PLAN.md — Work detail page UI: 3-tab structure, header icons, CTA, like button, report dialog
- [x] 03-07-PLAN.md — Chapter viewer UI: toolbar, TOC/settings sheets, font/theme, bottom nav, view/progress tracking

### Phase 4: AI Gateway (Mention-Based Generation)
**Goal**: Writers can generate AI-assisted prose from mention-injected KB context, with cost visibility and spend guardrails built in from the start (not bolted on later).
**Depends on**: Phase 1, Phase 2
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04, EDIT-05
**Success Criteria** (what must be TRUE):
  1. Writer can insert @-mention references to KB documents via an autocomplete UI component that searches by name/type
  2. Writer can see a visible list of currently-mentioned/in-context documents before generating
  3. Writer can select one of 3 tone presets (초보자/중급자/자유형), with 자유형 offering a custom-instruction textarea
  4. Writer can trigger AI generation that sends mentioned KB docs + preset + instruction to Gemini and inserts the result into the canvas, with per-request and per-user spend caps enforced against the wallet before the call fires
  5. Writer sees a token/cost estimate before generating
**Plans**: 6 plans (Wave 1: wallet-token↔Gemini-token conversion + mockable Gemini client, mention search/quick-add backend, prompt composition — all parallel; Wave 2: generate/estimateCost Server Actions + wallet debit; Wave 3: AiPanel UI shell + permission-prompt preview; Wave 4: mention autocomplete + final page wiring + checkpoint)
**UI hint**: yes

Plans:
- [x] 04-01-PLAN.md — Wallet-token↔Gemini-token conversion formula (Open Questions 1/2) + mockable Gemini client
- [x] 04-02-PLAN.md — Mention search by name/type + quick-add KB document creation
- [x] 04-03-PLAN.md — Prompt composition (D-14 baseline + D-08rev presets + D-15 style + D-07 genre)
- [x] 04-04-PLAN.md — generate/estimateCost Server Actions — D-13 cap-before-call, debit-after-call
- [x] 04-05-PLAN.md — AiPanel UI shell: header controls, chip list, cost estimate, D-10rev preview card
- [x] 04-06-PLAN.md — Mention autocomplete + quick-add UI + final page wiring + human-verify checkpoint

### Phase 04.1: 사용자 정의 폴더 기능 (KB 커스텀 폴더 + 회차 폴더 트리) (INSERTED)

**Goal:** Writers can create their own folders anywhere in the KB tree (not just documents), 회차(chapters) appear as a fixed folder in that same tree so growing KB content and episodes stay organized as works/accounts scale, and an account-level shared folder space lets cross-work content (e.g. a shared world-bible) be mentioned from any work.
**Requirements**: KB-03, KB-04, KB-05
**Depends on:** Phase 4
**Plans:** 5/5 plans complete

Plans:
- [x] 04.1-01-PLAN.md — Schema migration: category CHECK widened (회차/custom), lock-regression fix, 회차 seed + backfill, chapters.folder_id, chapter-folder guard trigger
- [x] 04.1-02-PLAN.md — KB tree data-layer split (getWorkKbNodes/getAccountSharedNodes) + createFolder (server-derived category)
- [x] 04.1-03-PLAN.md — Chapter/회차-folder grouping data layer (assertChapterFolder, folder_id-aware createChapter/listChapters, groupChaptersByFolder)
- [x] 04.1-04-PLAN.md — Cross-scope @-mention search (searchMentionNodes + getMentionedNodesContent) + MentionAutocomplete scope labels
- [x] 04.1-05-PLAN.md — KB tree UI wiring: two-section sidebar, folder creation dialogs, 회차 chapter leaves, checkpoint

### Phase 5: Real Payment Integration
**Goal**: Users can convert real money into platform tokens through a verified, non-spoofable Toss Payments flow, swapped in behind the same wallet interface Phase 1 proved.
**Depends on**: Phase 1
**Requirements**: PAY-01, PAY-03
**Success Criteria** (what must be TRUE):
  1. User can purchase tokens through the Toss Payments widget and see the charge reflected as an updated wallet balance
  2. Wallet balance is only credited by a verified Toss webhook event, never by a client-side redirect/return callback
**Plans**: TBD
**UI hint**: yes
**Status**: Not started — **blocked on external dependency**. No Toss Payments code exists in the repo (verified 2026-09-15: no client/widget/webhook handler, no payment migration beyond `0005_commerce.sql`). `05-CONTEXT.md`, `05-RESEARCH.md`, `05-UI-SPEC.md`, `05-VALIDATION.md` are complete and ready for `/gsd:plan-phase`; execution waits on the Toss merchant keys (사업자등록 + merchant application).

### Phase 6: Paid Chapter Unlock
**Goal**: Users can spend real, purchased tokens to unlock paid chapters, combining the proven wallet (Phase 1), paid-chapter metadata (Phase 2), and real payments (Phase 5).
**Depends on**: Phase 1, Phase 2, Phase 5
**Requirements**: PAY-02
**Success Criteria** (what must be TRUE):
  1. User can spend tokens to unlock a paid chapter and immediately view its content
  2. Wallet balance is deducted atomically at the moment of unlock, with no double-charge on retry or double-click
  3. The chapter's author is credited 90% of the spent tokens for the unlock, with 10% retained as a platform fee — this 90/10 split is a **provisional figure** (not final; see `06-CONTEXT.md` D-10), implemented behind a single adjustable constant
**Plans**: TBD for remaining work. Existing implementation was outside the GSD plan flow; `06-SUMMARY.md` is a retrospective phase summary, not a completed PLAN. No execution plans are fabricated or marked complete.
**UI hint**: yes
**Status**: Partially complete. Implemented in commits `57e1c8e` / `fc8a4a5` directly against the Phase 1 token wallet, without going through `/gsd:plan-phase`. Implementation report: `docs/commerce-entitlements.md`.

Implemented in source (deployment/runtime verification pending):
- `supabase/migrations/0005_commerce.sql` — `orders` / `order_items` / `entitlements` tables, RLS, purchase RPC, chapter-body column grants
- `lib/commerce/actions.ts` (order creation + settlement), `lib/access/actions.ts` (session-based `canView` + protected body read), `lib/chapters/actions.ts` (body RPC + bulk TOC permission read)
- `components/reader/viewer-shell.tsx` — price display, purchase button, double-click guard, error/retry
- `tests/commerce/actions.test.ts`, `tests/commerce/database.test.ts`
- Success Criteria 1 and 2 have source implementations. Actual SQL/RLS, independent-session concurrency and browser E2E remain unverified; they are not marked fully met. Current UI uses a purchase button and refresh, matching the latest implementation baseline.

Residual (stays in v1.0, not yet done):
- [ ] **Implement author settlement (Success Criterion 3)** — author 90% / platform 10% is provisional. Add a single rate adjustment point and atomic author credit with purchase-time distribution snapshots. This remains roadmap work; no settlement code was added by the documentation patch.
- Phase 6 currently runs on the Phase 1 token wallet with **no real top-up path**, because Phase 5 has not been built. `docs/commerce-entitlements.md` states real-currency charging was explicitly out of its scope. This inverts the roadmap's intended 5 → 6 order; Phase 5 layers on top when the Toss keys arrive.
- [ ] Apply/verify the migration in a test environment, run SQL/RLS and real concurrent-session tests, and validate the purchase E2E. Previous DB tests remain unexecuted by user choice.
- GSD-format documentation now includes `06-CONTEXT.md`, `06-RESEARCH.md`, retrospective `06-SUMMARY.md`, `06-VERIFICATION.md` (`gaps_found`) and `06-VALIDATION.md`. The verification document records a source audit, not a completed gsd-verifier or live-DB run.

### Phase 7: Admin Moderation Surface
**Goal**: Admins can review reported content and take corrective action, closing the loop opened by reader reports (Phase 3) and the safety mitigations shipped with generation (Phase 4).
**Depends on**: Phase 1, Phase 3
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. Admin can view a queue of open reports (reporter, target content, reason category, timestamp, status)
  2. Admin can unpublish/blind a specific chapter
  3. Admin can warn, suspend, or ban a user account with a logged reason, and view that user's past reports/actions
  4. Admin can mark a report resolved or dismissed with a short note
**Plans**: 7 plans, 6 waves — ready for `$gsd-execute-phase 7`

**Wave 1**
- [ ] 07-01-PLAN.md — 관리자 권한·보호된 스키마·초기 관리자 등록

**Wave 2 (blocked on Wave 1)**
- [ ] 07-02-PLAN.md — 원자적 운영 조치·감사 기록·대상별 신고 큐

**Wave 3 (blocked on Wave 2; parallel)**
- [ ] 07-03-PLAN.md — 제재 만료·DB/서버 쓰기 차단·읽기 유지
- [ ] 07-05-PLAN.md — 관리자 신고/재검토 화면·조치 폼

**Wave 4 (blocked on 07-03)**
- [ ] 07-04-PLAN.md — 작품/회차 블라인드·구매/열람 경계

**Wave 5 (blocked on 07-04 and 07-05)**
- [ ] 07-06-PLAN.md — 경고 확인·작가 재검토 요청·독자 잠금 상태

**Wave 6 (blocked on Wave 5)**
- [ ] 07-07-PLAN.md — 실제 DB 적용·동시성·브라우저 통합 검증

**Cross-cutting constraints:** 세션 기반 관리자 판정; 조치/감사 기록의 원자성; 제재 중 기존 읽기 유지; 블라인드와 발행 상태 분리; 기존 구매권 보존; DB 검사 skip은 통과로 인정하지 않음.
**UI hint**: yes
**Status**: Planned 2026-09-16 — 7 plans / 15 tasks, ADMIN-01~04 및 D-01~D-20 포함. 구현과 런타임 검증은 미실행.
**논의에서 확정된 범위 확장 2건** (Success Criteria 문면을 넘어섬 — 플랜이 커지면 여기부터 조절):
  - **D-12 작품 전체 블라인드** — ADMIN-02는 "특정 회차"만 명시. `reports.work_id`가 필수라 작품 단위 신고가 이미 존재해 추가함. 피드·상세·목록·뷰어 쿼리 분기가 늘어남
  - **D-16 작가 재검토 요청 + 별도 탭** — 작가측 진입점과 요청 상태 모델이 추가됨. 최종 해제 권한은 운영자에게 고정

---

## Phase Details — v1.1

### Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정
**Goal**: Gemini 생성 경로가 공통 `ProviderClient` 어댑터 뒤로 이관되어도 작가 눈에는 아무것도 달라지지 않고, 동시에 현존하는 이중 차감 버그가 사라진다 — 이후 모든 제공자·재시도·BYOK 작업이 딛고 설 기반.
**Depends on**: Phase 4 (AI Gateway)
**Requirements**: PROV-01, COST-01
**Success Criteria** (what must be TRUE):
  1. 작가가 어댑터 이관 전과 똑같이 Gemini로 생성한다 — `@`멘션 주입, 3단계 프리셋, 4종 문체, `[REPLY]/[DRAFT]/[DOCUMENT]` 초안·제안 파싱이 모두 이전과 동일하게 동작한다
  2. 같은 생성 호출이 재시도돼도 지갑에서 토큰이 한 번만 차감된다 (매 호출 랜덤 `reference_id`를 넘겨 RPC 중복 방지를 무력화하던 현재 동작이 고쳐진다)
  3. 생성 전 비용 상한 계산이 원격 `countTokens` 호출 없이도 이전과 같은 수준으로 동작한다 (로컬 추정으로 전환 — 실제 차감은 여전히 제공자가 돌려준 실사용량 기준)
  4. 제공자가 안전 거절(safety refusal)을 반환하면 작가는 영어 거절문이 창작 결과물처럼 렌더링되는 대신 한국어 안내를 본다
**Plans**: TBD
**Notes**: 스키마 변경 없음(중복 방지 제약은 이미 존재). BYOK 키가 로그로 새는 유일한 경로인 **에러 스크러빙 choke point를 어댑터 인터페이스와 같이 출하**한다 — 세 번째 어댑터에서 잊히면 늦는다. 킥오프 체크리스트에 **OpenAI Organization Verification / Anthropic 빌링·tier 신청**을 넣어 병행 착수한다(외부 리드타임).

### Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가
**Goal**: 작가가 플랫폼(서비스) 키로 Gemini 외 두 제공자를 실제로 골라 집필할 수 있고, 무엇을 고르든 그 모델의 진짜 단가로 계산된 비용을 생성 전에 본다.
**Depends on**: Phase 8
**Requirements**: PROV-02, PROV-03, PROV-04, PROV-07
**Success Criteria** (what must be TRUE):
  1. 작가가 OpenAI 모델을 선택해 본문 생성·어시스트를 받고, 결과가 기존 초안·제안 UI로 동일하게 들어온다
  2. 작가가 Anthropic 모델을 선택해 본문 생성·어시스트를 받고, 결과가 기존 초안·제안 UI로 동일하게 들어온다
  3. 작가가 계정 설정에서 기본 제공자·모델을 지정하고, AI 패널 드롭다운에서 이번 호출만 다른 제공자·모델로 전환할 수 있다
  4. 서비스 키 모드에서 작가가 보는 비용 추정치가 선택한 제공자·모델의 실제 단가를 반영한다 (Gemini 단가가 GPT 호출에 재사용되지 않는다)
**Plans**: TBD
**UI hint**: yes
**Notes**: BYOK와 새 벤더를 동시에 디버깅하지 않는다 — 이 페이즈는 **플랫폼 키로만** 어댑터가 작동함을 증명한다. 세 벤더의 `usage` 필드 이름이 모두 다르므로 공통 `UsageReport`로 정규화한다. 한국어 토큰 추정 상수는 provider별로 분리해 한국어 산문 샘플로 보정한다(단일 상수는 같은 잔액에 대해 제공자마다 출력 예산이 달라지는 체감 문제를 만든다).

### Phase 10: BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지
**Goal**: 작가가 자신의 API 키를 플랫폼에 맡기고, 그 키 검증이 돌려준 모델 목록이 곧 피커가 보여주는 "내가 실제로 쓸 수 있는 모델"이 된다 — 누가 비용을 내는지가 선택 시점에 보인다.
**Depends on**: Phase 9
**Requirements**: BYOK-01, BYOK-02, BYOK-03, BYOK-04, PROV-05
**Success Criteria** (what must be TRUE):
  1. 작가가 계정 설정 화면에서 제공자별로 자신의 API 키를 1개씩 등록하고, 서버가 저장 전에 제공자의 모델 목록 엔드포인트로 유효성·소유권을 검증한다 — 검증에 실패한 키는 활성 키로 저장되지 않으며, 검증 자체가 작가에게 과금되지 않는다
  2. 등록된 키는 제공자·끝 4자리·등록일과 `연결됨/검증 실패/미등록` 상태로만 보이고, 평문은 화면·응답·로그 어디에도 다시 나타나지 않는다
  3. 작가가 키를 삭제할 때 해당 제공자가 어떻게 되는지 안내받고, 삭제된 키가 기본 선택이었다면 선택이 자동 대체된다 (교체 = 삭제 후 재등록)
  4. 모델 피커에 작가가 실제로 호출 가능한 모델만 나타나고, 각 모델에 `BYOK` / `서비스 키` 배지가 붙어 누가 비용을 내는지 선택 시점에 보인다 — 전역 모드 토글은 존재하지 않는다
**Plans**: TBD
**UI hint**: yes
**Notes**: 키 검증(models-list)과 피커는 **같은 기능**이다 — 검증 결과가 피커의 모델 목록을 생산하므로 페이즈를 가르지 않는다. 암호화 방식(Supabase Vault vs 앱 레벨 AES-256-GCM)은 **이 페이즈 계획 시점에 확정**한다 — 구현 중 미루면 데이터 마이그레이션이 된다. 별도 평문 `masked_hint` 컬럼이 BYOK 슬라이스에서 가장 중요한 스키마 결정. 평문 키가 어떤 경로로도 로그에 닿지 않음을 테스트로 확인한다.

### Phase 11: BYOK 호출 경로 · 사용 기록 · 실패 UX
**Goal**: 지갑 잔액이 0인 작가도 자기 키로 막힘없이 생성하고, 실패했을 때 원인별로 다른 안내를 받으며, 이번 달 자기 키로 얼마나 썼는지 확인할 수 있다.
**Depends on**: Phase 10
**Requirements**: PROV-06, BYOK-05, BYOK-06, BYOK-07, BYOK-08, BYOK-09, COST-02
**Success Criteria** (what must be TRUE):
  1. 작가가 BYOK 모델로 호출하면 플랫폼 토큰이 전혀 차감되지 않고, 지갑 잔액이 0이어도 호출이 차단되지 않는다
  2. BYOK 모델을 선택하면 AI 패널의 지갑 토큰 비용 게이지가 숨겨지고, 1회 출력 토큰 상한이 서비스 키 호출보다 높게 적용된다
  3. 무효·폐기된 키 / 레이트리밋 / 크레딧 소진 / 타임아웃·장애 네 가지 실패가 각각 구분되는 한국어 메시지로 안내되고, 무효 키만 `검증 실패`로 바뀐다 — 자동 재시도도, 서비스 키로의 조용한 폴백도 일어나지 않는다
  4. 선택한 제공자·모델을 쓸 수 없을 때 작가는 무엇으로 대체됐는지 화면에서 보고 진행 여부를 스스로 결정한다 — 서비스 키↔BYOK 간 조용한 전환은 없다
  5. 작가가 이번 달 제공자별 BYOK 호출 수·토큰 수·예상 비용(금액)을 보고, 모든 AI 호출이 제공자·모델·토큰 수와 함께 지갑 원장과 분리된 사용 기록에 남는다 (지갑 원장에 0원 행이 기록되지 않는다)
**Plans**: TBD
**UI hint**: yes
**Notes**: 과금 모드는 **매 호출 서버에서 재도출**한다 — 클라이언트가 보낸 `byok: true`를 분기 입력으로 쓰지 않는다(TOCTOU). BYOK 경로는 "상한 0인 서비스 경로"가 아니라 cap 계산 블록 전체를 구조적으로 건너뛰는 별도 분기다. `ai_usage`에 "정산 무관" 명시 SQL 주석을 남겨 향후 작가 90/10 정산 쿼리를 오염시키지 않는다. 429 재시도는 Phase 8의 멱등 차감 수정이 선행된 뒤에만 붙이며, 바이트가 도착하기 전의 실패에만 한정한다(부분 응답 후 끊김은 사용자 재시도 대상). 핵심 회귀 테스트: 잔액 0 + BYOK 키 보유 사용자의 성공, 그리고 패널 로드와 전송 사이에 키를 삭제한 케이스.

---

**하드 경계** — 1단계(Phase 8~11)가 안정화되기 전에 2단계(Phase 12~14)를 시작하지 않는다. BYOK는 "우리가 남의 비밀을 보관해 밖으로 호출", MCP OAuth는 "우리가 비밀을 발급해 밖에서 들어옴" — 방향이 반대이고 공유 코드가 없다. 하나의 '인증 페이즈'로 묶지 않는다.

---

### Phase 12: MCP OAuth 기반 · 연결/해제
**Goal**: 작가가 Claude에서 NovelScript를 커스텀 커넥터로 연결해 자기 계정 데이터에만 접근하도록 승인하고, 해제하면 이미 발급된 접근이 실제로 끊긴다.
**Depends on**: Phase 11 (1단계 안정화 이후)
**Requirements**: MCP-01, MCP-08
**Success Criteria** (what must be TRUE):
  1. 작가가 Claude에서 NovelScript를 커스텀 커넥터로 추가하고 OAuth 계정 연결을 승인하면 연결이 성립한다
  2. 연결된 토큰은 승인한 작가 본인의 데이터에만 접근하며, 다른 사용자의 리소스에는 유효한 토큰으로도 도달하지 못한다
  3. 작가가 NovelScript에서 연결된 클라이언트 목록과 마지막 사용 시각을 본다
  4. 작가가 연결을 해제하면, 해제 이전에 발급된 토큰으로 시도한 호출이 즉시 차단된다
**Plans**: TBD
**UI hint**: yes
**Notes**: **인수 기준 클라이언트는 Claude만.** ChatGPT는 쓰기 가능 커스텀 커넥터를 Business/Enterprise/Edu 워크스페이스로 제한하므로 best-effort 문서화 대상이며 성공 기준이 아니다. 첫 작업은 **스파이크**다 — 실제 Claude 커스텀 커넥터로 discovery → 등록 → 토큰 교환을 왕복시켜 authorization server 선택(Supabase Auth OAuth 2.1 Server vs WorkOS AuthKit)을 결판낸다. 스파이크 실패 시 페이즈 내용 자체가 바뀌므로 도구 작업과 섞지 않는다. 해제 검증은 UI 목록이 아니라 **해제 이전에 발급된 토큰으로 실제 도구 호출을 시도**해서 한다 — stateless JWT 검증만으로는 이 기준을 구조적으로 충족할 수 없고, 매 호출 살아있는 grant introspection이 필요하다(나중에 붙일 수 없다). `/gsd:research-phase` 필수: 2026-07-28 spec 개정이 DCR을 CIMD로 대체해 기존 튜토리얼이 전부 낡았고, 커넥터 UI가 실제로 무엇을 보내는지는 구현 시점 재확인이 필요하다.

### Phase 13: MCP 읽기 도구 + 집필 컨텍스트 번들
**Goal**: 연결된 AI가 작가 본인의 작품·회차·설정집을 읽고, 앱 안에서와 동일한 구성의 집필 컨텍스트를 한 번에 받아 초안을 쓸 준비를 마친다.
**Depends on**: Phase 12
**Requirements**: MCP-02, MCP-03, MCP-04, MCP-09
**Success Criteria** (what must be TRUE):
  1. 연결된 AI가 작가의 작품 목록·회차 목록·회차 본문을 조회할 수 있다
  2. 연결된 AI가 작가의 설정집 문서를 검색하고 내용을 읽을 수 있다
  3. 연결된 AI가 멘션 방식 집필 컨텍스트 번들(설정집 + 프리셋 + 문체 조합)을 한 번에 받아, 앱 안에서 생성한 것과 같은 구성으로 초안을 쓴다
  4. 읽기 도구를 호출할 때 클라이언트가 불필요한 확인 프롬프트를 띄우지 않는다 (모든 툴에 읽기/쓰기 성격 annotation이 붙는다)
**Plans**: TBD
**Notes**: 도구는 기본적으로 user-scoped 클라이언트를 쓴다 — Server Action에서 옳았던 `createAdminClient()` 관행을 그대로 복사하면 bearer 토큰 하나로 교차 사용자 읽기가 가능해지는 confused deputy가 된다. `createAdminClient` import는 그 자체로 추가 리뷰 대상. 모든 도구에 대해 **두 번째 사용자 토큰으로 첫 사용자 리소스를 찌르는 교차 사용자 테스트 스위트**를 통과시킨다. `get_writing_context`는 기존 `composeSystemInstruction`/`assembleUserContent`를 **재사용**한다(fork 금지) — 이 페이즈를 단순 CRUD API가 아니게 만드는 유일한 차별화 도구다.

### Phase 14: MCP 쓰기 도구 + 스튜디오 리뷰 큐
**Goal**: 외부 AI가 되돌릴 수 있는 것은 '제안된 초안'과 '설정 변경안'뿐이고, 작가가 스튜디오에서 출처와 함께 그것들을 검토해 수락하거나 거절한다 — 기존 본문은 어떤 경우에도 조용히 바뀌지 않는다.
**Depends on**: Phase 13
**Requirements**: MCP-05, MCP-06, MCP-07
**Success Criteria** (what must be TRUE):
  1. 연결된 AI가 특정 회차에 '제안된 초안'을 저장할 수 있고, 그 회차의 기존 본문은 어떤 경로로도 덮어쓰이지 않는다 (본문 직접 수정 툴 자체가 존재하지 않으며, 새 초안 회차를 만들지도 않는다)
  2. 연결된 AI가 설정집 문서의 신규 생성안 또는 기존 문서 수정안을 제안할 수 있다
  3. 작가가 설정집 수정안을 원문과 나란히 놓고 비교(diff)해 수락 또는 거절한다
  4. 작가가 스튜디오에서 MCP로 도착한 초안·제안을 출처(어느 클라이언트에서, 언제)와 함께 검토하고 수락 또는 거절한다
**Plans**: TBD
**UI hint**: yes
**Notes**: 리뷰 큐 UI는 "도구 몇 개 더"의 반올림 오차가 아니라 실제 UI 스코프다 — 마지막에 두되 축소하지 않는다. `save_draft` / `propose_kb_document` 둘 다 pending 상태 객체만 생성하며, "외부 AI가 제안하고 작가가 결정한다"를 UI 카피가 아니라 **데이터 접근 레이어에서** 강제한다(`mcp_drafts` / `mcp_kb_proposals`). LLM이 넘긴 `work_id`/`chapter_id`는 읽기 도구 결과를 거쳐 온 **비신뢰 입력**이므로 매 호출 서버에서 소유권을 재검증한다 — 초안/제안 전용 설계는 이 문제의 대체재가 아니라 짝이다. 주입된 도구 결과로 유도된 교차 사용자 쓰기 테스트를 포함한다.


## Progress

**Execution Order:**
**v1.0 track:** 1 → 2 → 3 → 4 → 04.1 → 5 → 6 → 7
**v1.1 track:** 8 → 9 → 10 → 11 → [하드 경계] → 12 → 13 → 14 — v1.0 잔여 Phase 5/6/7과는 독립적인 트랙으로 진행한다

**Parallel track (outside phase sequence):** Toss Payments merchant application + 사업자등록 should start no later than Phase 1's kickoff — external review commonly runs ~2+ weeks and should not become the launch-blocking critical path by starting late.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Wallet Infrastructure | 5/5 | Complete   | 2026-08-29 |
| 2. Studio Core (Writer Loop, No AI) | 6/6 | Complete   | 2026-08-29 |
| 3. Reader Core (Reading Loop, No Payment) | 7/7 | Complete   | 2026-08-30 |
| 4. AI Gateway (Mention-Based Generation) | 6/6 | Complete (live-key UAT pending) | 2026-08-30 |
| 04.1. 사용자 정의 폴더 기능 (KB 커스텀 폴더 + 회차 폴더 트리) | 5/5 | Complete    | 2026-08-31 |
| 5. Real Payment Integration | 0/TBD | Blocked (Toss keys) | - |
| 6. Paid Chapter Unlock | n/a (outside GSD) | Partial (90/10 missing) | - |
| 7. Admin Moderation Surface | 0/7 | Planned (6 waves) | - |
| 8. 프로바이더 어댑터 기반 · 멱등 차감 수정 | 0/TBD | Not started | - |
| 9. OpenAI · Anthropic 어댑터 + 제공자별 단가 | 0/TBD | Not started | - |
| 10. BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지 | 0/TBD | Not started | - |
| 11. BYOK 호출 경로 · 사용 기록 · 실패 UX | 0/TBD | Not started | - |
| 12. MCP OAuth 기반 · 연결/해제 | 0/TBD | Not started | - |
| 13. MCP 읽기 도구 + 집필 컨텍스트 번들 | 0/TBD | Not started | - |
| 14. MCP 쓰기 도구 + 스튜디오 리뷰 큐 | 0/TBD | Not started | - |

**v1.1 병행 트랙 (페이즈 순서 밖):** OpenAI Organization Verification(정부 신분증 기반) + Anthropic 빌링·rate-limit tier 신청은 Phase 8 킥오프와 동시에 시작한다 — v1.0 Phase 5의 PG 심사와 구조적으로 동일한 외부 큐이며, STATE.md Blockers에 추적한다.

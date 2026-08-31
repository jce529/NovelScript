# Roadmap: NovelScript

## Overview

NovelScript ships as one Next.js app with two loops that must both work: writers drafting with mention-injected AI assistance, and readers discovering/consuming what gets published — bound together by a real-money token wallet. The build order follows the strongest cross-cutting signal from research: the wallet/ledger must be built and concurrency-proven with fake credits before any real AI spend or real payment code touches it, so a payment bug can never block AI validation and vice versa. Concretely: prove auth + the ledger first (Phase 1), build the writer's non-AI loop and the reader's non-payment loop independently on top of it (Phases 2-3), wire AI generation against the still-fake wallet with cost guardrails built in from day one (Phase 4), swap in real Toss Payments behind the same wallet interface (Phase 5), let the paid-chapter-unlock feature use both proven pieces together (Phase 6), and close the trust/safety loop last with the admin moderation surface (Phase 7). PG paperwork (사업자등록, Toss merchant application) should start in parallel from Phase 1's kickoff — it runs on an external ~2+ week clock independent of the engineering sequence below.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Wallet Infrastructure** - Auth works, and the token wallet/ledger is proven safe with fake credits before anything real touches it (completed 2026-08-29)
- [x] **Phase 2: Studio Core (Writer Loop, No AI)** - Writers build a knowledge base and draft/publish chapters without AI involved (completed 2026-08-29)
- [x] **Phase 3: Reader Core (Reading Loop, No Payment)** - Readers discover and read published chapters end-to-end, all free at this stage (completed 2026-08-30)
- [ ] **Phase 4: AI Gateway (Mention-Based Generation)** - Writers generate AI-assisted prose from mentioned KB docs, with cost guardrails from the start
- [x] **Phase 04.1: 사용자 정의 폴더 기능 (KB 커스텀 폴더 + 회차 폴더 트리)** (INSERTED) - Custom folder creation anywhere in the KB tree, 회차 as a fixed tree folder, account-shared folder space mentionable from any work (completed 2026-08-31)
- [ ] **Phase 5: Real Payment Integration** - Users convert real money into tokens via a verified, non-spoofable Toss Payments flow
- [ ] **Phase 6: Paid Chapter Unlock** - Users spend real tokens to unlock paid chapters
- [ ] **Phase 7: Admin Moderation Surface** - Admins review reports and take corrective action, closing the loop opened by reader reports

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

### Phase 6: Paid Chapter Unlock
**Goal**: Users can spend real, purchased tokens to unlock paid chapters, combining the proven wallet (Phase 1), paid-chapter metadata (Phase 2), and real payments (Phase 5).
**Depends on**: Phase 1, Phase 2, Phase 5
**Requirements**: PAY-02
**Success Criteria** (what must be TRUE):
  1. User can spend tokens to unlock a paid chapter and immediately view its content
  2. Wallet balance is deducted atomically at the moment of unlock, with no double-charge on retry or double-click
**Plans**: TBD
**UI hint**: yes

### Phase 7: Admin Moderation Surface
**Goal**: Admins can review reported content and take corrective action, closing the loop opened by reader reports (Phase 3) and the safety mitigations shipped with generation (Phase 4).
**Depends on**: Phase 1, Phase 3
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):
  1. Admin can view a queue of open reports (reporter, target content, reason category, timestamp, status)
  2. Admin can unpublish/blind a specific chapter
  3. Admin can warn, suspend, or ban a user account with a logged reason, and view that user's past reports/actions
  4. Admin can mark a report resolved or dismissed with a short note
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

**Parallel track (outside phase sequence):** Toss Payments merchant application + 사업자등록 should start no later than Phase 1's kickoff — external review commonly runs ~2+ weeks and should not become the launch-blocking critical path by starting late.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Wallet Infrastructure | 5/5 | Complete   | 2026-08-29 |
| 2. Studio Core (Writer Loop, No AI) | 6/6 | Complete   | 2026-08-29 |
| 3. Reader Core (Reading Loop, No Payment) | 7/7 | Complete   | 2026-08-30 |
| 4. AI Gateway (Mention-Based Generation) | 6/6 | In Progress|  |
| 04.1. 사용자 정의 폴더 기능 (KB 커스텀 폴더 + 회차 폴더 트리) | 5/5 | Complete    | 2026-08-31 |
| 5. Real Payment Integration | 0/TBD | Not started | - |
| 6. Paid Chapter Unlock | 0/TBD | Not started | - |
| 7. Admin Moderation Surface | 0/TBD | Not started | - |

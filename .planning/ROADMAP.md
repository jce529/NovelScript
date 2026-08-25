# Roadmap: NovelScript

## Overview

NovelScript ships as one Next.js app with two loops that must both work: writers drafting with mention-injected AI assistance, and readers discovering/consuming what gets published — bound together by a real-money token wallet. The build order follows the strongest cross-cutting signal from research: the wallet/ledger must be built and concurrency-proven with fake credits before any real AI spend or real payment code touches it, so a payment bug can never block AI validation and vice versa. Concretely: prove auth + the ledger first (Phase 1), build the writer's non-AI loop and the reader's non-payment loop independently on top of it (Phases 2-3), wire AI generation against the still-fake wallet with cost guardrails built in from day one (Phase 4), swap in real Toss Payments behind the same wallet interface (Phase 5), let the paid-chapter-unlock feature use both proven pieces together (Phase 6), and close the trust/safety loop last with the admin moderation surface (Phase 7). PG paperwork (사업자등록, Toss merchant application) should start in parallel from Phase 1's kickoff — it runs on an external ~2+ week clock independent of the engineering sequence below.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Wallet Infrastructure** - Auth works, and the token wallet/ledger is proven safe with fake credits before anything real touches it
- [ ] **Phase 2: Studio Core (Writer Loop, No AI)** - Writers build a knowledge base and draft/publish chapters without AI involved
- [ ] **Phase 3: Reader Core (Reading Loop, No Payment)** - Readers discover and read published chapters end-to-end, all free at this stage
- [ ] **Phase 4: AI Gateway (Mention-Based Generation)** - Writers generate AI-assisted prose from mentioned KB docs, with cost guardrails from the start
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
- [ ] 01-03-PLAN.md — Supabase client wrappers + proxy.ts session refresh
- [ ] 01-04-PLAN.md — Login page, OAuth callback, D-02 email-completion fallback
- [ ] 01-05-PLAN.md — Writer upgrade flow + account settings/deletion

### Phase 2: Studio Core (Writer Loop, No AI)
**Goal**: Writers can build a knowledge base and draft/publish chapters, independent of AI assistance.
**Depends on**: Phase 1
**Requirements**: KB-01, KB-02, CONT-01, CONT-02, CONT-03
**Success Criteria** (what must be TRUE):
  1. Writer can create, edit, and delete KB documents across all 5 templates (인물/장소/사건/세력/아이템)
  2. Writer can view their KB documents in a flat, filterable list per template type
  3. Writer can create and save a chapter draft with a title and order
  4. Writer can publish a chapter, marking it free or paid with a price
  5. Writer can edit or unpublish a chapter after publishing
**Plans**: TBD
**UI hint**: yes

### Phase 3: Reader Core (Reading Loop, No Payment)
**Goal**: Readers can discover and read published chapters end-to-end with a Korean-market-standard viewer, and can flag problem content — all chapters free at this stage.
**Depends on**: Phase 2
**Requirements**: READ-01, READ-02, READ-03, READ-04, READ-05
**Success Criteria** (what must be TRUE):
  1. Reader can browse a discovery feed showing cover, title, synopsis, and a simplified ranking signal (views/likes/next-chapter click-through)
  2. Reader can read chapters in a viewer with prev/next chapter navigation and a table of contents
  3. Reader can adjust font size and toggle a dark/alternate theme in the viewer
  4. Reader's last-read chapter is remembered and resumed on return (이어보기)
  5. Reader can report a novel or chapter for review from the detail page or viewer
**Plans**: TBD
**UI hint**: yes

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
**Plans**: TBD
**UI hint**: yes

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
| 1. Foundation & Wallet Infrastructure | 0/5 | Planned | - |
| 2. Studio Core (Writer Loop, No AI) | 0/TBD | Not started | - |
| 3. Reader Core (Reading Loop, No Payment) | 0/TBD | Not started | - |
| 4. AI Gateway (Mention-Based Generation) | 0/TBD | Not started | - |
| 5. Real Payment Integration | 0/TBD | Not started | - |
| 6. Paid Chapter Unlock | 0/TBD | Not started | - |
| 7. Admin Moderation Surface | 0/TBD | Not started | - |

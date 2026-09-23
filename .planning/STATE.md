---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Overview
status: verifying
stopped_at: Phase 15 context gathered
last_updated: "2026-09-22T04:45:13.016Z"
last_activity: 2026-09-22 — BUG-01 수정 범위를 v1.1 마지막 Phase 15로 승격하고 AIDOC-01~04 매핑
progress:
  total_phases: 16
  completed_phases: 7
  total_plans: 45
  completed_plans: 46
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-25)

**Core value:** 작가가 이 IDE로 실제로 반복해서 집필하고, 독자가 그 결과물에 몰입해서 완독·연독한다 — 창작과 소비 양쪽 루프가 동시에 성립해야 의미가 있다.
**Current focus:** Phase 09 — OpenAI · Anthropic 어댑터 + 제공자별 단가 (next)

## Current Position

Phase: 09 — context gathered (09-CONTEXT.md)
Plan: —
Status: Phase 09 discuss 완료 2026-09-19. BUG-04 정책 확정(사고 토큰 출력 단가 차감) 및 수정 완료 2026-09-22. Open issues: .planning/phases/08-provider-adapter-idempotent-debit/bugs/ (BUG-01, 02, 03, 05, 06 open; BUG-04 fixed, output-truncation half deferred pending real-usage data). BUG-01은 Phase 4 원인 버그로 확인되어 Phase 15로 승격됨.
Last activity: 2026-09-22 — BUG-01 수정 범위를 v1.1 마지막 Phase 15로 승격하고 AIDOC-01~04 매핑, BUG-04 사고 토큰 차감 누락 수정 (lib/ai/cost.ts, lib/ai/chat.ts)

> **progress 카운터는 마일스톤(v1.1) 기준이다** — Phase 8~15 기준 1/8 완료. v1.0에서 완료된 29개 plan은 아래 "v1.0 잔여"와 ROADMAP.md Progress 표에서 확인한다.

**v1.1 리서치 (완료 2026-09-16):** `.planning/research/` 5종 — FEATURES(기능 지형)·ARCHITECTURE(어댑터/BYOK 신뢰경계/MCP 배치)·STACK(호출 계층·암호화·MCP 구현체)·PITFALLS(키 유출·과금 경계·MCP 보안)·SUMMARY(합본). v1.0 리서치는 `.planning/research/v1.0/`로 아카이브됨.

**v1.1 페이즈 구조:**

| Phase | 목표 | Requirements |
|-------|------|--------------|
| 8 | 프로바이더 어댑터 기반 · 멱등 차감 수정 | PROV-01, COST-01 |
| 9 | OpenAI · Anthropic 어댑터 + 제공자별 단가 | PROV-02, PROV-03, PROV-04, PROV-07 |
| 10 | BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지 | BYOK-01~04, PROV-05 |
| 11 | BYOK 호출 경로 · 사용 기록 · 실패 UX | BYOK-05~09, PROV-06, COST-02 |
| — | **하드 경계** (1단계 안정화 전 2단계 시작 금지) | — |
| 12 | MCP OAuth 기반 · 연결/해제 | MCP-01, MCP-08 |
| 13 | MCP 읽기 도구 + 집필 컨텍스트 번들 | MCP-02, MCP-03, MCP-04, MCP-09 |
| 14 | MCP 쓰기 도구 + 스튜디오 리뷰 큐 | MCP-05, MCP-06, MCP-07 |
| 15 | Jev 선계획 기반 AI 문서 생성 · 저장 위치 선택 | AIDOC-01~04 |

**v1.0 잔여 (별도 트랙, v1.1 로드맵에 포함하지 않음):**

- Phase 5 Real Payment Integration — Blocked (Toss 가맹점 키 대기)
- Phase 6 작가 90:10 정산 — 미구현
- Phase 7 Admin Moderation Surface — **완료(2026-09-17), 7/7**. 실제 DB·동시성·브라우저 UAT 통과. ⚠️ 미확인 2건(경고 확인 유지, 정지 사용자 화면) + 사소한 이슈(F-2 자기제재 문구, F-3 테스트 신고 잔여물)는 `.planning/todos/pending/2026-09-17-phase-07-deferred-browser-checks.md`에서 반드시 확인.
- Phase 4 라이브 GEMINI_API_KEY UAT — 미완

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: - min
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 P05 | 2 tasks | 8min | 8 files |
| 02 P01 | 3 tasks | 12min | 19 files |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 02 P02 | 15min | 2 tasks | 7 files |
| Phase 02 P03 | 6min | 2 tasks | 8 files |
| Phase 02 P04 | 15min | 2 tasks | 6 files |
| Phase 02 P05 | 5min | 2 tasks | 7 files |
| Phase 02 P06 | 12min | 2 tasks | 7 files |
| Phase 03 P01 | 20min | 2 tasks | 3 files |
| Phase 03 P02 | 15 | 2 tasks | 7 files |
| Phase 03 P03 | 10 | 2 tasks | 4 files |
| Phase 03 P04 | 10 | 2 tasks | 9 files |
| Phase 03 P05 | 12 | 2 tasks | 5 files |
| Phase 03 P06 | 25min | 3 tasks | 6 files |
| Phase 03 P07 | 15min | 3 tasks | 7 files |
| Phase 04 P01 | 15 | 3 tasks | 11 files |
| Phase 04 P02 | 25min | 3 tasks | 4 files |
| Phase 04 P03 | 8min | 2 tasks | 2 files |
| Phase 04 P04 | 12min | 3 tasks | 3 files |
| Phase 04 P05 | 12min | 3 tasks | 2 files |
| Phase 04 P06 | 35min | 3 tasks | 6 files |
| Phase 04.1 P01 | 25min | 2 tasks | 3 files |
| Phase 04.1 P02 | 12min | 2 tasks | 6 files |
| Phase 04.1 P03 | 20min | 2 tasks | 6 files |
| Phase 04.1 P04 | 20min | 3 tasks | 3 files |
| Phase 04.1-kb P05 | 25min | 3 tasks | 4 files |
| Phase 07 P01 | 25min | 2 tasks | 6 files |
| Phase 07 P02 | 35min | 2 tasks | 6 files |
| Phase 07 P04 | 25min | 2 tasks | 10 files |
| Phase 07 P06 | 35min | 2 tasks | 12 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Research phase: LLM vendor = Google Gemini (confirmed, feeds Phase 4)
- Research phase: PG = Toss Payments direct integration, no abstraction layer (confirmed, feeds Phase 5)
- Roadmap: Wallet/ledger proven with fake credits (Phase 1) before AI spend (Phase 4) or real payments (Phase 5) touch it — strongest cross-cutting signal from research, not to be re-ordered for convenience
- [Phase 01]: isAccountActive wired into app/account/page.tsx to satisfy D-08's 'soft-deleted accounts treated as inactive on next request' requirement; not yet wired into a global route gate since no general DAL/middleware layer exists in Phase 1
- [Phase 02]: Phase 02 Plan 01: works/kb_nodes/chapters schema + RLS + create_work/ensure_account_template_root/reorder_chapters functions live; lib/kb/templates.ts tested; dnd-kit + shadcn UI toolkit + indigo accent installed
- [Phase 02]: Phase 02 Plan 02: lib/works/actions.ts (createWork/listWorks/getWork) + /studio writer-role gate/작품 목록/새 작품 만들기 live; seedTemplateFiles retyped to real SupabaseClient (was ad-hoc duck type, caused TS2589)
- [Phase 02]: Plan 02-03: KB tree query + full node CRUD (createNode/renameNode/deleteNode/saveNodeContent) live in lib/kb/actions.ts; D-10 create-time template picker (listTemplateOptions) and defense-in-depth ownership/locked-folder guards proven at the Server-Action layer, independent of UI
- [Phase 02]: Plan 02-04: chapters ownership-scoped business logic (createChapter/saveChapterContent/publishChapter/unpublishChapter/reorderChapters/listChapters) live and tested; fixed 10/30/50/100 price tiers enforced at zod layer before DB CHECK; D-21/D-22 and reorder deferred-constraint behavior proven
- [Phase 02]: Plan 02-05: base-ui Tooltip/Select use render prop not asChild (this Next.js/base-ui version has no Radix asChild support); KB tree sidebar + create/rename/delete dialogs + D-10 template picker + D-12 single-textarea editor + D-14 pinned chapters nav link all wired end-to-end via Server Actions onto Plan 02-03's tested lib/kb/actions.ts
- [Phase 02]: Plan 02-06: chapter list/new-form/editor UI wired to lib/chapters/actions.ts (dnd-kit drag-reorder, shadcn Select price-tier dropdown, non-destructive unpublish confirm) — CONT-01/02/03 fully realized end-to-end, no new business logic or deviations
- [Phase 03]: Plan 03-01: reader schema migration (0003_reader.sql) live — works_public_read/chapters_public_read additive RLS fixes the reader-facing gap, chapters.view_count + increment_chapter_view SECURITY DEFINER RPC, and work_likes/reading_progress/reports/work_subscriptions/work_bookmarks tables with owner-scoped RLS; anonClient() test helper proves non-owner reads work
- [Phase 03]: Plan 03-02: lib/discovery/actions.ts listFeed + computeTrendingScores (batched work_likes .in() query, defensive normalize against non-finite inputs) and lib/chapters+works getPublicChapter/listPublicChapters/getPublicWork content-leak guards live; fixed a staged.totalViews/viewCount property mismatch from the plan's own reference code that silently zeroed the views component of trendingScore
- [Phase 03]: Plan 03-03: lib/reader/views.ts (incrementChapterView, D-09 anonymous-safe view-count RPC wrapper) and lib/reader/progress.ts (upsertReadingProgress/getReadingProgress/listRecentlyRead, D-14/D-15) live and tested; listRecentlyRead exposes chapterOrderIndex (0-based) for UI-SPEC's exact 'N화 읽는 중' copy contract
- [Phase 03]: Plan 03-04: likes/subscriptions/bookmarks share an identical select-then-insert-or-delete toggle keyed on (work_id, user_id); reports.ts exports REPORT_CATEGORIES as single source of truth matching the DB check constraint verbatim
- [Phase 03]: Plan 03-05: discovery feed home screen (app/page.tsx, FeedCard/FeedFilters/PromoBanner/RecentlyReadSection) live, sourced entirely from tested listFeed/listRecentlyRead; fixed base-ui Select onValueChange null-vs-undefined typing
- [Phase 03]: Plan 03-06: work detail page (3-tab 소개/작품설정/회차) live with 알림/선호작 header icons distinct from lower-page 좋아요/신고 controls; ReportDialog built as a shared component with onSubmit callback prop for Plan 03-07's viewer to reuse without duplication
- [Phase 03]: Plan 03-07: reading progress upsert gated behind if (!locked) in trackChapterOpenAction — a D-06 locked-chapter open never overwrites the reader's 이어보기 resume point; view_count still increments unconditionally per D-09
- [Phase 04]: Plan 04-01: lib/ai/cost.ts fixes wallet-token to Gemini-token exchange rate (Open Q1) and debits actual post-call usage not pre-call estimate (Open Q2); lib/ai/gemini.ts GeminiClient is fully mockable; server-only aliased to a no-op stub in vitest.config.ts to unblock unit tests
- [Phase 04]: Plan 04-02: lib/ai/mentions.ts (searchMentionNodes/quickAddMentionNode/getMentionedNodesContent) live and tested; reuses Phase 2's createNode for quick-add, never resolves inert [[ ]] wiki-link syntax in mentioned content per D-13; searchMentionsAction/quickAddMentionAction wired on the chapter editor route
- [Phase 04]: Plan 04-03: lib/ai/prompt.ts pure prompt-composition module live and tested (composeSystemInstruction/assembleUserContent) — D-14 baseline always included regardless of preset, D-15 4-style library with concise-hemingway default, D-08rev 3-level AI-지시 프리셋 with safe freeform fallback, D-10rev regeneration feedback folded additively; ready for Plan 04-04's generate/estimate actions to call
- [Phase 04]: Plan 04-04: lib/ai/generate.ts (generate/estimateCost) live and tested; wallet reads/writes route through createAdminClient() to fix the Wallet RLS Gap (0001_init.sql grants SELECT-only wallet policies, apply_wallet_delta not security definer) following app/account/actions.ts's precedent; D-13 cap-before-call/debit-after-call proven with a mocked GeminiClient
- [Phase 04]: Plan 04-05: AiPanel/GenerationPreview live — self-contained controlled AI panel wired to Plan 04-04's estimateCostAction/generateAction; genre Select onValueChange wrapped in null-coalescing callback (base-ui pattern) matching existing page.tsx convention
- [Phase 04]: Plan 04-06: MentionAutocomplete/QuickAddDialog live, page.tsx wires Textarea+AiPanel side-by-side (D-01) with cursor-position text insertion; found+fixed a page-breaking bug during live checkpoint verification — a client component importing KB_CATEGORIES (value, not type) from lib/kb/templates.ts pulled that module's node:fs/promises import into the browser bundle, panicking Turbopack on every chapter editor load; fixed by extracting KbCategory/KB_CATEGORIES into fs-free lib/kb/categories.ts. All 6 Phase 4 plans complete; live Gemini generation (cost estimate accuracy, real API round-trip, wallet debit against a real balance) still untested pending user-supplied GEMINI_API_KEY — do not treat EDIT-04/EDIT-05 as fully verified until that happens.

- [Phase 04.1]: Plan 04.1-01: schema migration (0004_kb_custom_folders.sql) live - kb_nodes.category widened to 회차/custom, Phase 2 lock regression fixed (all 7 structural folders locked), 회차 seeded+backfilled (D-06), chapters.folder_id added (D-05), guard trigger blocks KB files under 회차 (D-04), soft_delete_kb_node cascade-safe
- [Phase 04.1]: Plan 04.1-02: getWorkKbNodes/getAccountSharedNodes split + createFolder (server-derived category, root=custom/nested=inherited) live in lib/kb/actions.ts; fixed getKbTree-removal breakage in the live studio sidebar layout.tsx and document-crud.test.ts as blocking-issue deviations
- [Phase 04.1]: Plan 04.1-03: chapters.folder_id validated write path (assertChapterFolder, D-05) + groupChaptersByFolder pure UI-merge helper landed; /chapters/new accepts optional folderId. Executed in parallel with 04.1-02 in an isolated worktree that predated createFolder's merge, so its test used lib/kb/actions.ts's pre-existing createNode export instead — createFolder now exists on master post-merge and is unaffected.
- [Phase 04.1]: Plan 04.1-04: lib/ai/mentions.ts searchMentionNodes/getMentionedNodesContent made cross-scope-aware (work-scoped + account_template-scoped, two-query-then-merge, owner_id-scoped one-directional per D-10); MentionAutocomplete.tsx shows '계정 공유'/'사용자 폴더' trailing text per UI-SPEC Copywriting Contract, never the raw category sentinel; live-verified end-to-end against a real Gemini call — confirmed the mention picker is wired to the main manuscript Textarea (not the AiPanel chat input), and getMentionedNodesContent's fix correctly surfaces account-shared doc content in chat replies
- [Phase 04.1-kb]: Plan 04.1-05: two-section KB sidebar (작품 폴더/계정 공유 폴더) with folder-creation at both roots and every folder row; 회차 folded into the tree as a Link with chapter leaves via chaptersByFolderId; standalone ChaptersNavLink removed

- [Phase 06]: Implemented outside the GSD plan flow (commits 57e1c8e/fc8a4a5, report at docs/commerce-entitlements.md) — 0005_commerce.sql adds orders/order_items/entitlements + RLS + purchase RPC; lib/commerce/actions.ts, lib/access/actions.ts, lib/chapters/actions.ts, components/reader/viewer-shell.tsx wire purchase→immediate view; idempotency via orders(user_id, idempotency_key) UNIQUE. Built directly on the Phase 1 token wallet with NO real top-up path, inverting the roadmap's intended 5→6 order — real-currency charging was explicitly out of scope per its own report. No PLAN/SUMMARY/VERIFICATION artifacts exist for this phase.
- [Phase 07]: Plan 07-01: admin_users membership granted only via privileged SQL grant_admin/revoke_admin (not executable by service_role); apply_user_sanction is the single cache write path and requires a matching admin_actions row; cache = permanent dominates, else max timed expiry since last lift; warnings never touch cache
- [Phase 07]: 07-02: Stale = reviewed report not open or target version changed; late reports stay open
- [Phase 07]: 07-02: Operative actions need internal + public reason; resolve/dismiss note optional
- [Phase 07]: 07-02: lib/admin exports authorize before validating; actor always session-derived
- [Phase 07]: 07-04: blind precedence over free/entitled in SQL; entitlement reported separately; purchases raise content_blinded before debit
- [Phase 07]: Warning notices use session client + own-row RLS; AccountNotices loads after hydration so failures never block render/login
- [Phase 07]: purchaseChapterAction rechecks access state: blinded refused before order, owned retry returns ok without charge

### Roadmap Evolution

- Phase 04.1 inserted after Phase 4: 사용자 정의 폴더 기능 (KB 커스텀 폴더 + 회차 폴더 트리) (URGENT)
- Phase 6 executed ahead of Phase 5 and outside GSD (2026-09-15 discovery) — roadmap order 5→6 no longer reflects build order; Phase 5 now layers real top-up onto an already-shipped unlock flow
- v1.1 milestone planned for multi-provider AI + BYOK (branch `codex/multi-provider-byok`, goals in `docs/ai-integration-roadmap.md`) — deliberately NOT folded into Phase 4, whose EDIT-01~05 success criteria are Gemini-single-provider
- 2026-09-16: v1.1 로드맵 추가 — Phase 8~14 (7개), v1.1 요구사항 27개 전수 매핑. v1.0 잔여 Phase 5/6/7은 별도 트랙으로 그대로 남아 있으며 v1.1 범위가 아니다
- 2026-09-22: Phase 4 BUG-01의 수정 범위가 Jev 평가·선계획, Gemini 템플릿 생성, 폴더/템플릿 선택 UI와 저장 권한 검증까지 확장되어 단일 버그 수정 단위를 초과함. v1.1 마지막 Phase 15로 승격하고 AIDOC-01~04를 배정함
- 로드맵 순서 고정 제약(편의로 재배열하지 않을 것): (1) 로컬 토큰 추정이 어댑터 시그니처의 선행 조건(원격 countTokens는 Gemini 전용), (2) 어댑터+Gemini 이관(P8) 이 OpenAI/Anthropic(P9)보다 먼저 회귀 증명돼야 함, (3) 멱등 차감(COST-01, P8)이 재시도/백오프 로직(P11)보다 먼저, (4) BYOK 키 검증과 모델 피커 배지는 같은 페이즈(P10), (5) MCP OAuth는 BYOK와 코드를 공유하지 않으므로 합치지 않음, (6) MCP 리뷰 큐 UI는 실제 스코프(축소 금지)

### Pending Todos

- **[v1.1 Phase 8 병행 착수]** OpenAI Organization Verification(정부 신분증 기반) + Anthropic 빌링·rate-limit tier 신청을 Phase 8 킥오프와 동시에 시작한다 — v1.0 Phase 5의 PG 심사와 구조적으로 동일한 외부 큐라서 늦게 시작하면 Phase 9가 통째로 대기한다.
- **[v1.1 Phase 10 계획 시점 결정]** BYOK 키 암호화 방식(Supabase Vault vs 앱 레벨 AES-256-GCM)을 페이즈 **계획 시점에** 확정한다 — 구현 중 미루면 데이터 마이그레이션이 된다. (PROJECT.md Key Decisions의 Pending 항목)
- **[v1.1 Phase 12 선행 스파이크]** 실제 Claude 커스텀 커넥터로 discovery → 등록 → 토큰 교환 왕복을 먼저 성공시켜 authorization server를 확정(Supabase Auth OAuth 2.1 Server vs WorkOS AuthKit). 실패하면 페이즈 내용 자체가 바뀜다. `/gsd:research-phase` 필수.
- **[v1.1 정리]** 워크트리의 `mcpres/`(수동 다운로드한 tarball + 추출 디렉터리)는 커밋 대상이 아니다 — 채택 시 npm registry에서 정식 설치하고 `mcpres/`는 삭제한다.
- **[v1.1 Phase 15 계획 전]** BUG-01 문서의 해결 설계를 입력으로 `/gsd:discuss-phase 15`와 `/gsd:research-phase 15`를 수행한다. Jev 데이터 처리 정책과 평가 기준이 확정되기 전에는 실제 작품 본문을 프로덕션 Jev 호출에 보내지 않는다.

- Supply GEMINI_API_KEY and re-verify live generation flow (cost estimate, generate, accept/regenerate, low-balance banner) before treating Phase 4's EDIT-04/EDIT-05 as fully verified end-to-end. (Phase 4 is marked Complete on the roadmap; this is the one outstanding human UAT item — see 04-VERIFICATION.md `human_verification`.)
- **[Phase 06, v1.0 residual]** Implement the author 90/10 credit split with the 10% platform fee behind a single adjustable constant (ROADMAP Phase 6 success criterion 3, provisional per 06-CONTEXT.md D-10). Confirmed absent from lib/commerce/actions.ts and 0005_commerce.sql on 2026-09-15. Decision: keep in v1.0, handle alongside Phase 5 when the Toss keys arrive.
- **[Phase 06, v1.0 residual]** Complete runtime verification against ROADMAP criteria when the environment is available. 06-VERIFICATION.md now records a source audit with gaps_found; it does not claim a gsd-verifier agent run or SQL/RLS/E2E success. Keep the user's DB-test deferral in effect.

### Blockers/Concerns

- **[v1.1] 벤더 온보딩 리드타임이 Phase 9의 잠재 차단요인이다.** OpenAI Organization Verification과 초기 rate-limit tier는 코드로 해결할 수 없는 외부 큐다. Phase 8 착수와 동시에 신청하고 여기서 상태를 추적한다.
- **[v1.1] Phase 9 선행:** BUG-04(Gemini 사고 토큰 차감 누락)를 Phase 9 착수 전에 `/gsd:quick`으로 수정한다(09-CONTEXT D-13). Gemini 고성능 슬롯을 실제 Pro 모델로 바꾸려면 Google 프로젝트 결제 활성화가 필요하다(09-CONTEXT D-04, 외부 작업).
- **[v1.1] 현존하는 정합성 버그:** `lib/ai/chat.ts`가 `p_reference_id`에 매 호출 새 `crypto.randomUUID()`를 넘겨 원장의 중복 방지 제약을 무력화하고 있다(COST-01, Phase 8). 재시도 로직을 먼저 넣으면 429 재시도가 이중 차감을 만든다.
- **[v1.1] BYOK 키는 응답 본문이 아니라 Error 객체의 request config(`Authorization` 헤더)를 통해 새난다.** 관찰성 목적의 `console.error(err)` 한 줄이면 끝이고 로그는 회수 불가능하다. 스크러밍 choke point를 어댑터 인터페이스와 **같이** 출하한다(Phase 8).
- **[v1.1] MCP 도구가 `createAdminClient()` 관행을 복사하면 confused deputy가 된다.** Server Action에서 옆았던 패턴이 bearer 토큰 호출에서는 교차 사용자 읽기/쓰기를 열어준다(Phase 13/14).
- **[v1.1] "연결 해제 후 즉시 차단"은 stateless JWT 검증으로 구조적으로 달성 불가능하다.** 매 호출 grant introspection을 Phase 12 설계에 처음부터 넣어야 하며 나중에 붙일 수 없다.

- **Toss Payments merchant keys are now the active blocker on Phase 5.** Confirmed 2026-09-15: no Toss client, widget, or webhook handler exists anywhere in the repo. Phase 5's CONTEXT/RESEARCH/UI-SPEC/VALIDATION are all complete and ready for /gsd:plan-phase — only the keys are missing. Pitfalls research flagged the merchant application + 사업자등록 (~2+ week external review) as the likely real critical path to launch.
- 선불전자지급수단 (prepaid payment instrument) regulatory classification not yet confirmed by a PG compliance team or lawyer — current no-cash-out, single-merchant design appears to qualify for exemption but this is unverified. Not blocking v1, but must be revisited before ever scoping cash-out or an asset store.
- Phase 4 (AI Gateway) and Phase 5 (Real Payment Integration) were flagged by research as needing a dedicated research-phase pass before detailed planning (Gemini rate-limit/pricing/context-window specifics; Toss webhook payload verification against live docs).
- (Resolved 2026-08-28) Kakao login was blocked by KOE205: Supabase's Kakao provider requests `account_email profile_image profile_nickname` as a fixed scope set, but only `account_email` was enabled as a consent item in Kakao Developers console. Fixed by enabling all three consent items. Any future Kakao/OAuth provider work should check ALL requested scopes against console config, not just the one business logic cares about.
- SUPABASE_DB_URL unreachable (tenant/user not found) - Phase 7 DB suites verified only on local PGlite; real Supabase apply + rerun required before 07-07

## Session Continuity

Last session: 2026-09-22T04:45:13.012Z
Stopped at: Phase 15 context gathered
Next: 두 트랙이 열려 있다 —

  - **v1.1:** `/gsd:plan-phase 8` (Phase 8은 기존 `lib/ai/gemini.ts` DI 패턴 일반화 + commerce `idempotencyKey` 패턴 복제라 research-phase 생략 가능; Phase 12는 research-phase 필수)
  - **v1.0 잔여:** `/gsd:plan-phase 7` — 컨텍스트 수집 완료. 프론트 비중이 커 `/gsd:ui-phase 7`을 먼저 돌리는 것도 가능

Resume file: .planning/phases/15-jev-ai/15-CONTEXT.md

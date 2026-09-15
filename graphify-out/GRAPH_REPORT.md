# Graph Report - NovelScript  (2026-09-15)

## Corpus Check
- 485 files · ~354,202 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1291 nodes · 2368 edges · 144 communities (89 shown, 49 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `57e1c8e7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- kb-node-dialogs.tsx
- createTestUser
- viewer-shell.tsx
- chapter-list.tsx
- works/[workId]/page.tsx
- dependencies
- createClient
- Home Discovery Data Dictionary
- components.json
- package.json
- Social Sign-In Rules
- cn
- compilerOptions
- Phase 6: Paid Chapter Unlock - Context
- SSOT Coverage Report
- KB Folder Context
- kb/actions.ts
- command.tsx
- Workspace Work Entity
- Project Research Summary
- AiPanel.tsx
- Graphify 후속 조사 질문
- studio/[workId]/chapters/[chapterId]/actions.ts
- devDependencies
- Studio Foundation Plan
- app/layout.tsx
- Wallet Schema Plan
- session-refresh.test.ts
- Authentication Callback Design
- [workId]/layout.tsx
- work-header-actions.tsx
- Graphify Pipeline
- popover.tsx
- Readable Chapter
- Phase 02 Plan 02: Studio Work Creation & Writer Gate Summary
- AI Gateway Context
- platty-windows-path-fix.cjs
- KB UI Design Contract
- Phase 4 Plan 4 Generate Estimate and Wallet Lifecycle Plan
- Phase 02 Plan 04: Chapter Business Logic (Draft/Publish/Edit/Unpublish/Reorder) Summary
- Phase 02 Plan 05: KB Tree Sidebar + Document Editor + Template Picker Summary
- Work Entity
- NovelScript v1 Requirements
- Phase 02 Plan 01: Studio Core Foundation Summary
- Chapter Planning Rules
- Chapter Reading Rules
- scripts
- Phase 02 Plan 03: KB Tree Query + Node CRUD Summary
- Phase 02 Plan 06: Chapter List, Draft Form & Publish Editor Summary
- Epic Catalog
- New Work Creation Overview
- Chapter Editing Data Model
- Account Profile
- database.test.ts
- Next.js Agent Rules
- Account Overview Data Dictionary
- Knowledge Base Node Entity
- Close Account and End Session
- Identity Completion Data Dictionary
- Chapter Editing Use Cases
- Work Detail and Engagement System Design
- Profile Entity
- Authenticated Reader Starts Writer Onboarding
- Foundation and Wallet Research
- Phase 3 Plan 3 View Tracking and Reading Progress Plan
- Phase 3 Plan 4 Reader Engagement Plan
- Phase 3 Plan 5 Discovery Feed UI Plan
- Phase 3 Plan 6 Public Work Detail Plan
- Phase 3 Plan 7 Chapter Viewer Plan
- Phase 3 Reader Core Context
- Phase 3 Validation Strategy
- Account Overview Business Rules
- Account Overview
- Identity Completion Business Rules
- Identity Completion Overview
- Chapter Editing and Publishing Rules
- Profile Entity
- Writer Upgrade Business Rules
- New Work Screen
- eslint.config.mjs
- postcss.config.mjs
- Document Content Lines
- Global Web Symbol
- Next.js Framework
- Solid Triangle Mark
- Browser Window Icon
- Phase 3 Plan 2 Discovery Feed and Public Reader Guards Summary
- Phase 3 Reader Core Discussion Log
- Phase 3 UI Design Contract
- Phase 3 Deferred Items
- Graphify Project Workflow
- Phase 03 Plan 01: Reader Schema Migration Summary
- Integrated Payment System and Global Header
- External Services Catalog
- Database Table Catalog
- Account Overview Memory
- Account Overview Persona
- Identity Completion Memory
- Identity Completion Persona
- Wallet Entity
- AI Writing Assistance Memory
- Wallet Entity
- Work Detail and Engagement Memory
- Work Detail and Engagement Persona
- Unresolved Epic Rationale
- Unresolved Epic Context
- Character Template
- Event Template
- Faction Template
- Item Template
- Location Template
- Common Pitfalls
- Phase 6: Paid Chapter Unlock - Research
- 1. 개요.md
- Phase 2 — UI Design Contract
- Phase 6: Paid Chapter Unlock - Discussion Log
- Codex TDD 파이프라인
- Phase 2: Studio Core (Writer Loop, No AI) - Discussion Log
- Phase 2 — Validation Strategy
- Phase 5: Real Payment Integration - Discussion Log
- Focused Re-research: Unresolved 3 Questions
- 5-3 에셋 스토어 UI,UX 설계 및 정책.md
- Phase 1: Foundation & Wallet Infrastructure - Discussion Log
- 2. 핵심 기능 요구사항.md
- 2. 웹 에디터 (Web IDE) - 3단 분할 캔버스
- Atomic Unlock RPC
- Validation Architecture
- 3. 비즈니스 모델 및 사용자 정책.md
- 4. 시스템 아키텍처 및 기술 스택.md
- 5-1.독자 공간 UI,UX 설계 및 운영 시스템.md
- Q: c:\Users\MSI\NovelScript\.planning\phases\06-paid-chapter-unlock\06-CONTEXT.md 해당 문서를 기준으로 필요한 자료를 리서치해줘. 리서치한 결과는 문서로 남겨줘
- Q: 06-CONTEXT.md의 Unresolved 섹션 3개 질문과 D-12 영향만 좁혀서 06-RESEARCH.md 재조사
- Client and UX Architecture
- Current Codebase Findings
- Constraints and Requirements
- Deferred Items — Phase 02
- Deferred Items — Phase 04.1-kb
- Paid Content Access Boundary

## God Nodes (most connected - your core abstractions)
1. `cn()` - 79 edges
2. `createClient()` - 65 edges
3. `createTestUser()` - 53 edges
4. `vitest` - 42 edges
5. `deleteTestUser()` - 34 edges
6. `adminClient()` - 32 edges
7. `react` - 26 edges
8. `lucide-react` - 22 edges
9. `@supabase/supabase-js` - 21 edges
10. `Button()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `CommandDialog()` --calls--> `cn()`  [EXTRACTED]
  components/ui/command.tsx → lib/utils.ts
- `CommandInput()` --calls--> `cn()`  [EXTRACTED]
  components/ui/command.tsx → lib/utils.ts
- `CommandSeparator()` --calls--> `cn()`  [EXTRACTED]
  components/ui/command.tsx → lib/utils.ts
- `CommandShortcut()` --calls--> `cn()`  [EXTRACTED]
  components/ui/command.tsx → lib/utils.ts
- `DropdownMenuItem()` --calls--> `cn()`  [EXTRACTED]
  components/ui/dropdown-menu.tsx → lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Authentication Callback Document Set** — docs_ssot_epics_ddmjkqzqpk1w1e5hisfvy_br_authentication_callback_rules, docs_ssot_epics_ddmjkqzqpk1w1e5hisfvy_data_dictionary_authentication_callback_data_dictionary, docs_ssot_epics_ddmjkqzqpk1w1e5hisfvy_design_authentication_callback_design, docs_ssot_epics_ddmjkqzqpk1w1e5hisfvy_overview_authentication_callback_overview, docs_ssot_epics_ddmjkqzqpk1w1e5hisfvy_usecases_ucl_authentication_callback_use_case [EXTRACTED 1.00]
- **Chapter Planning Document Set** — docs_ssot_epics_bsrh96oqqvvy_mcmdspwk_br_chapter_planning_rules, docs_ssot_epics_bsrh96oqqvvy_mcmdspwk_data_dictionary_chapter_planning_data_dictionary, docs_ssot_epics_bsrh96oqqvvy_mcmdspwk_design_chapter_planning_design, docs_ssot_epics_bsrh96oqqvvy_mcmdspwk_overview_chapter_planning_overview, docs_ssot_epics_bsrh96oqqvvy_mcmdspwk_usecases_ucl_chapter_planning_use_cases [EXTRACTED 1.00]
- **Chapter Reading Document Set** — docs_ssot_epics_dwvdypycp2wh37vaxyhtu_br_chapter_reading_rules, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_data_dictionary_chapter_reading_data_dictionary, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_design_chapter_reading_design, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_overview_chapter_reading_overview, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_usecases_ucl_chapter_reading_use_cases [EXTRACTED 1.00]
- **Home Discovery Document Set** — docs_ssot_epics_y10onyspusuqdchl5bb47_br_home_discovery_rules, docs_ssot_epics_y10onyspusuqdchl5bb47_data_dictionary_home_discovery_data_dictionary, docs_ssot_epics_y10onyspusuqdchl5bb47_design_home_discovery_design, docs_ssot_epics_y10onyspusuqdchl5bb47_overview_home_discovery_overview, docs_ssot_epics_y10onyspusuqdchl5bb47_usecases_ucl_home_discovery_use_cases [EXTRACTED 1.00]
- **Login Error Recovery Document Set** — docs_ssot_epics_4m8kg11em9a1cutwjcwoz_br_login_error_recovery_rules, docs_ssot_epics_4m8kg11em9a1cutwjcwoz_data_dictionary_login_error_data_dictionary, docs_ssot_epics_4m8kg11em9a1cutwjcwoz_design_login_error_recovery_design, docs_ssot_epics_4m8kg11em9a1cutwjcwoz_overview_login_error_recovery_overview, docs_ssot_epics_4m8kg11em9a1cutwjcwoz_usecases_ucl_return_to_sign_in_use_case [EXTRACTED 1.00]
- **New Work Creation Document Set** — docs_ssot_epics_42ab4zt1f3dtaxtt59vzh_design_new_work_creation_design, docs_ssot_epics_42ab4zt1f3dtaxtt59vzh_memory_new_work_creation_rationale, docs_ssot_epics_42ab4zt1f3dtaxtt59vzh_overview_new_work_creation_overview, docs_ssot_epics_42ab4zt1f3dtaxtt59vzh_persona_new_work_creation_personas, docs_ssot_epics_42ab4zt1f3dtaxtt59vzh_usecases_ucl_create_new_work_use_case [EXTRACTED 1.00]
- **Phase 04.1 KB Folder Delivery** — _planning_phases_04_1_kb_04_1_01_summary_kb_schema_result, _planning_phases_04_1_kb_04_1_02_summary_kb_folder_actions_result, _planning_phases_04_1_kb_04_1_03_summary_chapter_folders_result, _planning_phases_04_1_kb_04_1_04_summary_cross_scope_mentions_result, _planning_phases_04_1_kb_04_1_05_summary_kb_tree_ui_result [EXTRACTED 1.00]
- **Phase 04 AI Gateway Delivery** — _planning_phases_04_ai_gateway_mention_based_generation_04_04_summary_ai_generation_lifecycle, _planning_phases_04_ai_gateway_mention_based_generation_04_05_summary_ai_panel_result, _planning_phases_04_ai_gateway_mention_based_generation_04_06_summary_mention_editor_wiring_result, _planning_phases_04_ai_gateway_mention_based_generation_04_verification_ai_gateway_verification [EXTRACTED 1.00]
- **Social Sign-In Document Set** — docs_ssot_epics_8v1lqnjku9izithej79gq_br_social_sign_in_rules, docs_ssot_epics_8v1lqnjku9izithej79gq_data_dictionary_social_sign_in_data_dictionary, docs_ssot_epics_8v1lqnjku9izithej79gq_design_social_sign_in_design, docs_ssot_epics_8v1lqnjku9izithej79gq_overview_social_sign_in_overview, docs_ssot_epics_8v1lqnjku9izithej79gq_usecases_ucl_google_and_kakao_sign_in_use_case [EXTRACTED 1.00]
- **Story Knowledge Document Set** — docs_ssot_epics_ej5obxr2ixghdipajzfza_br_story_knowledge_rules, docs_ssot_epics_ej5obxr2ixghdipajzfza_data_dictionary_story_knowledge_data_dictionary, docs_ssot_epics_ej5obxr2ixghdipajzfza_design_story_knowledge_design, docs_ssot_epics_ej5obxr2ixghdipajzfza_overview_story_knowledge_overview, docs_ssot_epics_ej5obxr2ixghdipajzfza_usecases_ucl_story_knowledge_update_use_case [EXTRACTED 1.00]
- **Work Portfolio Document Set** — docs_ssot_epics_yzfrm9l4_rmevijwngvdf_br_work_portfolio_rules, docs_ssot_epics_yzfrm9l4_rmevijwngvdf_data_dictionary_work_portfolio_data_dictionary, docs_ssot_epics_yzfrm9l4_rmevijwngvdf_design_work_portfolio_design, docs_ssot_epics_yzfrm9l4_rmevijwngvdf_overview_work_portfolio_overview, docs_ssot_epics_yzfrm9l4_rmevijwngvdf_usecases_ucl_work_portfolio_use_case [EXTRACTED 1.00]
- **Work Workspace Document Set** — docs_ssot_epics__pnwofz1iq27y_rvakg7q_data_dictionary_work_workspace_data_dictionary, docs_ssot_epics__pnwofz1iq27y_rvakg7q_design_work_workspace_design, docs_ssot_epics__pnwofz1iq27y_rvakg7q_overview_work_workspace_overview, docs_ssot_epics__pnwofz1iq27y_rvakg7q_usecases_ucl_work_workspace_use_case [EXTRACTED 1.00]
- **Chapter Editing and Publishing Epic** — docs_ssot_epics_kwzv2pfyljucdxe3s4ruy_br_chapter_rules, docs_ssot_epics_kwzv2pfyljucdxe3s4ruy_data_dictionary_chapter_data, docs_ssot_epics_kwzv2pfyljucdxe3s4ruy_design_chapter_design, docs_ssot_epics_kwzv2pfyljucdxe3s4ruy_overview_chapter_editing, docs_ssot_epics_kwzv2pfyljucdxe3s4ruy_usecases_ucl_chapter_use_cases [EXTRACTED 1.00]
- **Custom KB Folder Delivery** — _planning_phases_04_1_kb_04_1_research_custom_kb_architecture, _planning_phases_04_1_kb_04_1_ui_spec_kb_ui_contract, _planning_phases_04_1_kb_04_1_validation_kb_validation, _planning_phases_04_1_kb_04_1_verification_kb_verification [EXTRACTED 1.00]
- **Phase 2 Studio Delivery Chain** — _planning_phases_02_studio_core_writer_loop_no_ai_02_01_plan_studio_foundation, _planning_phases_02_studio_core_writer_loop_no_ai_02_02_plan_work_creation, _planning_phases_02_studio_core_writer_loop_no_ai_02_03_plan_kb_tree, _planning_phases_02_studio_core_writer_loop_no_ai_02_04_plan_chapter_logic, _planning_phases_02_studio_core_writer_loop_no_ai_02_05_plan_kb_ui, _planning_phases_02_studio_core_writer_loop_no_ai_02_06_plan_chapter_ui [EXTRACTED 1.00]
- **Phase One Foundation Delivery** — _planning_phases_01_foundation_wallet_infrastructure_01_01_summary_service_setup_result, _planning_phases_01_foundation_wallet_infrastructure_01_02_summary_safe_wallet, _planning_phases_01_foundation_wallet_infrastructure_01_03_summary_persistent_sessions, _planning_phases_01_foundation_wallet_infrastructure_01_04_summary_social_login, _planning_phases_01_foundation_wallet_infrastructure_01_05_summary_writer_upgrade [EXTRACTED 1.00]
- **Project Research Synthesis** — _planning_research_architecture_platform_architecture, _planning_research_features_mvp_features, _planning_research_pitfalls_critical_pitfalls, _planning_research_stack_recommended_stack, _planning_research_summary_project_research [EXTRACTED 1.00]
- **Work Detail Engagement Data Model** — docs_ssot_epics_sx2rofqnfuidxisglpv7_data_dictionary_dd_work_work, docs_ssot_epics_sx2rofqnfuidxisglpv7_data_dictionary_dd_chapter_chapter, docs_ssot_epics_sx2rofqnfuidxisglpv7_data_dictionary_dd_report_report, docs_ssot_epics_sx2rofqnfuidxisglpv7_data_dictionary_dd_workbookmark_work_bookmark, docs_ssot_epics_sx2rofqnfuidxisglpv7_data_dictionary_dd_worklike_work_like, docs_ssot_epics_sx2rofqnfuidxisglpv7_data_dictionary_dd_worksubscription_work_subscription [EXTRACTED 1.00]
- **Writer Upgrade Epic** — docs_ssot_epics_tpgbvklzxbibligt lr7za_br_writer_upgrade_rules, docs_ssot_epics_tpgbvklzxbibligt lr7za_data_dictionary_writer_upgrade_data, docs_ssot_epics_tpgbvklzxbibligt lr7za_design_writer_upgrade_design, docs_ssot_epics_tpgbvklzxbibligt lr7za_overview_writer_upgrade, docs_ssot_epics_tpgbvklzxbibligt lr7za_usecases_ucl_writer_onboarding [EXTRACTED 1.00]
- **Authentication Route Specifications** — docs_ssot_specs_api_2fde159fb522c598_submit_email_api, docs_ssot_specs_api_8a76daff30be0a0e_authentication_callback_api, docs_ssot_specs_screen_6fdd4676e546f1af_authentication_error_screen, docs_ssot_specs_screen_76d065974566dffc_complete_email_screen, docs_ssot_specs_screen_a7cdb96441808c92_login_screen [INFERRED 0.85]
- **Chapter Reader Data Flow** — docs_ssot_epics_dwvdypycp2wh37vaxyhtu_data_dictionary_chapter_readable_chapter, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_data_dictionary_readingprogres_reading_progress, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_data_dictionary_report_chapter_report, docs_ssot_epics_dwvdypycp2wh37vaxyhtu_data_dictionary_work_published_work [INFERRED 0.85]
- **Home Discovery Data Flow** — docs_ssot_epics_y10onyspusuqdchl5bb47_data_dictionary_entity_profile_discovery_profile, docs_ssot_epics_y10onyspusuqdchl5bb47_data_dictionary_entity_readingprogres_discovery_reading_progress, docs_ssot_epics_y10onyspusuqdchl5bb47_data_dictionary_entity_wallet_discovery_wallet, docs_ssot_epics_y10onyspusuqdchl5bb47_data_dictionary_entity_work_discovery_work, docs_ssot_epics_y10onyspusuqdchl5bb47_data_dictionary_entity_worklike_discovery_work_like [INFERRED 0.85]
- **Reader Discovery Screens** — docs_ssot_specs_screen_42c0b91560de2856_home_discovery_screen, docs_ssot_specs_screen_bbd206980080faeb_chapter_viewer_screen, docs_ssot_specs_screen_d6376afdb89fc8b8_public_work_detail_screen [INFERRED 0.85]
- **Writer Studio Screens** — docs_ssot_specs_screen_28a1521fad1225bb_new_chapter_screen, docs_ssot_specs_screen_31e04d36ea04448b_new_work_screen, docs_ssot_specs_screen_5ed7abf91158a5ea_knowledge_base_editor_screen, docs_ssot_specs_screen_62d6b6c1b8099f81_studio_work_list_screen, docs_ssot_specs_screen_6b8128ed6b4fe6f7_chapter_list_screen, docs_ssot_specs_screen_a4992bce897aaf20_chapter_editor_screen, docs_ssot_specs_screen_cba5f8214d2acb18_studio_work_home_screen [INFERRED 0.85]
- **Account Overview SSOT Bundle** — docs_ssot_epics_0of0hlk2djttwk5y_fqcj_br_document, docs_ssot_epics_0of0hlk2djttwk5y_fqcj_data_dictionary_document, docs_ssot_epics_0of0hlk2djttwk5y_fqcj_design_document, docs_ssot_epics_0of0hlk2djttwk5y_fqcj_overview_document, docs_ssot_epics_0of0hlk2djttwk5y_fqcj_persona_document, docs_ssot_epics_0of0hlk2djttwk5y_fqcj_usecases_ucl_document [INFERRED 0.95]

## Communities (144 total, 49 thin omitted)

### Community 0 - "kb-node-dialogs.tsx"
Cohesion: 0.20
Nodes (18): RANKING_BASIS_LABEL, SCOPE_LABEL, TemplateOption, Button(), buttonVariants, Dialog(), DialogContent(), DialogFooter() (+10 more)

### Community 1 - "createTestUser"
Cohesion: 0.09
Nodes (39): ViewerPage(), assertChapterFolder(), ChapterMutationResult, createChapter(), createChapterSchema, findOwnedChapter(), getPublicChapter(), listPublicChapters() (+31 more)

### Community 2 - "viewer-shell.tsx"
Cohesion: 0.11
Nodes (17): ReportDialog(), TocSheet(), ViewTracker(), FONT_SIZES, THEME_OPTIONS, ViewerSettingsSheet(), THEME_CLASS, ViewerTheme (+9 more)

### Community 3 - "chapter-list.tsx"
Cohesion: 0.33
Nodes (4): ChapterListItem, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities

### Community 4 - "works/[workId]/page.tsx"
Cohesion: 0.07
Nodes (46): submitReportAction(), toggleBookmarkAction(), toggleLikeAction(), toggleSubscriptionAction(), purchaseChapterAction(), submitReportAction(), trackChapterOpenAction(), WorkDetailPage() (+38 more)

### Community 5 - "dependencies"
Cohesion: 0.08
Nodes (26): dependencies, @base-ui/react, class-variance-authority, clsx, cmdk, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities (+18 more)

### Community 6 - "createClient"
Cohesion: 0.05
Nodes (50): deleteAccountAction(), AccountPage(), GET(), submitEmail(), HomePage(), VALID_BASES, StudioLayout(), WorkListPage() (+42 more)

### Community 7 - "Home Discovery Data Dictionary"
Cohesion: 0.12
Nodes (23): Work Detail Engagement Use Cases, Home Discovery Rules, Discovery Profile, Discovery Reading Progress, Discovery Wallet, Discovery Work, Discovery Work Like, Home Discovery Data Dictionary (+15 more)

### Community 8 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 9 - "package.json"
Cohesion: 0.08
Nodes (23): name, private, version, @base-ui/react, clsx, cmdk, drizzle-orm, eslint (+15 more)

### Community 10 - "Social Sign-In Rules"
Cohesion: 0.13
Nodes (20): Login Error Recovery Rules, Login Error Data Dictionary, Login Error Screen State, Login Page Destination, Missing Login Model Evidence, Login Error Recovery Design, Login Error Recovery Rationale, Login Error Recovery Overview (+12 more)

### Community 11 - "cn"
Cohesion: 0.16
Nodes (19): DialogOverlay(), InputGroup(), InputGroupAddon(), inputGroupAddonVariants, InputGroupButton(), inputGroupButtonVariants, InputGroupInput(), InputGroupText() (+11 more)

### Community 12 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 13 - "Phase 6: Paid Chapter Unlock - Context"
Cohesion: 0.08
Nodes (23): Canonical References, Claude's Discretion, Deferred Ideas, Established Patterns, Existing Code Insights, Implementation Decisions, Integration Points, Phase 6: Paid Chapter Unlock - Context (+15 more)

### Community 14 - "SSOT Coverage Report"
Cohesion: 0.14
Nodes (18): SSOT Coverage Report, Submit Writer Upgrade API, Submit Email API, Authentication Callback API, Delete Account API, Account Settings Screen, New Chapter Screen, Home Discovery Screen (+10 more)

### Community 15 - "KB Folder Context"
Cohesion: 0.16
Nodes (17): KB Folder Schema Plan, KB Folder Schema Result, KB Folder Actions Plan, KB Folder Actions Result, Chapter Folders Plan, Chapter Folders Result, Cross-Scope Mentions Plan, Cross-Scope Mentions Result (+9 more)

### Community 16 - "kb/actions.ts"
Cohesion: 0.09
Nodes (38): saveDocumentProposalAction(), AiPanelProps, QuickAddDialogProps, createFolderAction(), createNodeAction(), deleteNodeAction(), getNodeContentAction(), listTemplateOptionsAction() (+30 more)

### Community 17 - "command.tsx"
Cohesion: 0.12
Nodes (20): quickAddMentionAction(), searchMentionsAction(), CATEGORY_ICON, MentionAutocomplete(), MentionAutocompleteProps, MentionCandidate, mentionTrailingText(), QuickAddDialog() (+12 more)

### Community 18 - "Workspace Work Entity"
Cohesion: 0.16
Nodes (15): Workspace Work Entity, Work Workspace Data Dictionary, Work Workspace Design, Work Workspace Rationale, Work Workspace Overview, Work Workspace Persona, Work Workspace Use Case, Story Knowledge Rules (+7 more)

### Community 19 - "Project Research Summary"
Cohesion: 0.22
Nodes (9): Real Payment Integration Decisions, Real Payment Architecture Research, Payment UI Design Contract, Payment Validation Strategy, NovelScript Platform Architecture, MVP Feature Set, Critical Product and Architecture Pitfalls, Recommended Technology Stack (+1 more)

### Community 20 - "AiPanel.tsx"
Cohesion: 0.12
Nodes (18): MentionedNode, PRESET_LEVEL_META, PRESET_LEVELS, STYLE_IDS, DropdownMenu(), DropdownMenuCheckboxItem(), DropdownMenuContent(), DropdownMenuGroup() (+10 more)

### Community 21 - "Graphify 후속 조사 질문"
Cohesion: 0.09
Nodes (21): Graphify 후속 조사 질문, Q1. AI 생성과 지갑 차감의 일관성, Q1 결과: 지갑 변경은 원자적, AI 요청 전체는 비원자적, Q2 결과: 인증 ID는 강제되지만 활성 계정·AI 대상 검사가 분산됨, Q2. 관리자 클라이언트의 권한 경계, Q3 결과: 발행·열람 흐름과 기록 무결성, Q3. 발행에서 독자 화면까지, Q4 결과: 앱 응답에서 제거하지만 공개 RLS에는 유료 구분이 없음 (+13 more)

### Community 22 - "studio/[workId]/chapters/[chapterId]/actions.ts"
Cohesion: 0.05
Nodes (58): chatAction(), ChatActionInput, getChapterAction(), getGeminiClientOrError(), publishChapterAction(), saveChapterContentAction(), unpublishChapterAction(), AiPanel() (+50 more)

### Community 23 - "devDependencies"
Cohesion: 0.17
Nodes (12): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+4 more)

### Community 24 - "Studio Foundation Plan"
Cohesion: 0.20
Nodes (11): Studio Foundation Plan, Work Creation and Writer Gate Plan, Knowledge Base Tree CRUD Plan, Chapter Business Logic Plan, Knowledge Base Editor UI Plan, Chapter Editor UI Plan, Studio Core Design Decisions, Studio Core Architecture Research (+3 more)

### Community 25 - "app/layout.tsx"
Cohesion: 0.20
Nodes (7): geistMono, geistSans, metadata, Toaster(), nextConfig, next, next-themes

### Community 26 - "Wallet Schema Plan"
Cohesion: 0.22
Nodes (10): Service Setup Plan, Service Setup Result, Wallet Schema Plan, Concurrency Safe Wallet Result, Session Infrastructure Plan, Persistent Sessions Result, OAuth Login Plan, Social Login Result (+2 more)

### Community 27 - "session-refresh.test.ts"
Cohesion: 0.29
Nodes (6): LoginPage(), createClient(), config, proxy(), @supabase/ssr, getClaimsMock

### Community 28 - "Authentication Callback Design"
Cohesion: 0.33
Nodes (10): Authentication Callback Rules, Authentication Callback Data Dictionary, Authentication Callback Input, Callback Exchanged User, Callback Redirect Outcome, Authentication Callback Design, Authentication Callback Rationale, Authentication Callback Overview (+2 more)

### Community 29 - "[workId]/layout.tsx"
Cohesion: 0.20
Nodes (11): WorkLayout(), CreateRootFolderButton(), KbTreeActions(), KbTree(), getAccountSharedNodes(), getWorkKbNodes(), buildTree(), ChapterLeaf (+3 more)

### Community 30 - "work-header-actions.tsx"
Cohesion: 0.23
Nodes (9): FeedCard(), Badge(), badgeVariants, Tooltip(), TooltipContent(), TooltipTrigger(), FeedWork, formatKoreanCount() (+1 more)

### Community 31 - "Graphify Pipeline"
Cohesion: 0.22
Nodes (9): Graphify Pipeline, URL Ingestion and Watch, Graph Exports, Semantic Extraction Contract, Repository Merge Flow, Graphify Automation Hooks, Graph Query Traversal, Media Transcription (+1 more)

### Community 32 - "popover.tsx"
Cohesion: 0.31
Nodes (7): AccountPanel(), Popover(), PopoverContent(), PopoverDescription(), PopoverHeader(), PopoverTitle(), PopoverTrigger()

### Community 33 - "Readable Chapter"
Cohesion: 0.39
Nodes (9): Planned Chapter, Chapter Planning Data Dictionary, Chapter Folder Node, Authored Work, Readable Chapter, Chapter Reading Data Dictionary, Reading Progress, Chapter Report (+1 more)

### Community 34 - "Phase 02 Plan 02: Studio Work Creation & Writer Gate Summary"
Cohesion: 0.13
Nodes (14): Accomplishments, Auto-fixed Issues, Decisions Made, Deferred Items (logged, not fixed — out of scope for this plan), Deviations from Plan, Files Created/Modified, Issues Encountered, Known Stubs (+6 more)

### Community 35 - "AI Gateway Context"
Cohesion: 0.25
Nodes (8): AI Gateway Context, AI Gateway Discussion Log, AI Gateway Human UAT, AI Gateway Research, AI Gateway UI Specification, AI Gateway Validation, AI Gateway Verification, AI Gateway Deferred Items

### Community 36 - "platty-windows-path-fix.cjs"
Cohesion: 0.25
Nodes (6): childProcess, originalJoin, originalSpawn, originalWin32Join, path, { syncBuiltinESMExports }

### Community 37 - "KB UI Design Contract"
Cohesion: 0.33
Nodes (6): Chapter Tree UI Merge, Custom KB Folder Architecture, Cross-Scope Shared Mentions, KB UI Design Contract, KB Phase Validation Strategy, KB Phase Verification

### Community 38 - "Phase 4 Plan 4 Generate Estimate and Wallet Lifecycle Plan"
Cohesion: 0.29
Nodes (7): Phase 4 Plan 1 Gemini Gateway and Cost Model Plan, Phase 4 Plan 1 AI Gateway Foundation Summary, Phase 4 Plan 2 Mention Backend Plan, Phase 4 Plan 2 Mention Search Summary, Phase 4 Plan 3 Prompt Composition Plan, Phase 4 Plan 3 Prompt Composition Summary, Phase 4 Plan 4 Generate Estimate and Wallet Lifecycle Plan

### Community 39 - "Phase 02 Plan 04: Chapter Business Logic (Draft/Publish/Edit/Unpublish/Reorder) Summary"
Cohesion: 0.15
Nodes (12): Accomplishments, Auto-fixed Issues, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness, Performance (+4 more)

### Community 40 - "Phase 02 Plan 05: KB Tree Sidebar + Document Editor + Template Picker Summary"
Cohesion: 0.15
Nodes (12): Accomplishments, Auto-fixed Issues, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness, Performance (+4 more)

### Community 41 - "Work Entity"
Cohesion: 0.33
Nodes (7): Chapter Entity, Reading Progress Entity, Work Entity, Work Bookmark Entity, Work Like Entity, Work Subscription Entity, Work Detail and Engagement Data Dictionary

### Community 42 - "NovelScript v1 Requirements"
Cohesion: 0.40
Nodes (6): Codex TDD Pipeline, Foundation Wallet Context, NovelScript Product Vision, NovelScript v1 Requirements, NovelScript Delivery Roadmap, Project Execution State

### Community 43 - "Phase 02 Plan 01: Studio Core Foundation Summary"
Cohesion: 0.17
Nodes (11): Accomplishments, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness, Performance, Phase 02 Plan 01: Studio Core Foundation Summary (+3 more)

### Community 44 - "Chapter Planning Rules"
Cohesion: 0.47
Nodes (6): Chapter Planning Rules, Chapter Planning Design, Chapter Planning Rationale, Chapter Planning Overview, Chapter Planning Persona, Chapter Planning Use Cases

### Community 45 - "Chapter Reading Rules"
Cohesion: 0.47
Nodes (6): Chapter Reading Rules, Chapter Reading Design, Chapter Reading Rationale, Chapter Reading Overview, Chapter Reader Persona, Chapter Reading Use Cases

### Community 46 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, start, test

### Community 47 - "Phase 02 Plan 03: KB Tree Query + Node CRUD Summary"
Cohesion: 0.17
Nodes (11): Accomplishments, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness, Performance, Phase 02 Plan 03: KB Tree Query + Node CRUD Summary (+3 more)

### Community 48 - "Phase 02 Plan 06: Chapter List, Draft Form & Publish Editor Summary"
Cohesion: 0.17
Nodes (11): Accomplishments, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness, Performance, Phase 02 Plan 06: Chapter List, Draft Form & Publish Editor Summary (+3 more)

### Community 49 - "Epic Catalog"
Cohesion: 0.50
Nodes (5): API Catalog, Epic Catalog, Screen Catalog, Planning Implementation SSOT, SSOT Index

### Community 50 - "New Work Creation Overview"
Cohesion: 0.50
Nodes (5): New Work Creation Design, New Work Creation Rationale, New Work Creation Overview, New Work Creation Personas, Create New Work Use Case

### Community 51 - "Chapter Editing Data Model"
Cohesion: 0.40
Nodes (5): Work Workspace Business Rules, Chapter Editing Data Model, Chapter Entity, Knowledge Base Node Entity, Work Entity

### Community 52 - "Account Profile"
Cohesion: 0.67
Nodes (4): Account Closure Rules, Account Closure Data Dictionary, Account Profile, Account Closure Design

### Community 53 - "database.test.ts"
Cohesion: 0.25
Nodes (3): postgres, migration, sql

### Community 54 - "Next.js Agent Rules"
Cohesion: 0.67
Nodes (3): Next.js Agent Rules, Language and GSD Execution Rules, Next.js Project README

### Community 55 - "Account Overview Data Dictionary"
Cohesion: 1.00
Nodes (3): Account Overview Data Dictionary, Profile Entity, Wallet Entity

### Community 56 - "Knowledge Base Node Entity"
Cohesion: 0.67
Nodes (3): New Work Creation Business Rules, New Work Creation Data Dictionary, Knowledge Base Node Entity

### Community 57 - "Close Account and End Session"
Cohesion: 0.67
Nodes (3): Account Closure, Authenticated Account Holder, Close Account and End Session

### Community 58 - "Identity Completion Data Dictionary"
Cohesion: 0.67
Nodes (3): Identity Completion Data Dictionary, Identity Completion Account Email, Identity Completion Email Submission

### Community 59 - "Chapter Editing Use Cases"
Cohesion: 0.67
Nodes (3): Chapter Editing and Publishing, Chapter Writer Persona, Chapter Editing Use Cases

### Community 60 - "Work Detail and Engagement System Design"
Cohesion: 0.67
Nodes (3): Work Detail and Engagement Business Rules, Work Detail and Engagement System Design, Work Detail and Engagement Overview

### Community 61 - "Profile Entity"
Cohesion: 1.00
Nodes (3): Profile Entity, Writer Upgrade Wallet Entity, Writer Upgrade Data Model

### Community 62 - "Authenticated Reader Starts Writer Onboarding"
Cohesion: 0.67
Nodes (3): Writer Upgrade, Authenticated Reader Persona, Authenticated Reader Starts Writer Onboarding

### Community 92 - "Phase 03 Plan 01: Reader Schema Migration Summary"
Cohesion: 0.17
Nodes (11): Accomplishments, Decisions Made, Deviations from Plan, Files Created/Modified, Issues Encountered, Next Phase Readiness, Performance, Phase 03 Plan 01: Reader Schema Migration Summary (+3 more)

### Community 114 - "Common Pitfalls"
Cohesion: 0.17
Nodes (12): 10. Removing `content` SELECT affects Studio reads, 11. `next` without validation becomes an auth redirect hazard, 1. Two application RPC calls are not atomic, 2. `chapter_id` alone is not a valid author-credit idempotency key, 3. UI masking is not access control, 4. Client-supplied price must never be charged directly, 5. Unique constraints do not replace transaction design, 6. Locking reader then author can deadlock (+4 more)

### Community 115 - "Phase 6: Paid Chapter Unlock - Research"
Cohesion: 0.18
Nodes (10): `chapter_unlocks`, Decisions resolved by this research, Executive Summary, External primary sources (verified 2026-09-08), Phase 6: Paid Chapter Unlock - Research, Planning Recommendations, Recommended Data Model, Recommended Project Structure (+2 more)

### Community 116 - "1. 개요.md"
Cohesion: 0.20
Nodes (9): 1. 서비스 개요 (Product Overview), 2. 서비스 비전 (Product Vision), 3. 배경 및 문제 정의 (Problem Statement), 4.1. 듀얼 인프라 및 과금 체계 (BYOK + 정액 토큰제), 4.2. 3단계 프리셋 및 컨텍스트 주입 에디터 (Web IDE), 4.3. 지표 기반의 자정 작용 및 큐레이션, 4.4. 경량 모델 기반 자동 필터링 (사전 방역), 4. 해결 방안 및 핵심 가치 (Solution & Core Value) (+1 more)

### Community 117 - "Phase 2 — UI Design Contract"
Cohesion: 0.22
Nodes (8): Checker Sign-Off, Color, Copywriting Contract, Design System, Phase 2 — UI Design Contract, Registry Safety, Spacing Scale, Typography

### Community 118 - "Phase 6: Paid Chapter Unlock - Discussion Log"
Cohesion: 0.22
Nodes (8): Addendum (2026-09-08, same-day follow-up), Claude's Discretion, Deferred Ideas, Phase 6: Paid Chapter Unlock - Discussion Log, 소장 vs 대여(영구성), 언락 트리거 & 흐름, 작가 정산 원장 기록, 잔액 부족 처리

### Community 119 - "Codex TDD 파이프라인"
Cohesion: 0.25
Nodes (7): 1단계 — 계획 (Codex / GSD), 2단계 — 실행 위임 (Codex CLI), 3단계 — 검수 및 로드맵 동기화 (Codex), 4단계 — Phase 완료 시 전체 기능검사, Codex TDD 파이프라인, 문제 해결, 사전 조건

### Community 120 - "Phase 2: Studio Core (Writer Loop, No AI) - Discussion Log"
Cohesion: 0.25
Nodes (7): Claude's Discretion, Deferred Ideas, KB 문서 구조, Phase 2: Studio Core (Writer Loop, No AI) - Discussion Log, 스튜디오 네비게이션 (파일트리), 작품(Work) 구조, 회차 에디터 & 발행

### Community 121 - "Phase 2 — Validation Strategy"
Cohesion: 0.25
Nodes (7): Manual-Only Verifications, Per-Task Verification Map, Phase 2 — Validation Strategy, Sampling Rate, Test Infrastructure, Validation Sign-Off, Wave 0 Requirements

### Community 122 - "Phase 5: Real Payment Integration - Discussion Log"
Cohesion: 0.25
Nodes (7): Claude's Discretion, Deferred Ideas, Phase 5: Real Payment Integration - Discussion Log, 결제 실패·취소·미확정 처리, 논의 영역 선택, 충전 진입 및 결제중 UX, 토큰 충전 상품 구성

### Community 123 - "Focused Re-research: Unresolved 3 Questions"
Cohesion: 0.25
Nodes (8): A. Column privilege 회수 + 조건부 read RPC, B. `chapter_bodies` 분리 + RLS, C. View 계열 대안, Decision aid — 사용자 선택 지점, Focused Re-research: Unresolved 3 Questions, Question 1 — Studio 초안 읽기를 A/B/C에서 어떻게 처리하는가, Question 2 — 범위·정합성·성능·유지보수 비교, Question 3 — D-12 로그인 후 복귀의 정확한 영향 범위

### Community 124 - "5-3 에셋 스토어 UI,UX 설계 및 정책.md"
Cohesion: 0.29
Nodes (6): 1. 스토어프론트 (마켓 메인 화면), 2. 에셋 상세 페이지 (구매 전환 UX), 3. 모듈식 결제 및 원클릭 임포트 (Modular Import), 4. 커스텀 프레임워크 등록 정책, 5. 출처 강제 명시 시스템 (Mandatory Attribution), 6. 판매자(Publisher) 대시보드

### Community 125 - "Phase 1: Foundation & Wallet Infrastructure - Discussion Log"
Cohesion: 0.29
Nodes (6): Claude's Discretion, Deferred Ideas, Phase 1: Foundation & Wallet Infrastructure - Discussion Log, 계정/세션 UX (Account / Session UX), 소셜 로그인 범위 (Social Login Scope), 작가 전환(업그레이드) 플로우 (Writer Upgrade Flow)

### Community 126 - "2. 핵심 기능 요구사항.md"
Cohesion: 0.33
Nodes (5): 2.1. 마크다운(MD) 기반 지식 베이스 (Knowledge Base), 2.2. 다중 멘션(@) 기반 다이내믹 컨텍스트 주입 (Dynamic Context Injection), 2.3. 실시간 비용/토큰 모니터링 데시보드, 2.4. 비동기 자동 필터링 및 퀄리티 컨트롤 (Async Quality Control), 2.5. 듀얼 과금 및 BYOK 연동 모듈

### Community 127 - "2. 웹 에디터 (Web IDE) - 3단 분할 캔버스"
Cohesion: 0.33
Nodes (5): 1. 작가 대시보드 (Studio Home), 2. 웹 에디터 (Web IDE) - 3단 분할 캔버스, A. 좌측 패널: 지식 베이스 & 파일 탐색기, B. 중앙 패널: 메인 집필 캔버스, C. 우측 패널: AI 코워커 & 프롬프트 컨트롤러

### Community 128 - "Atomic Unlock RPC"
Cohesion: 0.33
Nodes (6): Atomic Unlock RPC, Ledger reference design, Result contract, Security shape, Transaction algorithm, Why one new RPC is required

### Community 129 - "Validation Architecture"
Cohesion: 0.33
Nodes (6): Component/state tests, Content-leak regression tests (필수), D-12 auth return-path tests (필수), Database integration tests (필수), Suggested commands, Validation Architecture

### Community 130 - "3. 비즈니스 모델 및 사용자 정책.md"
Cohesion: 0.40
Nodes (4): 3.1. 로벅스(Robux)형 단일 가상 경제 생태계 (Single Token Economy), 3.2. 메타데이터 보호 및 크리에이터 에셋 스토어 (Opt-in), 3.3. 랭킹 및 큐레이션 알고리즘, 3.4. 저작권 방어 및 어뷰징 제재 정책 (3-Strike Out)

### Community 131 - "4. 시스템 아키텍처 및 기술 스택.md"
Cohesion: 0.40
Nodes (4): 4.1. 프론트엔드 및 상태 관리 (Frontend & State Management), 4.2. 백엔드 및 데이터베이스 (Backend & BaaS), 4.3. AI 파이프라인 및 코어 알고리즘 (AI Pipeline & Algorithms), 4.4. 보안 및 데이터 무결성 (Security & Data Resilience)

### Community 132 - "5-1.독자 공간 UI,UX 설계 및 운영 시스템.md"
Cohesion: 0.40
Nodes (4): 1. 플랫폼 메인 홈 (Discovery), 2. 작품 상세 페이지 (Novel Detail), 3. 웹소설 뷰어 (Viewer), 4. 서버 측 AI 사전 검수 및 운영 시스템

### Community 133 - "Q: c:\Users\MSI\NovelScript\.planning\phases\06-paid-chapter-unlock\06-CONTEXT.md 해당 문서를 기준으로 필요한 자료를 리서치해줘. 리서치한 결과는 문서로 남겨줘"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: c:\Users\MSI\NovelScript\.planning\phases\06-paid-chapter-unlock\06-CONTEXT.md 해당 문서를 기준으로 필요한 자료를 리서치해줘. 리서치한 결과는 문서로 남겨줘, Source Nodes

### Community 134 - "Q: 06-CONTEXT.md의 Unresolved 섹션 3개 질문과 D-12 영향만 좁혀서 06-RESEARCH.md 재조사"
Cohesion: 0.40
Nodes (4): Answer, Outcome, Q: 06-CONTEXT.md의 Unresolved 섹션 3개 질문과 D-12 영향만 좁혀서 06-RESEARCH.md 재조사, Source Nodes

### Community 135 - "Client and UX Architecture"
Cohesion: 0.40
Nodes (5): Balance synchronization, Client and UX Architecture, CTA rules, Insufficient balance and top-up resume, Shared unlock coordinator

### Community 136 - "Current Codebase Findings"
Cohesion: 0.50
Nodes (4): Blocking security gap: paid prose is currently API-readable, Current Codebase Findings, Phase 5 integration mismatch, Reusable foundations

### Community 137 - "Constraints and Requirements"
Cohesion: 0.50
Nodes (4): Constraints and Requirements, Dependency gate, Literal phase requirement, Locked decisions from `06-CONTEXT.md`

### Community 140 - "Paid Content Access Boundary"
Cohesion: 0.67
Nodes (3): Common behavior contract (A/B choice pending), Paid Content Access Boundary, Query performance

## Knowledge Gaps
- **538 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `VALID_BASES`, `PRESET_LEVEL_META` (+533 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 606 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **49 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `lucide-react` connect `command.tsx` to `popover.tsx`, `kb-node-dialogs.tsx`, `viewer-shell.tsx`, `chapter-list.tsx`, `works/[workId]/page.tsx`, `package.json`, `cn`, `AiPanel.tsx`, `studio/[workId]/chapters/[chapterId]/actions.ts`, `app/layout.tsx`, `[workId]/layout.tsx`, `work-header-actions.tsx`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `vitest` connect `createTestUser` to `works/[workId]/page.tsx`, `createClient`, `package.json`, `kb/actions.ts`, `database.test.ts`, `studio/[workId]/chapters/[chapterId]/actions.ts`, `session-refresh.test.ts`, `[workId]/layout.tsx`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **What connects `geistSans`, `geistMono`, `metadata` to the rest of the system?**
  _538 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createTestUser` be split into smaller, more focused modules?**
  _Cohesion score 0.09467918622848201 - nodes in this community are weakly interconnected._
- **Should `viewer-shell.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11396011396011396 - nodes in this community are weakly interconnected._
- **Should `works/[workId]/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06721311475409836 - nodes in this community are weakly interconnected._
# Phase 14: MCP 쓰기 도구 + 스튜디오 리뷰 큐 - Context

**Gathered:** 2026-11-04
**Status:** Discuss 완료 (사용자 결정 8건 반영), UI-SPEC·목업·plan 전

<domain>
## Phase Boundary

연결된 MCP 클라이언트(Claude 커스텀 커넥터)가 **'제안된 초안'과 '설정집 변경안'만** 저장할 수 있고, 작가가 스튜디오 리뷰 큐에서 **출처(어느 클라이언트에서, 언제)와 함께** 검토해 수락 또는 거절한다. 기존 본문·설정집 원문은 AI 호출만으로는 어떤 경우에도 바뀌지 않는다.

요구사항: MCP-05, MCP-06, MCP-07.

범위 밖: 읽기 도구 변경(Phase 13 완료), 세계수 데이터(Phase 18), 작가 선택형 '자동 수락'(Phase 12 deferred, 이번에도 제외), 도구 호출 로그·횟수 표시, 새 초안 회차 생성(ROADMAP 성공 기준 1이 금지).

</domain>

<decisions>
## Implementation Decisions

### 사용자 확정 (2026-11-04 discuss)
- **D-P14-01 (초안 수락 = 문단 단위 부분 반영):** 회차 제안 초안을 수락할 때 원본과 초안의 차이를 **문단 단위 변경 덩어리 목록**으로 보여주고, 작가가 **덩어리별로 수락/거절**한다. **수락한 덩어리만** 본문에 반영한다. 전체 교체·이어붙이기는 기본 동작이 아니다(모든 덩어리 수락으로 표현된다).
- **D-P14-02 (설정집 수정안도 같은 방식):** 기존 문서 수정안은 원문과 나란히 비교하고 같은 덩어리 선택 UI로 수락한다. 잠긴 노드(`is_locked`, 0002 `locked_node_immutable`)와 삭제된 노드는 수정안 대상이 될 수 없다.
- **D-P14-03 (신규 생성안 위치):** 신규 설정집 생성안은 AI가 **카테고리**를 지정하고, 수락할 때 **저장 폴더는 작가가 확인**한다. 폴더는 서버가 사용자·작품·범위·카테고리·삭제 상태로 재검증하며 다른 폴더에 조용히 저장하지 않는다(Phase 15의 폴더 검증 방침과 같은 결). 계정 공유(`account_template`) 범위에 대한 신규 생성안 허용 여부는 plan에서 정한다(기본: 작품 범위만).
- **D-P14-04 (원본이 바뀐 경우):** 제안 시점에 기준 본문(또는 문서)의 **해시를 저장**한다. 수락 시 현재 내용과 다르면 "원본이 바뀌었어요" 경고와 함께 **현재 내용 기준으로 diff를 다시 계산**해 보여준다. 덩어리가 현재 내용에 맞지 않으면 그 덩어리는 적용 불가로 표시한다. 조용히 덮어쓰지 않는다.
- **D-P14-05 (되돌리기·수명):** 수락할 때 **직전 본문(설정집은 직전 내용) 스냅샷을 보관**하고 되돌리기를 1회 제공한다. **대기 제안은 30일 후 만료**되며 작가당 대기 건수 상한(예: 50, 구체 값은 plan)을 둔다.
- **D-P14-06 (도구 표면):** 쓰기 도구는 **2개**: `save_draft`(회차 ID + 초안 전문)와 `propose_kb_document`(신규|수정 구분). **회차당 대기 초안은 1개** — 같은 회차에 새 초안을 저장하면 이전 대기 초안은 `superseded`로 대체되어 쌓이지 않는다. 본문을 직접 바꾸는 도구와 새 회차를 만드는 도구는 만들지 않는다.
- **D-P14-07 (정지 계정):** 정지(제재) 계정은 **쓰기 도구가 거부**된다(D-21 이행). `propose_draft` scope가 grant에 없어도 거부한다. 읽기는 기존대로 허용.
- **D-P14-08 (리뷰 큐 위치):** **작품별 리뷰 큐** + **스튜디오 홈(작품 목록)에 대기 건수 배지**. 회차·설정 문서 화면에도 해당 항목에 "대기 제안 n건" 표시. 각 제안 카드는 클라이언트명·출처 호스트·도착 시각·대상(회차/문서)·상태를 보여준다(`mcp_connections`의 클라이언트명·출처를 제안 행에 스냅샷으로 남겨 연결 해제 뒤에도 출처가 보인다).

### 수동 인수 묶음 (사용자 확정)
- **D-P14-09:** 12-06 Task 2의 남은 #7(동의 화면 상태 변형)·#8(375px·접근성)·#9(1시간 후 refresh)는 **Phase 14의 실제 Claude 인수 때 한 번에 묶어** 진행한다. 일회용 DB·터널·Claude 연결을 한 번만 세팅하고, 리뷰 큐의 375px·키보드 점검도 같이 한다. 판정은 사람이 남긴다.

### 선행 경계 (Phase 12·13 CONTEXT에서 이어짐 — 우회 금지)
- **D-17 (Phase 13 경계):** OAuth bearer는 모든 public 테이블에서 기본 차단이고 작품·회차·설정집·작품별 AI 지시 4개 테이블만 본인 행 SELECT가 열려 있다. 쓰기 도구는 이를 풀지 않는다. 새 제안 테이블(`mcp_drafts`, `mcp_kb_proposals` 등)에 한해 bearer에게 **INSERT 한정**(라이브 grant + `propose_draft` scope + 소유권 검증)을 여는 방식 또는 전용 RPC 중 하나를 plan에서 택한다. **수락·거절·되돌리기는 작가의 일반 세션(`client_id is null`)에서만** 가능하고 bearer는 제안 행을 읽거나 수정·삭제하지 못한다. 기존 `mcp_reject_oauth_caller` 가드가 주입된 SECURITY DEFINER RPC 23개를 bearer가 호출 못 한다는 사실을 깨지 않는다.
- **confused deputy 금지:** 쓰기 도구도 user-scoped bearer 클라이언트(`createMcpDbClient`)만 쓴다. `createAdminClient`·service role 참조는 `no-admin-client` 테스트가 계속 막는다. **수락 경로(스튜디오 Server Action)는 작가 세션으로 실행**하고, 본문 반영은 기존 소유권 술어를 통한다.
- **LLM 입력은 비신뢰:** `work_id`·`chapter_id`·`node_id`는 매 호출 서버에서 소유권을 재검증한다. 초안/제안 전용 설계는 이 검증의 대체재가 아니라 짝이다. 주입된 도구 결과로 유도된 교차 사용자 쓰기 테스트를 포함한다.
- **D-08 (Phase 12):** 본문 직접 수정 도구는 만들지 않는다. 쓰기 성격 annotation은 `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint`(회차당 대기 1개 대체 규칙에 따라 plan에서 판단), `openWorldHint: false`. MCP-09 정적 계약 테스트(도구 목록·strict schema·`userId`/`ownerId` 인자 거부)를 쓰기 도구까지 확장한다.
- **scope 검사:** `withMcpReadTool`은 `read` scope만 본다. 쓰기용 래퍼가 `propose_draft` scope를 검사해야 한다(grant scope는 AuthInfo에 이미 실려 있다).

### Claude's Discretion (plan 단계에서 정함)
- 제안 테이블 스키마(상태: pending/accepted/rejected/superseded/expired, 기준 해시, 출처 스냅샷, 스냅샷 보관 컬럼), 마이그레이션 구조. **마이그레이션 번호는 0041부터**(0040은 공유 DB 따라잡기의 `soft_delete_kb_node` 복구용으로 비워 둠; 병합 직전 재확인).
- 문단 단위 diff 알고리즘과 덩어리 적용 방식, 에디터(본문 저장 형식) 반영 경로. 현재 AI 패널의 `[DRAFT]` 수락 흐름과 맞출지 별도로 둘지.
- 초안·문서 전문 최대 길이, 도구 응답 구조, 만료를 어떻게 집행할지(조회 시 필터 vs 정리 작업).
- 되돌리기 가능 기간(수락 후 얼마나 보관할지)과 되돌리기 뒤 상태.
- 리뷰 큐의 상세 레이아웃·빈 상태·오류 상태(UI-SPEC에서 정함). 회차/문서 화면 표시 위치.
- 계정 공유 폴더에 대한 신규 생성안 허용 여부(기본: 작품 범위만).

</decisions>

<canonical_refs>
## Canonical References

### 요구사항·로드맵
- `.planning/ROADMAP.md` — Phase 14 항목(Goal, Success Criteria 1~4, Notes: 데이터 접근 레이어 강제·비신뢰 입력·교차 사용자 쓰기 테스트), Phase 13 Notes(confused deputy)
- `.planning/REQUIREMENTS.md` — MCP-05, MCP-06, MCP-07, Out of Scope(본문 직접 수정 도구 금지)
- `.planning/STATE.md` — Blockers/Concerns(공유 DB 0022~0039 미적용·백업 없음, confused deputy 제약)

### 선행 Phase
- `.planning/phases/12-mcp-oauth/12-CONTEXT.md` — D-06(scope read·propose_draft), D-08, D-09~D-10(live grant·fail closed), D-17, D-21
- `.planning/phases/12-mcp-oauth/12-06-SUMMARY.md` — 일회용 DB 절차, Task 2 #7·#8·#9 대기
- `.planning/phases/13-mcp-read-context/13-CONTEXT.md` — D-17 정정 승인, 설계 원칙, 읽기 도구 7개
- `.planning/phases/13-mcp-read-context/13-RESEARCH.md`, `13-VALIDATION.md` — 교차 사용자 테스트 패턴, 일회용 DB 규약, Claude 인수 관찰(도구 annotation, 기본 권한 "승인 필요")

### 현재 코드
- `lib/mcp/auth.ts`(`MCP_GRANT_SCOPES`, `readMcpAuthExtra`), `lib/mcp/tool-runtime.ts`(`withMcpReadTool` — read scope만 검사), `lib/mcp/db-client.ts`, `lib/mcp/owned-work.ts`, `lib/mcp/tools/*.ts`, `app/mcp/route.ts`
- `supabase/migrations/0037_mcp_oauth_grants.sql`, `0038_oauth_sensitive_rls.sql`, `0039_mcp_read_boundary.sql`
- `chapters`(`content text`, `is_published` 등, 0002), `kb_nodes`(`is_locked`, `content`, `locked_node_immutable` 트리거)
- `lib/ai/prompt.ts`의 `[REPLY]/[DRAFT]/[DOCUMENT]` 응답 프로토콜, 스튜디오 `app/studio/[workId]/chapters/[chapterId]/ai-panel/`(앱 내부 초안 수락 흐름 참고)
- `app/studio/settings/mcp-connections`(연결 관리, 출처 표시 패턴), `app/studio/[workId]/layout.tsx`(사이드바·트리)

### 규칙
- `CLAUDE.md`, `AGENTS.md` — Next.js 16.3.2 변경 사항은 `node_modules/next/dist/docs/` 확인 후 코드 작성
- UI phase 완료 조건: UI-SPEC.md + design 스킬 목업(Artifact)까지 제공

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/mcp/tool-runtime.ts`: 읽기 래퍼를 본뜬 쓰기 래퍼(scope `propose_draft` 검사, 정지 계정 거부)를 추가하는 자리.
- `lib/mcp/owned-work.ts`·`lib/mcp/tools/kb.ts`: 작품·문서 소유권 재검증 패턴. 쓰기 도구도 같은 술어를 쓴다.
- `app/studio/settings/mcp-connections`: 클라이언트명·출처 표시 UI 재사용 후보.

### Established Patterns
- 소유권은 공유 술어 함수 + RLS 이중 방어. 해제·교차 사용자는 `*.database.test.ts`로 일회용 DB에서만 증명.
- 도구 입력 스키마는 strict, 모든 필드에 한국어 `.describe` (Phase 13 인수에서 Claude가 설명 없는 옵션을 임의로 켠 전례).

### Integration Points
- `app/mcp/route.ts`에 쓰기 도구 2개를 같은 `createMcpHandler`로 등록(총 도구 9개).
- 스튜디오: 작품 리뷰 큐 라우트, 스튜디오 홈 배지, 회차·문서 화면의 대기 제안 표시.
- 마이그레이션: 0041~. 일회용 DB(`anzafn…`)에서만 적용·검증하고 공유 DB는 건드리지 않는다.

</code_context>

<specifics>
## Specific Ideas

- 사용자 의도: 대화로 쓴 결과가 "초안 제안"으로 도착하고, 작가가 **필요한 부분만 골라** 반영한다. 통째 수락/거절이 아니라 문단 단위 선택이 핵심 경험이다.
- 설정집 수정안도 같은 선택 경험으로 통일해 학습 비용을 줄인다.
- 12-06 잔여 수동 인수를 이 phase의 Claude 인수와 묶어 세팅 비용을 한 번만 낸다.

</specifics>

<deferred>
## Deferred Ideas

- 작가 선택형 '자동 수락' — 이번에도 제외(프롬프트 인젝션 방어 원칙과 충돌)
- 도구 호출 로그·횟수 표시, 연결 목록의 승인 scope 표시
- 새 회차를 초안으로 생성하는 도구 — ROADMAP 성공 기준 1이 금지
- 회차당 여러 대기 초안의 비교 보기 — 이번엔 회차당 1개 대체 방식
- 세계수(Phase 18) 데이터 쓰기 제안

</deferred>

---

*Phase: 14-MCP 쓰기 도구 + 스튜디오 리뷰 큐*
*Context gathered: 2026-11-04*

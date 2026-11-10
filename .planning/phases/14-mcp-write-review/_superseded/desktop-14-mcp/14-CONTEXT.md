# Phase 14: MCP 쓰기 도구 + 스튜디오 리뷰 큐 - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

연결된 외부 AI(Claude 커스텀 커넥터)가 되돌릴 수 있는 것은 **'제안된 초안'과 '설정집 변경안'뿐**이다. 작가는 스튜디오에서 출처(어느 클라이언트에서, 언제)와 함께 이를 검토해 수락하거나 거절한다. 기존 회차 본문은 어떤 경로로도 조용히 바뀌지 않는다.

요구사항: MCP-05, MCP-06, MCP-07.

범위 밖: 읽기 도구(Phase 13 완료), 세계수 데이터(Phase 18), 도구 호출 로그·횟수 표시, 회차 본문을 직접 수정하는 도구(영구 제외).

</domain>

<decisions>
## Implementation Decisions

### 초안 수락 방식 (MCP-05, MCP-07)
- **D-P14-01:** 초안 수락은 **작가 에디터로 불러오는 동작**이다. 서버는 `chapters.content`를 쓰지 않는다. 실제 본문 저장은 작가의 기존 에디터 저장 동작이다. 이 구조 때문에 "조용한 덮어쓰기"가 데이터 레이어에서 불가능하다.
- **D-P14-02:** 한 회차에 pending 초안을 **여러 개** 둘 수 있고, 각각 독립적으로 검토한다. 새 초안이 이전 초안을 대체하지 않는다.
- **D-P14-03:** 초안은 **에디터로 가져오는 시점에 accepted**로 전이한다. 에디터 저장 여부는 서버가 추적하지 않는다. 저장 없이 나가도 작가가 이력에서 다시 가져올 수 있어야 한다.
- **D-P14-04:** 초안 본문의 형식(평문/마크다운)과 길이 상한은 **리서치에서 결정**한다. `chapters.content` 현재 형식과 에디터를 조사한 뒤 정한다. 서버는 어떤 경우에도 입력을 정규화·검증한다(스크립트·HTML 주입 방지).
- **D-P14-05:** 새 초안 **회차를 만드는 도구는 두지 않는다.** 초안은 이미 있는 회차에만 붙는다. 본문 직접 수정 도구도 만들지 않는다.

### 설정집 수정안 (MCP-06)
- **D-P14-06:** 외부 AI는 설정집 문서의 **신규 생성안** 또는 **기존 문서 수정안**을 제안할 수 있다. 둘 다 pending 객체만 만든다. 실제 `kb_nodes`는 작가가 수락할 때만 바뀐다.
- **D-P14-07:** 수정안 수락은 **변경 덩어리(hunk) 단위 부분 수락**이다. 작가가 "필요한 부분만" 골라 적용한다. 원문과 수정안을 나란히 보여준다. (사용자 발언: "필요한 부분만 수정하게 바꾸고 싶다")
- **D-P14-08:** 제안 이후 작가가 원문을 고쳐 제안 시점의 원문과 달라진 경우, **최신 원문 기준으로 diff를 다시 계산해** 보여준다. 수락은 그 재계산된 diff 위에서 이뤄진다. 제안에는 base 버전을 기록해 둔다.
- **D-P14-09:** 잠긴 템플릿 문서(`is_locked`)는 수정안 대상이 될 수 없다. 신규 생성안의 폴더·카테고리 지정은 서버가 소유권·범위·삭제 상태로 재검증한다(Phase 15의 폴더 검증 방식을 재사용하는 방향, 세부는 plan).

### 리뷰 큐 위치·진입 (MCP-07, UI)
- **D-P14-10:** 목록은 **한 목록 + 종류 필터**(전체 / 초안 / 설정집)다. 모든 행에 출처(클라이언트명, 도착 시각)를 같은 형식으로 표시한다.
- **D-P14-11:** 진입점은 **A + B·C 바로가기** 조합이다. A: 스튜디오 헤더의 "AI 검토 대기" 배지 → 전체 인박스(모든 작품). B: 회차 트리 항목과 에디터 안내줄 → 그 회차의 초안만. C: 설정집 트리 항목 → 그 문서의 수정안만. 목업: https://claude.ai/artifact/6ZfYXsAj56PsenE4EGWLQD (사본은 UI-SPEC 단계에서 `.planning/phases/14-mcp/mockups/`에 둔다).
- **D-P14-12:** 이 UI 결정은 목업으로 확인했지만 세부 화면(모바일 탭 3개 셸에서의 배치 포함)은 `/gsd:ui-phase 14`에서 UI-SPEC으로 확정한다.

### 쌓임 제한·수명·계정 상태
- **D-P14-13:** **작품당 pending 상한**을 둔다. 상한 초과 시 도구는 "검토 대기가 가득 찼다"는 오류를 돌려주고 새 제안을 받지 않는다. 숫자는 plan에서 정한다.
- **D-P14-14:** 수락·거절한 항목과 방치된 pending은 **전부 영구 보관**한다(자동 만료·삭제 없음). 출처와 함께 이력으로 남는다. (공개 출시 규모에서 용량 문제가 생기면 그때 재결정)
- **D-P14-15:** **정지된 계정은 MCP 쓰기 도구와 수락·거절 모두 차단**한다. 이미 쌓인 항목은 읽기로 볼 수 있다. 탈퇴 계정은 Phase 12 정책대로 전면 차단이다(D-21 이월 완료).

### 구조 원칙 (ROADMAP Notes에서 유지)
- **D-P14-16:** `save_draft` / `propose_kb_document` 둘 다 pending 상태 객체(`mcp_drafts` / `mcp_kb_proposals`)만 만든다. "외부 AI가 제안하고 작가가 결정한다"를 UI 카피가 아니라 **데이터 접근 레이어에서** 강제한다.
- **D-P14-17:** LLM이 넘긴 `work_id`/`chapter_id`/`node_id`는 읽기 도구 결과를 거쳐 온 **비신뢰 입력**이다. 매 호출 서버에서 소유권을 재검증한다. 주입된 도구 결과로 유도된 교차 사용자 쓰기 테스트(실DB, 일회용 DB에서만)를 포함한다.
- **D-P14-18:** 쓰기 도구에는 `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint`와 `openWorldHint: false` annotation을 붙인다(MCP-09 형식 유지). 도구는 user-scoped 클라이언트를 쓰고 `createAdminClient`를 쓰지 않는다.

### Claude's Discretion
- 초안 본문 형식·길이 상한(D-P14-04), pending 상한 숫자, hunk 분할 알고리즘과 diff 라이브러리, 테이블 컬럼·인덱스 설계, 도구 이름과 zod 스키마.
- 같은 요청이 반복될 때의 멱등성 처리(중복 제안 방지) 방식.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 요구사항·로드맵
- `.planning/ROADMAP.md` — Phase 14 항목(Goal, Success Criteria 1~4, Notes)
- `.planning/REQUIREMENTS.md` — MCP-05, MCP-06, MCP-07, "Out of Scope"의 본문 직접 수정 도구 항목
- `.planning/STATE.md` — 하드 경계, confused deputy 제약, 공유 DB는 Phase 14 동안 일회용 DB 사용

### 선행 Phase
- `.planning/phases/13-mcp-read-context/13-CONTEXT.md` — 도구 규약(user-scoped 클라이언트, 비신뢰 ID, annotation, 교차 사용자 테스트)
- `.planning/phases/12-mcp-oauth/12-CONTEXT.md` — D-09~D-21(grant 조회, fail closed, 정지 계정 처리 이월)
- `.planning/phases/12-mcp-oauth/12-UI-SPEC.md` — 기존 스튜디오 MCP UI 규약

### 코드
- `app/mcp/route.ts`, `lib/mcp/tool-runtime.ts`, `lib/mcp/owned-work.ts`, `lib/mcp/auth.ts`, `lib/mcp/tools/kb.ts` — 도구 등록·소유권·인증 패턴
- `lib/auth/write-access.ts` — 정지 계정 쓰기 차단(`checkWriteAccess`)
- `lib/kb/setting-document.ts`, `lib/kb/actions.ts` — 설정집 문서 쓰기·소유권 술어
- `lib/ai/document-contract.ts`, `lib/ai/document-plan.ts` — Phase 15의 폴더·템플릿 재검증 방식
- `app/studio/[workId]/layout.tsx`, `components/studio/workspace/*` — 작품 화면 셸(트리·무대·AI 패널, 모바일 탭 3개)
- `supabase/migrations/0037_mcp_oauth_grants.sql`, `0038_oauth_sensitive_rls.sql`, `0039_mcp_read_boundary.sql` — OAuth 토큰 RLS 경계(새 테이블도 같은 경계를 따라야 한다)

### 목업
- https://claude.ai/artifact/DjzP2LS1hUYEdGkNv7eVJ2 — 리뷰 큐 위치안 A/B/C 비교
- https://claude.ai/artifact/6ZfYXsAj56PsenE4EGWLQD — 실제 스튜디오 셸 안 진입점 전체 장면

### 규칙
- `CLAUDE.md`, `AGENTS.md` — Next.js 16.3.2 변경 사항은 `node_modules/next/dist/docs/` 확인 후 코드 작성

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/mcp/tool-runtime.ts`의 `withMcpReadTool`·`McpToolError`: 쓰기 도구 래퍼를 같은 형식으로 확장한다.
- `lib/mcp/owned-work.ts`의 `requireOwnedWork`: 모든 쓰기 도구의 첫 소유권 검증.
- `lib/auth/write-access.ts`의 `checkWriteAccess`: 정지·탈퇴 판정 재사용.
- `chapters.content`는 단일 `text` 컬럼, `chapters_owner_all` RLS: 서버가 이 컬럼을 쓰지 않으므로 이 phase는 `chapters` 스키마를 건드리지 않는다.

### Established Patterns
- 소유권은 공유 술어 함수 + RLS 이중 방어. 새 테이블 `mcp_drafts` / `mcp_kb_proposals`도 0038의 `client_id is null` RESTRICTIVE RLS 경계와 `mcp_reject_oauth_caller` 가드를 따라야 한다(OAuth 토큰이 REST로 직접 읽거나 쓰지 못하게).
- 실DB 교차 사용자 테스트는 `*.database.test.ts` 패턴, 일회용 DB에서만 실행.

### Integration Points
- `app/mcp/route.ts`에 `save_draft`, `propose_kb_document`를 등록한다.
- 작품 화면 레이아웃(헤더 배지, 회차·설정집 트리 배지, 에디터 안내줄)에 개수 조회를 더한다.
- 마이그레이션 최신 번호는 `0050_feed_public_read_cost.sql`이다(0040 다음 번호가 0050으로 건너뛰어 있음, 2026-11-09 디스크 확인). 이 phase의 새 마이그레이션은 **0051 이상**으로 잡고, 일회용 DB에서만 검증한다. plan 착수 시 `ls supabase/migrations`로 번호를 다시 확인한다.
- **plan 검증 항목:** `checkWriteAccess`는 supabase 클라이언트를 받는다. OAuth bearer 클라이언트로 호출할 때 0038/0039의 RESTRICTIVE RLS·`mcp_reject_oauth_caller` 가드가 그 조회(profiles 등)를 막지 않는지 실DB 테스트로 확인한다. 막히면 정지 판정용 읽기 경로를 따로 설계한다(D-P14-15의 전제).

</code_context>

<specifics>
## Specific Ideas

- 사용자 의도: 수락은 "통째로 받는다"가 아니라 **필요한 부분만 고른다**. 설정집 수정안의 부분 수락이 핵심이다.
- 초안은 에디터에서 작가가 손보고 직접 저장하는 흐름이라, 서버가 본문을 쓰는 일이 없다는 점이 안전 설계의 중심이다.

</specifics>

<deferred>
## Deferred Ideas

- 보관 기간·자동 정리 정책: 영구 보관으로 시작했고, 규모가 커지면 재결정한다.
- 도구 호출 로그·호출 횟수 표시(Phase 12 deferred 이월)
- 세계수(Phase 18) 데이터를 제안 대상에 포함

### Reviewed Todos (not folded)
- `2026-09-17-phase-07-deferred-browser-checks.md` (Phase 7 미확인 브라우저 검수) — 매칭 점수 0.2, 키워드만 겹침. 이 phase 범위와 무관.

</deferred>

---

*Phase: 14-MCP 쓰기 도구 + 스튜디오 리뷰 큐*
*Context gathered: 2026-11-09*

# Phase 12: MCP OAuth 기반 · 연결/해제 - Context

**Gathered:** 2026-10-23
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 Claude(커스텀 커넥터)에서 NovelScript를 연결해 **자기 계정 데이터에만** 접근하도록 OAuth로 승인하고, NovelScript에서 연결 목록·마지막 사용 시각을 보고 해제하면 **해제 이전에 발급된 토큰의 호출이 즉시 차단**된다. 요구사항: MCP-01, MCP-08.

이 phase 범위: authorization server 확정(스파이크), 동의 화면, grant 기록, 매 호출 grant 검증, 연결 관리 UI, 검증용 최소 읽기 도구 1개.
범위 밖: 작품·회차·설정집 읽기 도구와 집필 컨텍스트 번들(Phase 13), 쓰기 제안·리뷰 큐(Phase 14), ChatGPT 대응(best-effort 문서화만).

</domain>

<decisions>
## Implementation Decisions

### 스파이크 (첫 작업, 도구 작업과 섞지 않음)
- **D-01:** 스파이크는 **일회용 Supabase + 공개 터널(또는 Vercel 프리뷰)** 에서 수행한다. 공유 Supabase 프로젝트에는 마이그레이션·설정 변경을 적용하지 않는다.
- **D-02:** 합격선은 **실제 Claude 커스텀 커넥터로 discovery → 등록 → 동의 → 토큰 교환 → 인증된 호출 1회, 그리고 토큰 폐기 후 같은 토큰 호출이 실패하는 것까지** 확인하는 것이다.
- **D-03:** 후보는 Supabase Auth OAuth 2.1 Server(기본)와 WorkOS AuthKit. 스파이크가 요건(매 호출 grant 조회 가능, Claude 등록 방식 호환)을 못 채우면 **멈추고 사용자와 재논의**한다. WorkOS 자동 전환·직접 AS 구현은 하지 않는다.

### 동의 화면 · 권한
- **D-04:** 동의 화면은 **NovelScript 앱 내 `/oauth/consent`** 로 두고 Supabase OAuth 서버의 authorization path로 지정한다. 한국어 문구·기존 로그인 세션을 쓴다. (UI hint: yes → UI 목업 필요)
- **D-05:** 독자 전용 계정(작가 프로필 없음)이 연결을 시도하면 **작가 활성화 안내 후 거절**한다. 연결은 성립시키지 않는다.
- **D-06:** 동의 시 **scope를 `읽기`와 `초안 제안 저장`으로 나눠 grant에 기록**한다. 작가는 한 번에 둘 다 승인하며(UX 단일 승인), Phase 13·14가 재동의 없이 도구별 scope 검사를 쓰도록 하기 위한 구조다.
- **D-07:** 동의 화면 문구: 클라이언트명 + 접근 범위, 해제 방법 안내를 보여준다. ('본문 직접 수정 불가' 명시 문구는 이번에 선택되지 않았으므로 필수 아님 — 플래너 재량.)
- **D-08:** 본문 반영 정책(MCP-05)은 유지한다: 대화로 생성·수정한 결과는 '제안된 초안'으로 도착하고 작가가 스튜디오에서 수락해야 반영된다. 본문 직접 수정 도구는 만들지 않는다. (Phase 14 소관, 이번 설계의 scope 구조에만 영향)

### 해제 즉시 차단
- **D-09:** **MCP 호출마다 살아있는 grant를 DB에서 조회**해 유효할 때만 통과시킨다. 서명·만료만 보는 stateless JWT 검증을 단독으로 쓰지 않는다. (나중에 덧붙일 수 없으므로 설계 초기부터 포함)
- **D-10:** grant 조회 실패(DB 장애 등) 시 **호출을 차단(fail closed)** 한다.
- **D-11:** 액세스 토큰 수명은 짧게 유지한다(분 단위 권장, 구체 값은 리서치·플래너 결정).
- **D-12:** 해제 검증은 UI 목록이 아니라 **해제 이전에 발급된 토큰으로 실제 도구 호출을 시도해 차단되는지** 로 한다.

### 연결 관리 UI
- **D-13:** 위치는 **스튜디오 설정 > AI 커넥터**(`app/studio/settings/` 아래, `ai-providers` 옆 신규 페이지).
- **D-14:** 목록 항목: **클라이언트명 · 연결일 · 마지막 사용**. 마지막 사용 시각은 매 호출 grant 조회 시 갱신한다. (승인 scope 표시와 호출 도구/횟수는 이번에 선택되지 않음 — 후순위)
- **D-15:** 해제 UX: **확인 대화상자 + '다음 호출부터 차단됩니다' 문구**. 즉시 차단 보장 이상으로 과장하지 않는다. 재연결이 필요함을 안내한다.

### 검증용 도구
- **D-16:** 이 phase의 MCP 엔드포인트에는 **whoami류 읽기 도구 1개**만 둔다. 연결·본인 범위·해제 차단을 실제 호출로 증명하는 최소 도구이며, 작품 도구는 Phase 13에서 추가한다. 읽기 annotation을 붙인다.

### Claude's Discretion
- 토큰 수명 구체 값, 터널 도구 선택(ngrok/cloudflared/Vercel 프리뷰), grant 테이블 스키마 세부, 동의 화면의 세부 레이아웃, '본문 직접 수정 불가' 명시 문구 포함 여부.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 요구사항·로드맵
- `.planning/ROADMAP.md` — Phase 12 항목(Goal, Success Criteria 1~4, Notes: 스파이크 우선·grant introspection·research-phase 필수)
- `.planning/REQUIREMENTS.md` — MCP-01, MCP-08 및 Out of Scope(본문 직접 수정 도구 금지, ChatGPT best-effort)
- `.planning/STATE.md` — v1.1 상태, Phase 12 선행 스파이크·grant introspection 제약

### 리서치
- `.planning/research/ARCHITECTURE.md` — Pattern 6(MCP 라우트 위치·Supabase Auth OAuth 2.1 Server), Anti-Pattern 2(자체 AS 금지)
- `.planning/research/PITFALLS.md` — Pitfall 2(confused deputy/`createAdminClient`), Pitfall 8(해제는 행 삭제가 아님·live grant introspection)
- `.planning/research/STACK.md` — MCP 구현체(`mcp-handler`) 선택
- `.planning/research/FEATURES.md` — OAuth/MCP 기능 지형, ChatGPT 플랜 제약

### 외부 스펙(리서치 시 최신 재확인 필수)
- Supabase OAuth 2.1 Server / MCP Authentication 문서 — ARCHITECTURE.md 참고 링크
- MCP 인증 스펙 2026-07-28 개정(DCR → CIMD 대체) — 낡은 튜토리얼 주의

### 규칙
- `CLAUDE.md`, `AGENTS.md` — Next.js 16.3.2는 기존과 다름: 코드 작성 전 `node_modules/next/dist/docs/` 확인

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/supabase/server.ts`, `lib/supabase/client.ts`: 사용자 스코프 클라이언트 — MCP 도구 기본 클라이언트로 사용
- `lib/supabase/admin.ts`: `createAdminClient` — MCP 도구에서는 기본 금지(감사된 예외만)
- `lib/auth/writer.ts`, `lib/auth/write-access.ts`: 작가 여부 판정 — 독자 전용 거절(D-05)에 재사용 후보
- `app/studio/settings/ai-providers/` (page.tsx, ByokKeyCards.tsx): 설정 허브 카드 패턴 — AI 커넥터 페이지 레이아웃 참고

### Established Patterns
- `proxy.ts`가 모든 요청에서 Supabase 세션 쿠키를 갱신(`getClaims`) — `/oauth/consent`·MCP 라우트의 인증 경계와 matcher 영향 확인 필요
- 소유권은 공유 술어 함수 + RLS 이중 방어(`lib/kb/actions.ts` 패턴)

### Integration Points
- 신규: `app/mcp/[transport]/route.ts`(MCP 엔드포인트), `lib/mcp/`(별도 모듈), `/oauth/consent`, 스튜디오 설정 > AI 커넥터
- OAuth/MCP 관련 의존성·코드는 현재 없음(`package.json`에 mcp-handler 미설치)
- 마이그레이션 최신 번호 0036(world tree) — 새 grant 테이블은 일회용 DB에서만 검증

</code_context>

<specifics>
## Specific Ideas

- 사용자 의도: MCP는 IDE 같은 집필 환경에서 대화로 본문을 생성·수정하는 흐름을 지원하는 것. 읽기 전용이 목적이 아니며, 읽기/제안 scope 분리는 Phase 13→14 순서 때문에 권한을 단계별로 기록하는 내부 구조일 뿐이다.
- 본문 반영은 '제안 → 작가 수락'으로 유지(프롬프트 인젝션 방어).

</specifics>

<deferred>
## Deferred Ideas

- 연결 목록에 승인 scope 표시, 최근 호출 도구/횟수 — 호출 로그 필요, 후순위
- 작가 선택형 '자동 수락' 옵션 — 논의됐으나 선택되지 않음, Phase 14 이후 후보
- 작품·회차·설정집 읽기 도구 — Phase 13
- 쓰기 제안·리뷰 큐 — Phase 14

</deferred>

---

*Phase: 12-MCP OAuth 기반 · 연결/해제*
*Context gathered: 2026-10-23*

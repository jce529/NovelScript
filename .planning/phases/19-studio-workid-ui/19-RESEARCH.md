# Phase 19: 작가용 작품 홈 (`/studio/[workId]`) - Research

**Researched:** 2026-11-01
**Domain:** Next.js 16.3.2 App Router 서버 컴포넌트 페이지, 순수 상태 투영, vitest(node) 렌더 테스트
**Confidence:** HIGH (코드·docs 직접 확인), 심사 상태 의미는 MEDIUM(제품 결정 필요)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01 현황은 전체 회차 · 공개 · 미공개 · 심사 상태 4칸. 이미 있는 데이터(`listChapters`, 심사 패널 상태)만 쓴다.
- D-02 설정 문서 수, 토큰 잔액, 독자 지표는 현황에 넣지 않는다.
- D-03 첫 연재를 마칠 때까지 연재 시작 가이드(체크리스트형 5단계 + 진행 막대). 5단계: 작품 만들기 · 세계관 설정 문서 추가 · 첫 회차 쓰기 · 첫 회차 공개하기 · 세계관 공개 심사 요청(선택).
- D-04 (수정됨) 가이드 이후 고정 바로가기 **5개** 카드: 회차 목록 · 세계관 설정 · 타임라인 · 가지 치기 · 심사 요청. 작품 설정 카드 제외(2026-11-01). 각 카드에 짧은 상태 문구.
- D-05 시안 A식 추천과 5개 카드 외 추가 안내는 넣지 않는다.
- D-06 홈은 개요, 왼쪽 트리는 탐색. 홈 카드는 큰 작업 화면만, 개별 회차·문서 길은 17-07 트리만.
- D-07 17-07 트리(작품 폴더 · 계정 폴더)는 건드리지 않는다.
- D-08 회차 0개면 현황 4칸 숨김, 가이드만 크게, 지금 할 단계(설정 문서 추가) 강조 + 버튼.
- D-09 가이드 종료 전에는 작업 화면 카드를 가이드 아래에 접어 둔다.
- D-10 (수정됨) 트리 빈 폴더에 "아직 회차가 없어요", "아직 설정 문서가 없어요". 시놉시스가 없어도 추가 링크·안내 문구를 두지 않는다.
- D-11 모바일은 기존 하단 탭 중 `집필` 탭에 홈. 하단 탭 구조 불변.
- D-12 모바일 현황 2x2, 작업 화면 세로 목록(행 44px 이상), 가이드 단계 버튼 전체 폭 알약.
- D-13 UI-SPEC + 목업 + 실제 구현까지. D-14 시안에 없는 UI는 목업 먼저.

### Claude's Discretion
- 가이드 종료 기준, 단계 완료 판정 계산 방식, `ReviewRequestPanel`을 홈에 둘지 카드에서 여는 방식으로 옮길지, 문구·색·간격 세부, 사이드바가 좁을 때 카드 열 수.

### Deferred Ideas (OUT OF SCOPE)
- 최근 작업 목록(시안 E), 홈이 사이드바를 대체(시안 F), 독자 지표·토큰 잔액 표시, 상태 추천 카드(시안 A).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORKHOME-01 | 4칸 현황(전체/공개/미공개/심사 상태) | `listChapters` 행의 `is_published`(boolean, 소프트삭제 제외)로 계산 가능. 심사 칸 값 규칙은 Plan Risks R3 |
| WORKHOME-02 | 5단계 가이드, 필수 4단계 완료 시 소멸 | 2단계 판정은 `node_type==='file' && category!=='template'` 규칙(아래 §KB 구조). 순수 함수 + 단위 테스트 |
| WORKHOME-03 | 가이드 후 카드 5개 + 상태 문구 | 경로 4개는 실재(`chapters`, `world`, `world/timeline`, `world#world-branching`). 심사 카드는 R2·R5 |
| WORKHOME-04 | 트리 구조 불변, 빈 문구만 보강 | `layout.tsx` 구조 테스트(`sidebar-tree.test.ts`)가 순서를 고정. R6 참고 |
| WORKHOME-05 | 0회차: 현황 숨김·가이드 크게·카드 접힘·트리 빈 문구 | `<details>` 기본 닫힘, 서버 렌더 테스트로 검증 |
| WORKHOME-06 | 모바일 집필 탭 2x2/세로 목록/알약 | `createInitialPaneState`가 항상 `write`로 시작. 홈은 `StudioStage <main>` 안이라 구조 변경 불필요. R7 |
| WORKHOME-07 | 승인 목업대로 구현, 시안 밖 UI는 목업 먼저 | 19-04 체크포인트가 이 게이트. 브라우저 검증은 수동 |
</phase_requirements>

## Summary

계획 5개는 대체로 실제 코드와 맞다. `listChapters`·`getWorkKbNodes`·`getWork`·`getReviewPanelStateAction` 시그니처와 반환 형태, `StudioStage`/`mobile-tabs.tsx` 구조, 링크 대상 라우트 4개가 모두 확인됐다. 새 패키지는 필요 없다(lucide-react·react-dom/server 등 기존 의존성만). 기술적으로 가장 큰 위험은 Next 버전 특성이 아니라 **기존 테스트와의 충돌**이다. `tests/world-tree/entrypoints.test.ts`가 현재 `WorkHomePage`를 직접 렌더하며, 새 페이지가 호출할 `listChapters`가 그 테스트의 모킹에 없고 `reviewState` 목 반환값도 `{status:'none'}`이라 `state.target.ok` 접근에서 터진다. 이 파일은 어떤 plan의 `files_modified`에도 없다(R1).

두 번째 위험은 **의미 불일치**다. `ReviewTargetState.latestRequest`는 운영 차단(blind) 이후의 *재검토 요청*이고, 일반 작품에는 `blinded:false, latestRequest:null`이 정상이라 5단계 "세계관 공개 심사 요청"은 일반 작가가 완료할 수 없다. 현황 4번째 칸과 심사 카드의 일반 작품 문구는 아직 정의돼 있지 않다(R2, R3). 세 번째로 가이드 2단계의 `설정 추가` 버튼이 가는 `/world` 페이지에는 설정 문서를 만드는 UI가 없다(R4).

Next.js 16 관점에서 확인된 사항: `params`는 Promise(현 코드 그대로 OK), 레이아웃은 네비게이션 시 재렌더되지 않고 페이지만 재렌더되며 `staleTimes.dynamic` 기본값은 0초(v15.0.0부터)라 홈 페이지가 자체 쿼리를 하면 항상 최신값을 얻는다. `next.config.ts`에 Cache Components/`use cache` 설정이 없어 별도 캐시 고려는 필요 없다.

**Primary recommendation:** 계획 구조는 유지하되 (1) `tests/world-tree/entrypoints.test.ts`를 19-02의 수정 대상에 추가, (2) 일반 작품의 심사 칸/카드 문구와 5단계 완료 의미를 19-01 이전에 확정, (3) 2단계 CTA 목적지를 확인, (4) 설정 문서 판정 함수를 19-01/19-03이 공유하도록 한 곳에 둔다.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 소유권 확인 + 데이터 조회 | API/Backend (서버 컴포넌트 `page.tsx`) | Database (RLS + `owner_id` 필터) | `getWork(ownerId)` 선행 후 나머지 조회. 레이아웃은 데이터를 자식에 전달할 수 없어 페이지가 자체 조회 |
| 현황·가이드 완료 계산 | API/Backend (순수 함수 `lib/works/work-home.ts`) | — | DB 추가 조회 없이 이미 읽은 결과만 투영, 단위 테스트 용이 |
| 표시(현황·가이드·카드) | Frontend Server (SSR, `work-home-content.tsx`) | Browser (details 접힘 상태) | 상호작용이 거의 없어 서버 렌더가 기본 |
| 심사 접힘 영역 열기 | Browser (작은 클라이언트 조각 또는 details) | — | 카드/단계 5에서 접힘을 여는 동작은 클라이언트 상태 또는 `<summary>` 구조가 필요(R5) |
| 모바일 탭 전환 | Browser (`StudioWorkspace` 기존) | — | 변경 없음. 홈은 `write` pane의 children |
| 트리 빈 문구 | Frontend Server (`layout.tsx`) | — | 이미 읽은 `sections.myFolders`로 판정 |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.3.2 | App Router 서버 컴포넌트 | 기존 스택 [VERIFIED: package.json] |
| react / react-dom | 19.2.8 | `renderToStaticMarkup` 테스트 | 기존 테스트가 같은 패턴 사용 [VERIFIED: package.json, tests/studio/sidebar-tree.test.ts] |
| vitest | ^4.1.11 | 테스트(node 환경) | 기존 [VERIFIED: package.json, vitest.config.ts] |
| lucide-react | 기존 | 아이콘(BookOpen, Globe, Clock, GitBranch, ShieldCheck, ChevronRight) | UI-SPEC 지정, mobile-tabs.tsx에서 이미 사용 [VERIFIED: codebase] |
| tailwindcss | ^4 | 반응형 클래스(`max-lg:`) | 기존 셸이 `max-lg:` 접두 규칙을 씀 [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `<details>` 접힘 | `button aria-expanded` 클라이언트 | details는 JS 없이 키보드 동작, 서버 렌더 테스트에서 내용이 HTML에 남는다. 외부 요소에서 열기는 클라이언트가 필요(R5) |
| 페이지-레이아웃 중복 쿼리 | `React.cache` 래퍼 공유 | 중복 ~10회 쿼리가 줄지만 layout·테스트 모킹 변경이 큼. 이번 phase는 중복 허용 권장(Pitfall 1) |

**Installation:** 없음. 새 의존성 0개.

## Package Legitimacy Audit

새 외부 패키지를 설치하지 않으므로 해당 없음. 모든 plan의 T-19-SC가 `accept`로 일치한다. slopcheck 실행 불필요. **Packages removed:** none. **Flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
요청 /studio/{workId}
   |
   +--> layout.tsx (서버, 네비게이션 시 재렌더 안 됨)
   |       getUser -> getWork -> [getWorkKbNodes, getAccountSharedNodes, listChapters]
   |       -> 사이드바 트리 + StudioWorkspace(탭 상태) -> StudioStage <main>{children}</main>
   |
   +--> page.tsx (서버, 매 네비게이션 재렌더)
           params(await) -> createClient -> getUser -> getWork(ownerId)
              |-- null --> "작품을 찾을 수 없어요" + ← 작품 목록 (조회 없음)
              '-- ok  --> Promise.all[listChapters, getWorkKbNodes, getReviewPanelStateAction]
                            -> projectWorkHome(입력, now)  (순수, lib/works/work-home.ts)
                            -> <WorkHomeContent view=... reviewPanel=<ReviewRequestPanel/> />
                                  헤더 / 현황 4칸(회차>0) / 가이드(필수4 미완료) / 작업 화면 카드(접힘 또는 열림)
```

### Recommended Project Structure
```
lib/works/work-home.ts              # 순수 투영 (19-01)
components/studio/work-home-content.tsx  # props만 받는 표시 컴포넌트 (19-02/05)
app/studio/[workId]/page.tsx        # 소유권 확인 + 조회 조립만
tests/works/work-home.test.ts       # 순수 함수
tests/works/work-home-page.test.ts  # 렌더 + page 모킹
```

### Pattern 1: 페이지 함수를 직접 호출하는 서버 렌더 테스트
**What:** `renderToStaticMarkup(await WorkHomePage({ params: Promise.resolve({ workId }) }))`. `@/lib/supabase/server`, `@/lib/works/actions`, `@/lib/chapters/actions`, `@/lib/kb/actions`, `@/lib/moderation/actions`, `@/components/moderation/review-request`를 `vi.mock`.
**When to use:** T-19-03(소유권 확인 전 조회 금지)을 구조 검사 대신 호출 순서/횟수로 검증할 때. 기존 선례: `tests/world-tree/entrypoints.test.ts` 458행 이하 [VERIFIED: codebase].
**Example:**
```ts
// Source: tests/world-tree/entrypoints.test.ts (기존 패턴)
m.getWork.mockResolvedValue(null);
const html = renderToStaticMarkup(await WorkHomePage({ params: Promise.resolve({ workId }) }));
expect(m.listChapters).not.toHaveBeenCalled();
expect(m.getWorkKbNodes).not.toHaveBeenCalled();
expect(m.reviewState).not.toHaveBeenCalled();
```

### Pattern 2: 표시 컴포넌트는 순수 props + `next/link`만 모킹
`tests/studio/sidebar-tree.test.ts`처럼 `next/link`를 `<a>`로 모킹하고 `createElement`로 렌더. `ReviewRequestPanel`은 별도 모킹(`next/navigation`, 서버 액션 import 때문).

### Anti-Patterns to Avoid
- **레이아웃 데이터로 홈 계산:** 레이아웃은 네비게이션 때 재렌더되지 않고 자식에 props를 못 넘긴다 [CITED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md "Layouts do not rerender"]. 홈은 페이지에서 직접 조회한다(계획과 일치).
- **홈 패딩 중복:** `StudioStage <main>`이 이미 `p-4 md:p-8`을 준다. UI-SPEC의 "좌우 padding 24px"를 홈에 또 주면 모바일에서 이중 패딩(32+24px)이 된다. 최대 폭 `max-w-[960px] mx-auto`만 홈에 둔다.
- **`StudioStage`/`mobile-tabs.tsx` 수정:** 불필요하고 `mobile-workspace*.test.ts`·`studio-shell-layout.test.ts`가 구조를 고정한다.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 접힘 UI | 커스텀 아코디언 상태 | `<details><summary>` | 키보드·ARIA 기본 제공, 서버 렌더 |
| 설정 파일 재귀 탐색 | 새 트리 순회 | `buildTree`/`partitionStudioSidebar` 결과 + 한 개의 공용 순수 함수 | 19-01(홈)과 19-03(사이드바)이 같은 판정을 써야 함 |
| 심사 상태 문구 | 새 문구 체계 | `lib/moderation/user-actions.ts`의 `REVIEW_BADGE`('검토 중'), `REVIEW_REQUESTED_LABEL`('검토 요청됨') 등 기존 상수 | UI-SPEC도 "기존 패널 문구 재사용"을 요구 |
| 날짜 diff | 날짜 라이브러리 | 서버가 전달한 `now`를 받는 소규모 순수 계산 | 새 의존성 금지, 결정적 테스트 |

## Runtime State Inventory

해당 없음(rename/migration phase 아님). DB 변경·마이그레이션·시크릿 변경 없음.

## Common Pitfalls

### Pitfall 1: 레이아웃과 페이지의 중복 조회
**What goes wrong:** 레이아웃(getUser·getWork·KB·계정KB·회차)과 페이지(getUser·getWork·회차·KB·심사 2쿼리+checkWriteAccess+getUser)가 같은 요청에서 ~10회 중복 조회한다.
**Why:** Supabase 클라이언트는 `React.cache`로 감싸져 있지 않다. Next는 동일 `fetch`를 메모이즈하지만 [CITED: docs 01-getting-started/06-fetching-data.md] PostgREST 호출 메모이즈에 의존하지 않는 편이 안전하다.
**How to avoid:** 이번 phase는 중복을 허용(작품 홈 1회 렌더, 비용 낮음)한다고 계획에 명시하고, `React.cache` 공유는 후속 최적화로 둔다. 소유권 확인 순서(T-19-03/06)가 더 중요하다.
**Warning signs:** `Promise.all` 안에서 `getWork` 이전에 `listChapters`가 호출되는 코드.

### Pitfall 2: 레이아웃 redirect와 페이지의 "작품 없음" 분기
레이아웃이 `getWork` null이면 `/studio`로 redirect하므로 페이지의 "작품을 찾을 수 없어요" 분기는 실사용에서 거의 도달하지 않는다. 그래도 `tests/world-tree/entrypoints.test.ts`(레이아웃 없이 페이지만 렌더)가 이 분기를 테스트하므로 유지한다. 이 분기 HTML에 `/world` 문자열이 들어가면 기존 테스트(`not.toContain('/world')`)가 깨진다.

### Pitfall 3: 사이드바 문구는 HTML에 두 번 나온다
`layout.tsx`가 `sidebar`를 데스크톱 `StudioSidebar`와 모바일 `StudioPane`에 모두 렌더한다. 트리 문구를 세는 테스트는 중복을 전제해야 한다(레이아웃 테스트는 보통 소스 문자열/순수 함수를 검사).

### Pitfall 4: 마이그레이션 시드가 만드는 노드
`create_work`는 작품마다 잠금 폴더 7개(회차, template, 인물, 장소, 사건, 세력, 아이템)와 template 하위 카테고리 폴더 5개를 만든다 [VERIFIED: supabase/migrations/0012_template_category_folders.sql]. 따라서 `getWorkKbNodes` 결과가 비어 있지 않다. "노드 1개 이상"이 아니라 "실제 설정 파일 1개 이상"으로 판정해야 한다(계획은 이미 그렇게 명시). 기본 템플릿 파일은 `category==='template'`, `is_locked===true` 파일이다 [VERIFIED: tests/kb/sidebar-sections.test.ts 픽스처, lib/kb/sidebar-sections.ts].

### Pitfall 5: `mobile-pane-state` 초기값
`createInitialPaneState`는 항상 `write`, `navigate`도 pathname 변경 시 `write`로 리셋한다 [VERIFIED: components/studio/workspace/mobile-pane-state.ts]. 홈 진입은 자동으로 집필 탭이다. 탭 전환 후에도 children이 계속 마운트(숨김은 `max-lg:invisible`+`inert`)되므로 `<details>` 열림 상태 등이 유지된다.

## Code Examples

### 설정 문서 판정(권장 형태)
```ts
// 순수. flat 노드 또는 TreeNode 어느 쪽에도 쓸 수 있게 node_type/category만 본다.
// 근거: 회차는 kb_nodes 파일이 아니며(트리거 guard_chapter_folder_no_kb_files),
// 기본 템플릿·내 템플릿 파일은 category==='template'.
export const isSettingDocument = (n: { node_type: string; category: string }) =>
  n.node_type === 'file' && n.category !== 'template';
```
19-01은 `FlatKbNode[]`에 대해, 19-03은 `sections.myFolders`(TreeNode)에 대해 쓰므로 `lib/kb/sidebar-sections.ts` 또는 `lib/kb/tree.ts`에 한 번만 정의하고 둘 다 import한다(R8).

### 심사 상태 형태
```ts
// Source: lib/moderation/actions.ts, user-actions.ts
// ReviewPanelState = { target: ReviewTargetResult; writeDenied: string | null }
// target.ok===true  -> state: { blinded, blindReason, latestRequest: { id, status:'open'|'maintained'|'unblinded', createdAt, resolvedAt }|null }
// target.ok===false -> code: 'not_found' | 'unavailable'
// 일반 작품 정상 상태: { ok:true, state:{ blinded:false, latestRequest:null } }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `staleTimes.dynamic` 30s | 기본 0s | Next v15.0.0 | 홈을 다시 열면 항상 서버 재렌더 [CITED: docs 03-api-reference/05-config/01-next-config-js/staleTimes.md] |
| 동기 `params` | `params: Promise<...>` | Next 15+ | 현 코드가 이미 `await params` 사용 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 일반 작품 심사 칸 값을 "요청 전" 등으로 보여 줄 수 있다 | R3 | 문구가 사용자 기대와 다름 → 19-04 승인 범위에 포함 필요 |
| A2 | `ensure`/세계수가 없는 작품에서도 `/world` 링크는 정상 열린다 | R4 | 확인 못 함(`/world/page.tsx`는 세계수 없으면 "세계수 만들기" 트리거를 보여 줌, 파일 상단 주석) |
| A3 | Playwright/e2e가 없어 브라우저 검증은 수동뿐 | Validation | 있다면 자동화 가능(이번 조사에서 e2e 설정 파일은 발견 못 함) |

## Open Questions

1. **일반 작품에서 "심사 상태" 칸에 무엇을 보여 줄 것인가?** (R3) — `latestRequest===null && !blinded`는 흔한 정상 상태인데 UI-SPEC에 값이 없다. 19-04 체크포인트에서 함께 결정 권장.
2. **가이드 5단계는 일반 작가가 완료 가능한가?** (R2) — 현재 코드상 일반 작품의 "세계관 공개 심사 요청" 제출 기능은 없다(`requestReview`는 `not_blinded` 거부). 선택 단계라 가이드 종료엔 영향이 없지만 영구 미완료다.
3. **2단계 CTA `설정 추가`의 목적지** (R4).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node + npm + vitest | 모든 자동 검증 | ✓ | vitest 4.1.11 (4개 기존 파일 21 테스트 813ms 통과 확인) | — |
| 원격 Supabase / dev 서버 | 19-05 브라우저 비교 | 미확인 | — | 수동 게이트로 분리, 자동 테스트는 DB 불필요 |
| `npx tsc --noEmit`, `npm run lint` | 19-02/05 verify | 미실행(기준선 상태 미확인) | — | 실패 시 기존 실패 vs 신규 실패를 구분해 기록 |

신규 테스트에 `helpers/db`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `postgres(` 문자열을 넣지 말 것 — `vitest.config.ts`가 이 패턴으로 DB 직렬 프로젝트로 분류한다 [VERIFIED: vitest.config.ts].

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.11, `environment: 'node'`, projects `unit`/`db` (tests/**/*.test.ts 자동 수집) |
| Config file | `vitest.config.ts` (alias `@`→루트, `server-only` 스텁) |
| Quick run command | `npm test -- tests/works/work-home.test.ts tests/works/work-home-page.test.ts` |
| Full suite command | `npm test` (DB 프로젝트 포함이라 느림. phase 게이트는 아래 영향 파일 묶음 + tsc + lint) |

테스트는 `.test.ts`만 수집되므로 JSX 대신 `createElement`를 쓴다(계획과 일치).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WORKHOME-01 | 전체/공개/미공개 집계, 심사 칸 값(조회 실패 포함) | unit | `npm test -- tests/works/work-home.test.ts` | ❌ Wave 0 (19-01) |
| WORKHOME-01 | 현황 4칸 `dl` 렌더(회차>0), 숨김(회차 0) | render | `npm test -- tests/works/work-home-page.test.ts` | ❌ (19-02) |
| WORKHOME-02 | 단계 완료 규칙, 필수 1~4 완료 시 가이드 종료, 5단계 선택, 설정 파일 판정 | unit | `npm test -- tests/works/work-home.test.ts` | ❌ (19-01) |
| WORKHOME-02 | progressbar ARIA(`aria-valuenow/min/max`), `ol`, 완료 SR 텍스트 | render | `npm test -- tests/works/work-home-page.test.ts` | ❌ (19-02) |
| WORKHOME-03 | 카드 5개·작품 설정 카드 없음·경로 4개·상태 문구 | unit+render | 위 두 파일 | ❌ (19-01/02) |
| WORKHOME-03 | 소유자 확인 전 조회 금지(getWork null → 조회 0회) | page mock | `npm test -- tests/works/work-home-page.test.ts` | ❌ (19-02) |
| WORKHOME-04 | 트리 순서·구조 불변 | source | `npm test -- tests/studio/sidebar-tree.test.ts tests/studio/mobile-workspace-wiring.test.ts` | ✅ (19-03에서 문구 기대값만 수정) |
| WORKHOME-05 | 0회차: 현황 없음·가이드 크게·details 닫힘 | render | work-home-page.test.ts | ❌ (19-02) |
| WORKHOME-05 | 트리 빈 문구 2개 + 판정 함수 | unit+source | `npm test -- tests/studio/sidebar-empty-copy.test.ts tests/kb/sidebar-sections.test.ts` | ❌ (19-03) |
| WORKHOME-06 | 반응형 클래스(`grid-cols-2`, `min-h-11`, `w-full rounded-full`, 가로 스크롤 유발 클래스 없음) | render(클래스 문자열) | work-home-page.test.ts | ❌ (19-02) |
| WORKHOME-06 | 탭 구조 불변 | source/SSR | `npm test -- tests/studio/mobile-workspace.test.ts tests/studio/studio-shell-layout.test.ts tests/studio/mobile-pane-state.test.ts` | ✅ |
| WORKHOME-07 | 승인 목업 일치, 데스크톱·모바일 실화면 | manual | 19-05 human-check, viewport·스크린샷 경로 기록 | manual-only: 시각 비교는 자동화 불가 |
| (회귀) | 기존 홈 엔트리 테스트 | page mock | `npm test -- tests/world-tree/entrypoints.test.ts` | ✅ but 수정 필수 (R1) |

### Sampling Rate
- **Per task commit:** 해당 plan의 `npm test -- <files>`(수 초)
- **Per wave merge:** `npm test -- tests/works tests/studio tests/kb/sidebar-sections.test.ts tests/world-tree/entrypoints.test.ts`
- **Phase gate:** 위 묶음 + `npx tsc --noEmit` + `npm run lint` green 후 `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/works/work-home.test.ts`, `tests/works/work-home-page.test.ts` — 신규(각 plan이 생성)
- [ ] `tests/studio/sidebar-empty-copy.test.ts` — 신규(19-03)
- [ ] `tests/world-tree/entrypoints.test.ts` — 기존 `/studio/[workId] work home entry links` 블록을 새 홈에 맞게 수정 (R1, 어떤 plan에도 없음)
- 프레임워크 설치 불필요

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | 기존 `supabase.auth.getUser()`(세션 쿠키). 신규 인증 로직 없음 |
| V3 Session Management | no | 기존 |
| V4 Access Control | yes | `getWork(ownerId=user.id, workId)` 선행, 이후 모든 조회에 `ownerId` 전달. 레이아웃이 1차 redirect |
| V5 Input Validation | yes | `workId`는 URL 입력. 기존 헬퍼가 `ownerId` 필터/UUID zod 검증. 신규 서버 액션 없음 |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 타인 workId로 현황 조회(IDOR) | Information disclosure | `getWork` null이면 일반 "작품 없음" 화면, 추가 조회 0회(테스트로 고정) |
| 심사 사유(`blindReason`)·타 작품 정보 노출 | Information disclosure | 홈 현황/카드에는 상태 텍스트만. 사유는 기존 `ReviewRequestPanel` 안에서만 |
| 심사 조회 실패를 정상으로 위장 | Spoofing | `확인 못 했어요`로 투영, 이력 완료로 추정 금지 |
| 신규 서버 액션 추가로 인한 권한 상승 | Elevation | 새 액션 금지(19-04/05 계획 일치). `requestReviewAction`은 `not_blinded` 거부 유지 |

## Plan Risks

**R1 (높음) — 기존 테스트 `tests/world-tree/entrypoints.test.ts`가 새 홈과 충돌, 어떤 plan에도 포함되지 않음.**
이 파일(98~103, 458~472행)은 `@/app/studio/[workId]/page`를 직접 import해 렌더한다. 모킹: `@/lib/chapters/actions`는 `{ listPublicChapters }`만 제공 → 새 페이지의 `listChapters` 호출이 실패(vitest는 모킹 팩토리에 없는 export 접근 시 에러). `@/lib/kb/actions`는 모킹 없음(가짜 supabase로 `[]` 반환, 우연히 동작). `reviewState`의 `beforeEach` 반환값이 `{ status: 'none' }`이라 `state.target.ok`가 TypeError. 또한 단언 `data-review-panel` 존재(패널이 항상 렌더된다는 가정), `이 세계관에서 가지 치기` 텍스트, `/world` 부재(소유자 아님)가 있다. 조치: 19-02 `files_modified`와 verify에 이 파일을 추가하고 (a) `listChapters` 모킹 추가, (b) `reviewState` 목을 `{target:{ok:true,state:{blinded:false,blindReason:null,latestRequest:null}},writeDenied:null}`로 교체, (c) 새 홈 기준 단언으로 갱신(카드가 닫힌 `<details>` 안에 있어도 `renderToStaticMarkup` HTML에는 남음). 19-02/05의 verify 명령에도 이 파일을 넣을 것.

**R2 (높음/제품) — 5단계·심사 카드의 의미가 일반 작품과 맞지 않음.**
`ReviewRequestPanel`은 `blinded`이거나 `latestRequest.status==='open'`일 때만 렌더하고 아니면 `null`(review-request.tsx 48행). `requestReview`는 `blinded`가 아니면 `not_blinded`로 거부(user-actions.ts 287행). 즉 일반 작가가 누를 수 있는 "세계관 공개 심사 요청" 제출 경로가 코드에 없고, 5단계는 일반 작품에서 영구 미완료다. 19-01의 "latestRequest 있으면 완료" 규칙은 *재검토 요청 이력*을 의미한다는 점을 계획도 인지하고 있으므로(타입·테스트에 출처 명시), 19-04 결정에 "5단계 문구/상태를 일반 작품에서 어떻게 보일지"까지 포함시킬 것. 그렇지 않으면 가이드에 영영 완료되지 않는 "(선택)" 항목이 남는다.

**R3 (중간) — 현황 "심사 상태" 칸의 일반 작품 값이 미정.**
UI-SPEC은 `심사 대기 중`과 실패 시 `확인 못 했어요`만 정의한다. 대부분의 작품은 `blinded:false, latestRequest:null`이다. 19-01은 open/maintained/unblinded와 실패만 매핑한다. `blinded:true && latestRequest===null`(운영 차단 직후 요청 전)과 `null`(정상) 케이스의 문구를 19-01 이전에 정해야 한다. 기존 상수 `REVIEW_BADGE='검토 중'`, `REVIEW_REQUESTED_LABEL='검토 요청됨'` 재사용 권장.

**R4 (중간) — 가이드 2단계 `설정 추가` → `/world`는 문서 생성 화면이 아니다.**
설정 문서(KB 파일)는 사이드바의 `KbTreeActions`/`CreateRootFolderButton`/템플릿 다이얼로그, `kb/[nodeId]`에서 만들어진다. `/world` 페이지(`WorldSettings`·브랜치 위저드)에는 문서 생성 호출이 없다(`components/world-tree`에서 `createNodeAction` 미발견). UI-SPEC 표가 `/world`로 이동시키지만 사용자가 눌러도 단계가 완료되지 않는 길이 될 수 있다. 19-02 착수 전 목적지를 확인하거나(예: 모바일은 `설정집·회차` 탭 전환 유도), 시안 밖 변경이면 D-14에 따라 목업 승인을 받을 것.

**R5 (중간) — "카드/5단계가 접힌 심사 영역을 연다"는 서버 컴포넌트만으로 불가.**
`<details>`는 자기 `<summary>` 클릭으로만 열린다. 카드와 가이드 5단계 버튼이 둘 다 같은 영역을 열려면 (a) 심사 카드 자체를 `<summary>`로 만들고 5단계는 앵커만 제공하거나, (b) `'use client'` 래퍼(`useState`+`hashchange`/`aria-expanded`)가 필요하다. 계획의 "details/summary 또는 동등한 패턴"은 서버 렌더 테스트에서 클릭 동작을 검증할 수 없음을 고려해 구현 방식을 한 가지로 고정하고, 열림 동작은 수동 검증 항목으로 둔다. 또 일반 작품에서 패널이 `null`이면 열어도 빈 영역이므로 승인된 빈 상태 문구(19-04)를 접힘 영역 안에 직접 렌더해야 한다.

**R6 (중간) — 19-03 트리 문구가 진입 링크를 대체하는지 불명확.**
현재 `layout.tsx` 81~85행의 "첫 회차를 써볼까요?"는 `chapters/new?folderId=` 링크다. 19-03은 "그 위치에 `아직 회차가 없어요`를 보인다"고만 적어 링크를 없앨 수 있다. 다만 회차 루트 행에 `KbTreeActions`의 "새 회차 만들기" 아이콘 버튼이 있어(kb-node-dialogs.tsx 48행) 진입점은 남는다. 의도가 "링크 제거"인지 "문구만 변경, 링크 유지"인지 계획에 명시하고, `kb-tree.tsx` 180행에 같은 문구가 하위 렌더 경로로 존재(`isChapterRootFolder` 한정이라 레이아웃은 루트 자식만 넘겨 실사용 도달 안 함)하므로 수정 대상에서 제외됨을 확인해 둘 것. `chapters/page.tsx`의 "첫 회차를 써볼까요?"는 별개 화면이라 건드리지 않는다. `sidebar-tree.test.ts` 120행 기대값만 바꾸면 된다(계획 일치).

**R7 (중간) — 모바일 가로 스크롤 위험 지점.**
`StudioStage <main>`이 `min-w-0 p-4 md:p-8`이고 모바일에서 `overflow-y-auto`(X는 기본 visible→auto로 계산). 위험: (1) `grid-cols-[repeat(auto-fill,minmax(200px,1fr))]`를 그대로 쓰면 모바일 세로 목록 요구와 충돌 → `max-lg:grid-cols-1`/`grid-cols-1 lg:grid-cols-[...]`로 명시. 데스크톱 스튜디오에서 사이드바를 제외한 본문 폭이 600~700px대면 200px×3+gap 32=632px라 3열 최대 유지됨. (2) 긴 제목·시놉시스·상태 문구는 `min-w-0`/`break-words`(`[overflow-wrap:anywhere]`)·시놉시스 `line-clamp-2` 필요. (3) 2x2 현황 칸의 값이 긴 상태 문구면 넘침 → `truncate` 또는 줄바꿈 허용. (4) 홈에 24px 패딩 추가 금지(Anti-Patterns). 렌더 테스트는 이 클래스 존재만 검증 가능하고 실제 가로 스크롤은 수동(19-05 human-check)이 유일한 검증이다.

**R8 (낮음/구조) — 19-01과 19-03이 같은 "실제 설정 파일" 판정을 각자 만들 위험.**
두 plan은 모두 wave 1이고 서로 의존하지 않는다. 19-01은 `FlatKbNode[]`, 19-03은 `TreeNode[]`(`sections.myFolders`)를 입력으로 하므로 함수가 둘로 갈라지기 쉽다. 한 곳(`lib/kb/` 내 순수 함수)에 `isSettingDocument`를 두고 19-01·19-03이 import하도록 한 plan의 `files_modified`에 명시(충돌 방지를 위해 둘 중 하나가 소유, 다른 쪽이 의존하거나 wave를 조정). 현재 19-03은 `lib/kb/sidebar-sections.ts`, 19-01은 `lib/works/work-home.ts`만 수정하므로 후자가 전자를 import하게 하려면 19-01을 wave 2로 옮기거나 함수를 `lib/kb/tree.ts`에 두고 한쪽에 소유시킨다.

**R9 (낮음) — 계획 메타데이터.**
19-02의 `<context>`가 아직 없는 `components/studio/work-home-content.tsx`를 `@`로 참조(파일 생성 전). 실행기가 존재하지 않는 `@` 참조에서 막힐 수 있으니 `read_first`로만 두는 것이 안전. 19-02 verify의 `npm run lint -- --quiet`는 `--max-warnings=0` 스크립트 기본값 위에 얹히므로 의미가 19-05(`npm run lint`)와 다르다. 일관되게 `npm run lint`로 통일 권장. 19-04는 `files_modified: []`이고 `autonomous:false`이므로 19-05 입력은 19-04-SUMMARY뿐이다 — 요약에 승인 문구가 빠지면 19-05가 추측하게 되니 요약 필수 항목에 "승인 문구·빈 상태 동작" 명시.

**R10 (낮음) — 서버 시각 `now`.**
"n일 전" 계산은 plan대로 `now`를 입력으로 받는다. 페이지에서 `new Date()`를 호출해 전달하되, Next가 정적 prerender를 시도하지 않는 이유는 이미 `cookies`를 쓰는 `createClient` 때문이다(Cache Components 미사용). 별도 처리 불필요. `createdAt`이 빈 문자열(`String(row.created_at ?? '')`)일 수 있어 plan의 "잘못된 시각 안전 처리"가 실제로 필요하다.

## Sources

### Primary (HIGH confidence)
- 코드: `app/studio/[workId]/page.tsx`, `layout.tsx`, `components/studio/workspace/{mobile-tabs.tsx,StudioStage.tsx,mobile-pane-state.ts}`, `components/moderation/review-request.tsx`, `lib/moderation/{actions.ts,user-actions.ts}`, `lib/chapters/actions.ts`, `lib/kb/{tree.ts,actions.ts,sidebar-sections.ts,template-tree.ts}`, `lib/works/actions.ts`, `vitest.config.ts`, `supabase/migrations/{0004,0012}`
- 기존 테스트: `tests/world-tree/entrypoints.test.ts`, `tests/studio/{sidebar-tree,mobile-workspace,studio-shell-layout,mobile-workspace-wiring}.test.ts`, `tests/kb/sidebar-sections.test.ts`
- Next 16.3.2 로컬 docs: `01-app/03-api-reference/03-file-conventions/layout.md`(레이아웃 재렌더 없음), `05-config/01-next-config-js/staleTimes.md`(dynamic 기본 0), `01-getting-started/06-fetching-data.md`(메모이제이션), `02-guides/authentication.md`(레이아웃 auth 체크 주의)
- 실행 확인: `npm test -- tests/studio/sidebar-tree.test.ts ...` 4파일 21 테스트 통과

### Secondary / Tertiary
- 없음(외부 웹 조사 불필요, 신규 라이브러리 없음)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 신규 의존성 없음, 기존 package.json 확인
- Architecture: HIGH — 레이아웃/페이지/탭 코드와 Next docs 직접 확인
- Pitfalls: HIGH(R1, R4, 구조), MEDIUM(R2/R3는 제품 결정 사항)

**Research date:** 2026-11-01
**Valid until:** 30 days(코드 기반, 안정)

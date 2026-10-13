# Phase 16: 스튜디오 작업 흐름 확장 - 재개 보완(모바일 하단 탭) 리서치

**Researched:** 2026-10-12
**Domain:** Next.js 16 App Router 스튜디오 셸 · 반응형 레이아웃 · 모바일 탭 전환 · 모바일 검증 전략
**Confidence:** HIGH (현재 코드 사실) / MEDIUM (Tailwind·Base UI·권장 구조) / LOW (iOS·Android 실기기 키보드·안전영역 동작, 실기기 확인 전 가정)

<user_constraints>
## User Constraints (from CONTEXT.md)

출처: `.planning/phases/16-studio-workflow-upload/16-CONTEXT.md` (2026-10-02 확정 + 2026-10-12 Reopen 논의 결정). 아래는 원문 그대로다.

### Locked Decisions

- **D-01 (BYOK 위치):** `/account`에는 제공자별 연결 상태·키 끝 4자리 **요약 + 링크**만 둔다. 등록/재검증/삭제는 기존 `/studio/settings/ai-providers`에서 한다.
- **D-02 (설정 문서 AI 범위):** 회차 AiPanel을 그대로 재사용한다(문서 제안 저장·본문 초안 삽입 포함). 현재 문서 내용이 컨텍스트이며, 초안 삽입 위치는 문서 텍스트 커서다. 과금 `ledger reason`은 `kb:<nodeId>`.
- **D-03 (파일 업로드 용도):** 세 방식을 제공한다 — (a) 선택한 카테고리 폴더에 설정 문서로 일괄 저장, (b) 이번 대화에만 첨부(저장 안 함, 최대 5개), (c) Jev 자동 분류 후 승인.
- **D-04 (Jev 분류 승인 UI):** 승인 창은 기존 웹의 카테고리 트리를 그대로 보여주고, Jev가 제안한 위치에 새 문서를 얹어 표시한다. 사용자는 트리 안에서 드래그앤드롭으로 위치를 수정하고, 수정이 끝난 트리를 승인하면 그 배치대로 실제 폴더에 저장한다. 승인 전에는 아무것도 저장하지 않는다. Jev가 확신하지 못한 문서는 "미분류"에 두고 사용자가 직접 배치해야 승인할 수 있다.
- **D-05 (서버 신뢰 경계):** 승인 시 서버는 `targetFolderId`를 소유자·작품·범위·카테고리·삭제 상태로 다시 검증하고, 폴더의 카테고리를 문서 카테고리로 쓴다. 폴더가 바뀌었으면 다른 폴더에 조용히 저장하지 않고 해당 파일을 실패로 보고한다.
- **D-06 (모바일, 개정 2026-10-12):** 청사진의 **하단 탭 3개(설정집·회차 / 집필 / AI)** 로 전환한다. 접이식 "문서 목록"+세로 스택 AI 패널은 대체된다. 범위는 스튜디오 셸 한정 유지(독자 화면·admin 제외). 데스크톱 패널 접기(«·»)는 Phase 2 보완 범위와 겹치므로 plan 때 한 곳에서 맡도록 조정한다.
- **D-07 (한도):** 업로드 일괄 저장 50개 / 파일당 100,000자, 대화 첨부 5개 / 파일당 30,000자, 확장자 `.md` `.markdown` `.txt`.
- **D-01 유지 (2026-10-12):** `/account`에는 요약+링크만, 등록·재검증·삭제는 `/studio/settings/ai-providers`. 통합 설정 허브(계정·지갑·AI·작품)는 신규 작가 허브 phase에서 만들고, 허브가 생기면 D-01 링크 대상을 허브 `AI` 섹션으로 옮긴다.
- **UAT 순서 (2026-10-12):** Jev 실연결·DnD·설정 문서 대화·실기기 검증은 모바일 하단 탭 재작업 후 한 번에 실행한다. 레이아웃과 무관한 Jev·DnD·대화 항목은 Gemini 503이 풀리면 그전에 따로 돌려도 된다.
- **다음 단계 (2026-10-12):** 모바일 하단 탭 plan(보완) → 구현 → UAT. 신규 작가 허브 phase는 로드맵 추가 대기.

### Claude's Discretion

CONTEXT.md에 `## Claude's Discretion` 절은 없다. 이 리서치에서 권장안으로 제시하는 항목(플래너 재량 영역): 탭 상태 보관 방식, 탭 전환 브레이크포인트 값, 숨김 방식(display none vs inert+비가시), 하단 바의 키보드 대응 방식, 탭 바의 마크업(버튼 vs Base UI Tabs).

### Deferred Ideas (OUT OF SCOPE)

- 독자 화면·admin 모바일 대응
- Jev 분류 정확도의 오프라인 평가·그림자 운영
- 회차(chapter) 파일 일괄 가져오기
- 신규 작가 허브 phase(통합 설정 허브) — 로드맵 추가 대기
- Phase 17이 맡는 UAT 갭 4건(잔액 캡 안내 오표시, 업로드 다이얼로그 Select 경고, 파일 입력 기본 문구, 재시도 모델 미반영) — 모바일 plan에서 고치지 않는다
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description (REQUIREMENTS.md 원문 요지) | Research Support |
|----|-------------|------------------|
| STUDIO-01 | 계정 설정에서 BYOK 연결 상태·키 끝 4자리 확인, 관리 페이지 이동 | 이번 재작업 범위 밖(구현 완료, 재검증 대기). 단 `/account`가 STUDIO-04 모바일 문구에 포함됨(아래 열린 질문 1) |
| STUDIO-02 | 설정 문서 편집 화면에서 회차와 동일한 AI 패널 사용 | 모바일 탭의 AI 탭·문서 편집 탭 구조 근거 (항목 2, 3) |
| STUDIO-03 | 업로드·분류 승인 흐름 | 모바일에서 PlacementTree 터치 DnD 검증 경로 (항목 4) |
| STUDIO-04 | 모바일 세로 화면에서 가로 스크롤 없이 사용 (작품 사이드바·편집기·AI 패널·계정/설정 페이지) | 이번 보완 plan의 직접 대상 (항목 1~4 전체) |
</phase_requirements>

---

## 결론 요약

1. **현재 모바일 구현은 "임시 접이식"이다.** `app/studio/[workId]/layout.tsx`가 같은 `sidebar` JSX를 두 번(`<details md:hidden>` 안, `ScrollArea hidden md:block` 안) 렌더한다. KbTree가 DOM에 두 번 들어간다. 재사용 가능한 것은 트리 JSX·`KbTree`·`AiPanel`·`UploadFilesDialog`·`PlacementTree`이고, 버릴 것은 `<details>` 래퍼와 중복 렌더다.
2. **탭 전환은 "언마운트 금지, CSS로 가리기"가 핵심이다.** `AiPanel`의 채팅 기록·입력창·진행 중 요청 잠금(`lockRef`)·실패 재시도 스냅샷이 모두 `AiPanel` 로컬 state다. 탭을 조건부 렌더링하면 AI 응답이 도착해도 setState가 사라진 컴포넌트에 떨어져 결과가 유실된다. 작성 중 본문(`content`)은 페이지 state라 살아남지만, textarea 커서·스크롤은 display:none 시 리셋될 수 있다.
3. **탭 상태는 layout 레벨 클라이언트 shell + context로 두고, 패널 wrapper(`StudioPane`)가 `max-lg:` 클래스로만 숨긴다.** 레이아웃은 Next 16 문서상 네비게이션 시 상태를 보존하고 리렌더하지 않으므로(03-layouts-and-pages.md), 트리 탭과 페이지 탭이 같은 shell에서 상태를 공유할 수 있다.
4. **브레이크포인트를 `lg`(1024px)로 단일화한다.** 현재 트리는 `md`, 편집기·AI 패널은 `lg`로 나뉘어 있어 768~1023px 태블릿에서 사이드바 + 세로 스택이 동시에 보이는 어중간한 상태다. 탭 모드를 `lg` 미만으로 하면 데스크톱 3패널 조건과 일치하고, Phase 2의 데스크톱 접기도 같은 기준을 쓸 수 있다.
5. **모바일 검증은 "뷰포트 에뮬레이션 자동화 + 실기기 수동"의 2단 구조다.** 저장소에는 Playwright·Testing Library·jsdom이 없다(devDependencies 확인). 자동화 도입은 의존성 추가라 사용자 승인이 필요하다. 키보드·안전영역·터치 DnD는 실기기 확인 없이는 확정할 수 없다.
6. **Phase 2와의 경계는 "모바일 = `max-lg:` 클래스·shell·탭 상태 / 데스크톱 = `lg:` 클래스·접기 상태"로 나눈다.** 두 plan이 같은 className 문자열을 건드리지 않도록 규칙을 정한다(항목 5).

**Primary recommendation:** `components/studio/workspace/`에 클라이언트 `StudioWorkspace`(탭 context + 하단 탭 바) 하나와 `StudioPane` wrapper를 만들고, layout은 트리를 한 번만 렌더해 `StudioPane pane="tree"`로 감싸며, 페이지 두 곳(회차·설정 문서)은 편집기·AI를 `StudioPane pane="write"` / `pane="ai"`로 감싼다. 숨김은 `max-lg:hidden`과 `inert`로만 한다.

---

## 1. 현재 모바일 구현: 파일·구조·재사용 가능 부분

### 1-1. 실제 구조 (코드 확인)

| 파일 | 현재 역할 | 근거 |
|------|-----------|------|
| `app/studio/layout.tsx` | 작가 역할 확인, 템플릿 시드, `SiteHeader`(sticky, h-14) 렌더 | 39행 `<SiteHeader />`; `components/layout/site-header.tsx` 24행 `sticky top-0 z-20 ... h-14` |
| `app/studio/[workId]/layout.tsx` | 작품 데이터 로드, 사이드바 JSX 구성 후 **두 번 렌더** | 44~72행 `sidebar`; 75~90행 `<details className="... md:hidden">` 안에 `{sidebar}`; 85~87행 `<ScrollArea className="hidden w-64 ... md:block">` 안에 `{sidebar}` |
| `app/studio/[workId]/chapters/[chapterId]/page.tsx` | 편집기(textarea) + AiPanel. 본문 `content`·`mentionedNodes`는 페이지 state | 28행 `content` state; 108행 `flex flex-col gap-6 lg:flex-row`; 116행 `min-h-[50vh]`; 186행 `{loaded && defaultProviderModel && <AiPanel ... />}` |
| `app/studio/[workId]/kb/[nodeId]/page.tsx` | 설정 문서 편집기 + AiPanel. `AiPanel`에 `key={nodeId}` | 75행 `lg:flex-row`; 82행 `min-h-[60vh] font-mono`; 104~106행 gating + `key={nodeId}` |
| `.../ai-panel/AiPanel.tsx` | 모델·장르·프리셋·첨부·멘션·채팅·입력창 전부 포함 | 326행 `<aside className="flex h-[85vh] ... lg:sticky lg:top-8 lg:h-[calc(100vh-4rem)] lg:w-96 ...">`; 121~148행 로컬 state; 484행 채팅 로그 `min-h-0 flex-1 overflow-y-auto`; 565~578행 입력창(하단) |
| `.../ai-panel/UploadFilesDialog.tsx` | 업로드 다이얼로그(Radix 아닌 Base UI Dialog, portal) | 181행 `max-h-[90vh] overflow-y-auto sm:max-w-xl` |
| `.../ai-panel/PlacementTree.tsx` | 분류 트리 DnD. Pointer 6px, Touch delay 150ms | 32~36행 sensors; 145행 핸들 `touch-none` |
| `components/studio/kb-tree.tsx` | `'use client'`, `useParams`로 활성 노드 표시 | 1행, 27행, 110행 |

### 1-2. 재사용 판정

| 요소 | 판정 | 이유 |
|------|------|------|
| `sidebar` JSX (작품 헤더·KbTree·계정 공유 폴더) | **재사용 (1회만 렌더)** | 데이터·로직은 그대로. 래퍼만 교체 |
| 두 번 렌더 구조 (`details` + `ScrollArea`) | **폐기** | DOM 중복, 접힘 상태가 하나로 공유되지 않음, 모바일 `details`는 탭 모델과 맞지 않음 |
| `AiPanel` 본체 | **재사용, 높이·내부 레이아웃만 mobile 분기** | 모든 로직 재사용. 수정은 `aside` 클래스(max-lg 접두)와 내부 스크롤 구조 |
| 편집기 textarea + 저장/발행 바 | **재사용** | 세로 흐름만 `flex-1` 높이로 바꿈 |
| `UploadFilesDialog`, `PlacementTree` | **재사용** | 다이얼로그는 portal이라 탭 숨김과 무관. 모바일 터치 센서는 이미 설정됨 |
| `components/ui/tabs.tsx` (Base UI Tabs 래퍼) | **재사용 가능하나 패널 용도로는 비추천** | 항목 2-3 참조 |
| `components/ui/sheet.tsx` | 대안(트리를 시트로) — **비추천** | 탭 3개 요구(D-06 개정)와 맞지 않음 |

### 1-3. 권장안

- layout에서 `sidebar`를 **한 번만** 만들고 `<StudioPane pane="tree">`로 감싼다. `details`와 두 번째 `ScrollArea`를 제거한다.
- 데스크톱 트리 폭 `lg:w-64`, 모바일은 전체 폭 — `w-64`를 `lg:` 접두로 옮긴다(Phase 2가 나중에 `lg:` 접기 상태를 여기에 더한다).
- `AiPanel`은 `h-[85vh]`를 **max-lg 전용**으로 바꾸고, `lg:` 쪽은 기존 값을 유지한다.

**신뢰도:** HIGH (코드 직접 확인). 재사용 판정 중 "sidebar 한 번만 렌더"는 KbTree가 `useParams`만 쓰므로 한 인스턴스로 충분하다는 점에 근거(MEDIUM — 같은 인스턴스가 두 위치로 옮겨질 때 펼침 상태가 유지되는지는 구현 후 확인).

---

## 2. 하단 탭 3개 전환 구현 패턴

### 2-1. 상태 보존: 언마운트하지 않는다 (가장 중요한 권장)

**근거 (HIGH, 코드):**
- `AiPanel`의 `messages`, `chatInput`, `attachments`, `isGenerating`, `notice`, `provider/model/keySource`, `genre`, `presetLevel`, `styleId`, `uploadOpen`, `modalMessageId` 모두 `AiPanel` 로컬 state (121~148행).
- 응답 대기 중 탭을 바꿔 AiPanel이 언마운트되면: `runAttempt`의 `await chatAction` 뒤 `setMessages`·`setIsGenerating`·`showNotice`는 사라진 컴포넌트에 쓰이고, 결과는 화면에 나타나지 않는다. `failedAttemptRef`(재시도 스냅샷)도 함께 사라진다.
- `chatLogRef`·`inputRef` 등 DOM ref도 마운트 해제로 끊긴다.

**근거 (Next 16 문서, 01-app/01-getting-started/03-layouts-and-pages.md:43):** "On navigation, layouts preserve state, remain interactive, and do not rerender." → 탭 상태를 layout 레벨 shell에 두면 페이지 간 이동에도 유지된다.

**권장:**
- 세 패널(tree / write / ai)을 **항상 마운트**하고, 비활성 패널은 `max-lg:hidden`(또는 `max-lg:invisible` + 절대 배치)으로만 숨긴다. `lg:` 이상에서는 세 패널이 모두 보인다.
- 비활성 패널에 `inert`를 붙여 포커스·탭 이동·스크린리더 접근을 막는다. React 19.2 프로젝트에서 boolean `inert`를 쓴다 (타입 확인 필요, MEDIUM).

**주의 — textarea·스크롤:**
- `display: none`은 요소의 레이아웃 박스를 없애므로 **스크롤 위치(`scrollTop`)가 리셋될 수 있다.** 채팅 로그(`chatLogRef`)와 편집 textarea에서 특히 문제. 브라우저별 차이가 있어 실기기·에뮬레이터에서 확인 필요 (LOW, 가정).
- 대안: 비활성 패널을 `max-lg:absolute max-lg:inset-0 max-lg:invisible`로 두면 레이아웃 박스가 유지돼 스크롤·선택 영역이 보존된다. 활성 패널만 `relative`. 구현 복잡도는 조금 높다.
- 텍스트 선택 영역(`selectionStart/End`)은 `display:none` 전후로 DOM 속성으로 유지되는 것이 일반적이다(MEDIUM). `insertTextAtCursor`는 이 값을 읽으므로 보존된다.

### 2-2. 작성 중 텍스트 보존

- 본문 `content`는 `ChapterEditorPage`·`KbNodeEditorPage`의 state(page.tsx 28행, kb page.tsx 21행)다. 탭을 바꿔도 페이지 컴포넌트가 살아 있으면 유지된다. **보존 조건은 "페이지를 언마운트하지 않는다"** 이다.
- 주의: 트리에서 **다른 문서를 누르면** 같은 layout 안에서 page가 바뀐다. 이때 page가 remount되는지(→ `content` 소실)는 Next 16 동작 확인이 필요하다(LOW). 현재 `chapters/[chapterId]/page.tsx`는 `loaded`를 리셋하지 않고 `key`도 없다. `kb` 페이지만 `key={nodeId}`를 AiPanel에 준다. 실제 전환 시 이전 문서 내용이 잠깐 보이거나 저장 대상이 어긋나는지 브라우저에서 확인해야 한다.
- **미저장 편집분**은 탭 전환으로는 사라지지 않는다. 그러나 트리에서 다른 문서로 가는 순간 소실될 수 있다. "저장 상태 칩"과 "떠나기 전 확인"은 **Phase 2 보완 범위**다(02-CONTEXT.md 139행 "저장 상태 칩"). 모바일 plan은 이 동작을 막거나 바꾸지 않는다.

### 2-3. 탭 바 마크업: 버튼 vs Base UI Tabs

- `components/ui/tabs.tsx`는 `@base-ui/react/tabs` 1.7.0 래퍼다. `TabsPrimitive.Panel`의 `keepMounted` 기본값은 **false**(`node_modules/@base-ui/react/tabs/panel/TabsPanel.d.ts` 33~36행) → 기본 사용 시 비활성 패널이 **언마운트**된다. 이 저장소의 목표와 정반대다.
- Base UI Tabs를 쓰더라도 `Tabs.Panel`을 쓰지 않고 `Tabs.Root`(controlled `value`) + `TabsList variant="line"` + `Tab`만 쓰는 방식이 가능하다. 패널은 `StudioPane`이 직접 숨긴다. (MEDIUM)
- **권장: 단순 버튼 3개 `<nav>`**. `aria-current="page"` 또는 `aria-pressed`로 활성 표시. 이유: 패널 가시성을 CSS가 제어하므로 Base UI의 패널 연결(aria-controls/tabpanel)이 필요 없고, 의존성·동작 추가가 없다. 목업(`EditorMobile.dc.html` 100행)은 `role="tablist"` / `role="tab"`이지만, 탭패널 연결이 없는 tablist는 접근성 측면에서 오히려 부정확하므로 `nav` + 버튼을 권장한다. (MEDIUM — 접근성 판단은 플래너·사용자 확정 필요)

### 2-4. 탭 상태 위치와 전환 규칙

- **상태:** `StudioWorkspace`(client, layout 안)가 `activeTab: 'tree' | 'write' | 'ai'`를 보관하고 context로 `StudioPane`에 제공한다. 기본값 `'write'`.
- **URL 쿼리(`?tab=`) 방식은 비추천:** `useSearchParams`는 Next 16 문서상 Suspense 경계가 필요하고(instant-navigation.md:202), 탭마다 history가 쌓여 뒤로가기 동작이 어색해진다.
- **자동 전환:** 트리에서 문서·회차를 누르면 `write`로 전환한다. 목업도 "설정 문서를 누르면 집필 탭에서 문서 편집기로 열려요"라고 명시한다(EditorMobile.dc.html 57행). 구현은 `usePathname` 변화 감지 또는 트리 링크 `onClick`. `usePathname`은 Suspense가 필요 없다(MEDIUM, 문서 확인 근거: 01-getting-started 계열). 권장: `usePathname` 변화 감지 한 곳에서 처리(링크가 여러 곳이라 누락 방지).
- **AI 초안 삽입 후:** `onInsertText`는 hidden textarea에 `focus()`를 하므로 모바일에서는 no-op이다. 사용자는 삽입 결과를 보지 못할 수 있다. **권장안:** 삽입 시 `write` 탭으로 자동 전환하고 토스트로 알린다. 이것은 제품 결정이라 열린 질문으로 올린다(열린 질문 4).

### 2-5. 모바일 키보드와 하단 탭 바

- **근거:** 입력창은 AI 패널 하단(AiPanel.tsx 565~578행), 본문 textarea는 화면 중앙. 키보드가 올라오면 `position: fixed` 하단 탭 바가 키보드 위에 떠서 입력창을 가리거나, iOS에서 바가 키보드 뒤로 숨는 현상이 알려져 있다 (LOW, 실기기 확인 필요).
- **권장 (MEDIUM):**
  1. 탭 바는 `position: fixed`가 아니라 **in-flow 플렉스 자식**으로 둔다. 셸 컨테이너를 `max-lg:h-[100dvh]` 또는 `max-lg:h-[calc(100dvh-3.5rem)]`(헤더 h-14 제외) 플렉스 열로 만들고, 패널은 `min-h-0 flex-1 overflow-y-auto`, 탭 바는 마지막 자식이다. 키보드가 올라오면 `dvh`가 줄어드는 브라우저(Chrome Android)에서는 자연스럽게 위로 붙는다.
  2. Chrome Android는 viewport `interactive-widget=resizes-content`를 쓰면 키보드가 레이아웃 뷰포트를 줄인다. Next 16 `viewport` export는 `interactiveWidget`을 지원한다(`node_modules/next/dist/lib/metadata/types/extra-types.d.ts` 53행). **단, 전역 viewport 변경은 독자 화면까지 영향을 준다** → 필요하면 `app/studio/layout.tsx`에만 export한다. Next는 중첩 layout의 viewport export를 병합하므로 studio 범위로 한정 가능(docs `generate-viewport.md`: viewport는 layout/page에서 export, Server Component 전용. studio layout은 서버 컴포넌트다). (MEDIUM)
  3. iOS Safari는 키보드가 열려도 `dvh`가 바뀌지 않는 경우가 있어, 입력창이 키보드 뒤로 갈 수 있다. 대응은 (a) 입력 포커스 중 탭 바 숨김(`focusin`/`focusout`) 또는 (b) `visualViewport` 높이 추적. **둘 다 실기기 확인 전에는 확정하지 않는다** (LOW).
- **안전 영역:** 현재 root layout에 `viewport` export가 없어 `viewportFit`이 기본값이다. `env(safe-area-inset-bottom)` 패딩은 `viewportFit: 'cover'`가 있어야 의미가 있다. 이것도 studio 범위로 한정 가능하지만 헤더·바 모두 패딩을 맞춰야 한다. 실기기 확인 전 결정하지 않는다 (LOW).

### 2-6. 데스크톱과의 반응형 분기

- **단일 기준:** `lg`(1024px). 근거: 데스크톱 3패널은 `w-64` 트리 + 편집기 + `w-96` AI aside가 함께 들어가야 해서 `md`(768px)에서는 폭이 부족하다. 현재 `md`에서 트리가 나타나고 편집기·AI는 `lg`에서 가로 배치되므로 **768~1023px이 어중간하다**(코드 확인, HIGH). (`lg` 권장은 MEDIUM — 제품 결정, 열린 질문 2)
- **CSS만으로 분기:** 탭 상태(JS)는 활성 탭만 결정하고, 가시성 분기는 `max-lg:` 클래스가 한다. 이렇게 하면 JS가 breakpoint를 읽지 않으므로 SSR 불일치(hydration mismatch)가 없다. `window.matchMedia`로 분기하는 방식은 비추천.
- **서버 렌더 첫 화면:** 기본 탭 `write`가 서버에서도 같은 값이므로 모바일 첫 화면이 깜빡이지 않는다(MEDIUM).

---

## 3. Next.js 16 주의점과 UI 부품

### 3-1. Next 16 문서에서 확인한 사항

| 항목 | 확인 내용 | 출처 |
|------|-----------|------|
| layout 상태 보존 | 네비게이션 시 layout은 상태를 보존하고 리렌더하지 않는다 | `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43` |
| viewport export | layout/page에서 `viewport` 객체 export 가능, Server Component 전용, layout·page 중 한쪽에서 `viewport`와 `generateViewport` 동시 export 불가 | `.../03-api-reference/04-functions/generate-viewport.md` |
| viewport 옵션 | `viewportFit`, `interactiveWidget` 타입 존재 | `node_modules/next/dist/lib/metadata/types/extra-types.d.ts` 52~53행 |
| `useSearchParams` | 동적 렌더 시 Suspense 경계 필요 | `.../02-guides/instant-navigation.md:202` |
| `params` | 이 저장소는 이미 `params: Promise<...>`를 `use(params)`로 읽는다(Next 16 변경점 준수) | `chapters/[chapterId]/page.tsx` 26행 |
| 사용자 지시(AGENTS.md) | "이 버전은 breaking change가 있다, 코드 작성 전 `node_modules/next/dist/docs/` 확인" | `AGENTS.md` |

**주의:** Next 16 문서에서 `viewport` 객체는 **Server Component에서만** 허용된다. 스튜디오 layout은 서버 컴포넌트이므로 가능하지만, 탭 셸을 `'use client'`로 만들면 viewport export는 그 파일이 아니라 `app/studio/layout.tsx`에 둬야 한다.

### 3-2. 클라이언트 번들 제약 (테스트로 강제됨)

- `tests/studio/client-bundle-fs-free.test.ts`는 `'use client'` 모듈의 **런타임 import 그래프**에 Node 내장 모듈과 `server-only`가 없는지 AST로 검사한다.
- 따라서 새 탭 셸(`StudioWorkspace`, `StudioPane`, 탭 바)은 `lib/**/actions`·`lib/kb/templates` 같은 서버 모듈을 **값으로** import하면 안 된다. 타입 import(`import type`)는 허용된다. 탭 상태는 순수 클라이언트 코드로 둔다.

### 3-3. UI 부품 사용 현황

| 부품 | 상태 | 모바일에서의 용도 |
|------|------|------------------|
| `components/ui/tabs.tsx` (Base UI 1.7.0) | 존재, `TabsList`는 `variant="line"` 지원 | 탭 바 스타일 참고용. 패널은 쓰지 않음(2-3) |
| `components/ui/sheet.tsx` | 존재(Base UI Dialog 기반) | 사용 안 함(D-06 개정) |
| `components/ui/scroll-area.tsx` | 존재, 트리 래퍼로 사용 중 | 모바일에서 패널 내부 스크롤은 네이티브 `overflow-y-auto`가 더 단순함 (MEDIUM) |
| `components/ui/dialog.tsx` | `max-h-[90vh] overflow-y-auto` 사용 | 포털이라 탭 숨김과 무관 |
| lucide-react | `ListTree`, `PenLine`, `Sparkles`, `FolderTree`, `NotebookPen`, `Bot`, `Library` 존재 확인 | 탭 아이콘 후보 (목업은 문자 `▤ ✎ ✦` 사용) |

---

## 4. 모바일 실기기 없는 환경의 검증 전략

### 4-1. 현재 도구 상태 (확인 결과)

- `package.json` devDependencies: `vitest`, `eslint`, `tsx`, `typescript`, `@vitejs/plugin-react`. **Playwright·@testing-library·jsdom 없음.** (확인, HIGH)
- `vitest.config.ts`: `environment: 'node'`, 단위/DB 프로젝트 2개. DOM 테스트 환경 없음.
- 레지스트리 최신 버전(`npm view`, 2026-10-12): `@playwright/test` **1.64.0**, `@testing-library/react` **16.3.3**, `jsdom` **30.1.2**. (확인, HIGH — 설치 전 재확인 필요)
- 기존 UAT(02-10 VERIFICATION)는 "375px 에뮬레이션"을 인앱 브라우저로 했다. 인앱 브라우저는 `visibilitychange`를 주기적으로 발생시켜 dnd-kit 드래그를 취소시킨다(16-UAT.md 7번). 따라서 **인앱 브라우저로는 DnD를 판정하지 말아야 한다.**

### 4-2. 권장 3단계

| 단계 | 방법 | 무엇을 검증 | 신뢰도 |
|------|------|-------------|--------|
| A. 정적·단위 | `npm run lint`(`--max-warnings=0`), `tsc --noEmit`, vitest 단위 | 탭 상태 reducer(순수 함수), 브레이크포인트 클래스 규칙, **정적 가드**: 편집기·AI 패널이 `activeTab === ...`로 조건부 렌더링되지 않는지 AST로 확인하는 테스트(`client-bundle-fs-free`와 같은 방식) | HIGH (기존 패턴 재사용) |
| B. 브라우저 자동화 (뷰포트 에뮬레이션) | `@playwright/test@1.64.0` 추가 시 두 프로젝트: `desktop`(1280×800), `mobile`(390×844, `isMobile`, `hasTouch`) | 가로 오버플로(`scrollWidth === clientWidth`), 트리 DOM 인스턴스 1개, 탭 전환 후 textarea 값·커서·채팅 기록·입력창 텍스트 보존, 하단 탭 바 위치, 비활성 패널 `inert`, 데스크톱 3패널 회귀 | MEDIUM (로그인 픽스처·AI 호출 모킹이 필요) |
| C. 실기기 수동 | iOS Safari(iPhone), Android Chrome, 필요 시 태블릿 세로 | 키보드 올라올 때 입력창·탭 바, 안전 영역, `PlacementTree` **터치 DnD**(TouchSensor delay 150ms), 스크롤 보존 | 필수 (대체 불가) |

### 4-3. 상세 메모

- **Playwright 로그인:** `tests/uat/`에 UAT 계정 정리 스크립트가 있고(`cleanup-uat-accounts.test.ts`), 작가 계정 storageState를 한 번 만들어 재사용하는 방식이 가능하다. 단 DB 테스트 파일로 분류되어 `fileParallelism: false`에 묶인다(vitest.config.ts의 `DB_MARKER`). E2E는 별도 명령(`npm run test:e2e`)으로 분리하는 것을 권장한다.
- **AI 호출 모킹:** AI 응답은 Next 서버 액션(POST, `Next-Action` 헤더)이라 `page.route`로 잡을 수 있지만 취약하다. 이번 보완 검증에서는 **AI 응답 내용 검증을 제외**하고 "탭 전환 중 전송 중 상태·입력 보존"만 검증하는 것을 권장한다. 응답 도착 후 메시지 렌더 여부는 Gemini 복구 후 수동 UAT로 넘긴다 (LOW, 모킹 가능성은 구현 시 확인).
- **터치 DnD 자동화:** Playwright는 `page.touchscreen.tap`은 쉽지만, TouchSensor의 150ms 지연과 드래그 이동은 CDP `Input.dispatchTouchEvent` 시퀀스가 필요해 불안정할 가능성이 크다 (LOW). **자동화 대상에서 빼고 실기기 수동으로 둔다.**
- **인앱 브라우저:** 빠른 시각 확인용으로만 쓴다. DnD·키보드 판정은 하지 않는다.

### 4-4. 검증 해상도 목록 (권장)

| 뷰포트 | 목적 |
|--------|------|
| 360×740 | Android 소형 기준 |
| 375×667 | iPhone SE 기준 (기존 UAT와 비교) |
| 390×844 | 목업 `EditorMobile.dc.html` 크기 |
| 768×1024 | 태블릿 세로 — 탭 모드 경계 확인 (`lg` 미만이면 탭) |
| 1024×768 | 경계 바로 위 — 3패널 진입 확인 |
| 1280×800 | 데스크톱 회귀 |

---

## 5. Phase 2 보완 plan과의 분리 지점 (제안)

Phase 2 보완 plan은 "기본 템플릿 정책·우클릭(모바일 길게 누르기)·좌우 패널 접기·저장 상태 칩"을 맡는다(02-CONTEXT.md 139행, ROADMAP.md 70행). 모바일 plan과 겹치는 곳은 **layout.tsx의 트리 래퍼, 페이지 flex 컨테이너, AiPanel의 `aside` 클래스**다.

### 5-1. 경계 규칙

| 구분 | 모바일 plan (Phase 16 보완) | Phase 2 보완 |
|------|------------------------------|--------------|
| 탭 상태·탭 바·`StudioPane` wrapper | **소유** | 사용만 (추가 wrapper 금지) |
| 가시성 클래스 | `max-lg:` 접두만 | `lg:` 접두만 |
| 트리 래퍼 `w-64` | 모바일 전체 폭만 | `lg:w-64` 및 접기 시 세로 띠(rail) |
| `AiPanel` `aside` | `max-lg:h-...`, 내부 모바일 레이아웃 | `lg:w-96`, `lg:sticky`, 접기 |
| `«·»` 접기 버튼 | **만들지 않는다** (모바일에서 숨김) | 소유, `lg:` 전용 |
| 트리 우클릭/길게 누르기 메뉴 | **만들지 않는다** | 소유 (모바일에서도 동작해야 함 — 탭 셸 안에서) |
| 저장 상태 칩·떠나기 확인 | 건드리지 않음 | 소유 |
| 업로드·DnD 모바일 | 실기기 검증 항목만 | 해당 없음 |

### 5-2. 순서 권장

1. **모바일 plan 먼저:** `StudioWorkspace`·`StudioPane`·탭 바 생성, layout에서 트리 1회 렌더, 페이지 두 곳을 `StudioPane`으로 감싸기. 구조 변경이 크므로 먼저 끝낸다.
2. **Phase 2 plan 나중:** 이미 만들어진 `StudioPane`에 접기 상태를 `lg:` 클래스로 얹는다. Phase 2가 wrapper를 새로 만들지 않는다.
3. 두 plan이 같은 파일을 동시에 고치면 충돌하므로, 순서를 정하지 않으면 **하나의 plan으로 합치는 것**이 낫다 (열린 질문 3).

### 5-3. Phase 17과의 파일 겹침 (순서 주의)

Phase 17(버그 수정 통합)은 UAT 갭 4건을 맡으며, 그중 `AiPanel.tsx`(재시도 모델 반영, 잘림 배너), `UploadFilesDialog.tsx`(Select 경고, 파일 입력 기본 문구), `lib/ai/chat.ts`·`document-plan.ts`(잘림 판정)를 건드린다. 모바일 plan도 `AiPanel.tsx`의 `aside` 클래스를 바꾼다.

- 같은 파일이므로 **모바일 plan은 `aside` 클래스와 최상위 레이아웃 wrapper만** 건드리고, 로직·notice 영역은 손대지 않는다.
- Phase 17과 병행 시 `AiPanel.tsx` 머지 충돌 가능성이 높으므로, Phase 17의 AiPanel 수정을 먼저 끝내는 것을 권장한다 (MEDIUM).

---

## 6. 항목별 권장안 요약 (신뢰도 포함)

| # | 항목 | 권장안 | 신뢰도 | 근거 |
|---|------|--------|--------|------|
| 1 | 현재 구현 재사용 | 트리 JSX 1회 렌더, `details`·중복 제거, AiPanel 로직 유지 | HIGH | layout.tsx 44~91행, AiPanel 전체 |
| 2a | 상태 보존 | 패널 항상 마운트, `max-lg:hidden` + `inert` (스크롤 보존 필요 시 absolute+invisible) | HIGH(상태 소실 원리) / LOW(display:none 스크롤 리셋 여부) | AiPanel 로컬 state 121~148행, lockRef 141행 |
| 2b | 상태 위치 | layout 레벨 `StudioWorkspace` context, 기본 `write` | HIGH | Next 03-layouts-and-pages.md:43 |
| 2c | 탭 바 마크업 | `nav` + 버튼 3개, `aria-current` (Base UI Tabs Panel 비추천) | MEDIUM | tabs.tsx, TabsPanel.d.ts keepMounted 기본 false |
| 2d | 자동 전환 | 트리에서 문서 선택 → write, AI 초안 삽입 → write(제안, 결정 필요) | MEDIUM | 목업 EditorMobile.dc.html:57행 |
| 2e | 키보드 | 탭 바 in-flow, 셸 `dvh`, 입력 포커스 시 탭 바 숨김 검토 | LOW(실기기 필요) | iOS 키보드 동작은 실기기 확인 필요 |
| 2f | 안전 영역 | studio layout에만 viewport export 검토, 전역 변경 금지 | LOW | viewportFit 기본값, 전역 영향 |
| 2g | 브레이크포인트 | `lg` 단일 기준 (트리 md→lg 이동) | HIGH(현재 불일치 사실) / MEDIUM(lg 선택) | layout md, page lg |
| 2h | 편집기 높이 | `max-lg:flex-1 min-h-0` 채움 (`min-h-[50vh]` 대체) | MEDIUM | page.tsx 116행 |
| 3 | Next 16 주의 | viewport export는 서버 컴포넌트 전용, useSearchParams 미사용 | HIGH | generate-viewport.md, instant-navigation.md:202 |
| 3b | 클라이언트 번들 | 새 shell은 서버 모듈 값 import 금지 | HIGH | client-bundle-fs-free.test.ts |
| 4 | 검증 | 정적 + 정적 가드 테스트 + Playwright 뷰포트 + 실기기 필수 | HIGH(구조) / MEDIUM(Playwright 도입 비용) | package.json, npm view |
| 5 | Phase 2 경계 | max-lg/lg 접두 분리, 모바일 plan이 wrapper 소유 | MEDIUM | CONTEXT.md D-06, 02-CONTEXT.md 139행 |

---

## 7. 위험

| # | 위험 | 영향 | 발생 가능성 | 완화 |
|---|------|------|-------------|------|
| R1 | 탭을 조건부 렌더링하면 AI 응답·채팅 기록·재시도 스냅샷이 사라짐 | 높음(응답 유실, 중복 과금 가능성 — 재요청 시) | 높음(구현 방식이 틀릴 때) | 항상 마운트. 정적 가드 테스트로 조건부 렌더 금지 |
| R2 | 트리 DOM 2회 렌더 유지 | 중간(중복 상태·중복 ID·테스트 어려움) | 확실 | 1회 렌더로 교체 |
| R3 | 768~1023px 어중간 레이아웃 | 중간(태블릿에서 깨진 것처럼 보임) | 확실(현재) | `lg` 단일 기준 |
| R4 | display:none으로 스크롤·커서 리셋 | 중간(작성 흐름 끊김) | 중간(브라우저 의존) | absolute+invisible 대안, 실기기 확인 |
| R5 | iOS 키보드가 입력창·하단 탭 바를 가림 | 높음(모바일 AI 대화 불가 가능) | 중간 | 입력 포커스 시 탭 바 숨김 검토, 실기기 검증 |
| R6 | 전역 viewport 변경이 독자 화면까지 영향 | 높음(범위 밖 회귀) | 낮음(설계로 회피 가능) | studio layout에만 export |
| R7 | AI 패널 설정 블록(모델·장르·프리셋·문체·첨부·멘션)이 세로 공간을 먼저 차지 | 중간(채팅 로그가 몇 줄만 보임) | 높음(추정) | AI 탭 내부에서 설정 블록을 접는 disclosure 또는 채팅 영역 최소 높이 보장. 실측 필요 (MEDIUM) |
| R8 | 탭 전환 중 AI 응답 도착 시 notice 포커스 이동 | 낮음 | 중간 | 비활성 패널의 `inert`로 포커스 대상 제외. 기존 `notice` effect의 `inputRef.focus()`는 숨김 상태에서 no-op |
| R9 | AI 초안 삽입이 숨겨진 textarea에 들어가 사용자가 못 봄 | 중간 | 높음(모바일에서 삽입 후 write 탭이 아니면) | 삽입 시 write 자동 전환 (열린 질문 4) |
| R10 | 미저장 편집분이 트리 문서 선택 시 소실 | 높음 | 중간(page remount 여부 미확인) | Phase 2 저장 상태 칩·떠나기 확인과 연계. 모바일 plan은 미루되 흐름 테스트에 포함 |
| R11 | 칩 hover 전용 UI가 터치에서 안 보임 | 낮음 | 낮음 | 현재 트리에 우클릭 UI 없음(확인). Phase 2 길게 누르기와 연계 |
| R12 | Phase 17과 `AiPanel.tsx` 머지 충돌 | 중간 | 높음 | 순서 합의, aside 클래스만 수정 |
| R13 | 독자 화면 재설계로 `StudioPane` 재사용 욕구 | 낮음 | 낮음 | 범위 밖 명시 |
| R14 | STUDIO-04 요구사항 문구("계정/설정 페이지" 포함)와 D-06 "셸 한정" 충돌 | 높음(완료 판정 기준 불일치) | 확실 | 열린 질문 1 |

---

## 8. 열린 질문

1. **범위: `/account`·`/studio/settings/ai-providers`의 모바일 대응을 이번 plan에 포함하는가?**
   - What we know: STUDIO-04 문구는 "작품 사이드바·편집기·AI 패널·계정/설정 페이지"를 포함한다(REQUIREMENTS.md 115행). D-06은 "스튜디오 셸 한정"이다.
   - What's unclear: 계정·설정 페이지는 셸 바깥(`app/account`, `app/studio/settings`)이라 `StudioWorkspace` 탭 구조와 무관하다.
   - Recommendation: D-06 우선(셸 한정)으로 두고, 계정·설정 페이지의 세로 가로 스크롤 점검만 별도 항목으로 추가하거나, REQUIREMENTS STUDIO-04 문구를 "스튜디오 작업 셸(작품 사이드바·편집기·AI 패널)"로 좁히는 결정을 사용자에게 받는다. (사용자 결정 필요)

2. **탭 모드 브레이크포인트: `lg`(1024) 단일 기준으로 할 것인가?**
   - What we know: 현재 트리는 `md`, 편집기·AI는 `lg`다. 768~1023px에서 어중간하다.
   - What's unclear: 태블릿 세로(768~1023)를 탭으로 볼지, 세로 스택(사이드바 없음)으로 볼지.
   - Recommendation: `lg` 단일 기준(탭 모드 < lg). 사용자 확인 필요.

3. **Phase 2와 모바일 셸을 한 plan으로 합칠 것인가, 순서를 나눌 것인가?**
   - What we know: 둘 다 layout 트리 래퍼·AiPanel `aside`·페이지 flex를 건드린다. CONTEXT는 "plan 때 한 곳에서 맡도록 조정"을 요구한다.
   - Recommendation: 모바일 plan이 wrapper와 shell을 만들고, Phase 2는 `lg:` 접기만 얹는다. 순서를 두 plan으로 나눌 때 이 규칙을 각 plan의 "경계" 절에 적는다.

4. **AI 초안 삽입 시 write 탭으로 자동 전환할 것인가?**
   - Recommendation: 자동 전환 + 토스트 "본문에 삽입했어요". 사용자 확인 필요.

5. **탭 바 아이콘·라벨 문구:** 목업은 `▤ 설정집·회차`, `✎ 집필`, `✦ AI`를 쓴다. lucide 아이콘으로 바꿀지, 목업 문자를 쓸지. (디자인 결정, 기존 UI 톤은 lucide 사용)

6. **Next 16의 page remount 동작:** `chapters/[chapterId]`에서 다른 회차로 이동할 때 page 컴포넌트가 remount되는가(→ `content` 초기화)? 브라우저 확인이 필요하다. 결과에 따라 chapter page에 `key={chapterId}`를 추가해야 할 수 있다(kb page는 이미 `key={nodeId}`).

7. **AI 패널 내부 구조:** 설정 블록을 모바일에서 접을지(disclosure), 채팅 로그에 최소 높이를 줄지. 실측 후 결정.

8. **viewport 범위:** `viewportFit: 'cover'`·`interactiveWidget`을 studio layout에만 적용할지, 이번 plan에서는 보류할지. 실기기 확인 결과에 따라 결정.

---

## 9. 구현 체크리스트 (플래너 입력용)

- [ ] layout: `sidebar` 1회 렌더, `details` 제거, 트리를 `StudioPane pane="tree"`로 감싸기
- [ ] `StudioWorkspace`(client) + context + 하단 탭 바(`nav`, 3 버튼, `aria-current`)
- [ ] `StudioPane` wrapper: 비활성 시 `max-lg:hidden` 또는 absolute+invisible, `inert`
- [ ] 회차 page·설정 문서 page: 편집기 `StudioPane pane="write"`, AiPanel `StudioPane pane="ai"`
- [ ] 트리 문서 선택 → write 자동 전환 (`usePathname` 변화 감지)
- [ ] AiPanel `aside`: `max-lg:h-full` 등 모바일 전용 클래스, `lg:` 기존 클래스 유지
- [ ] 편집기 textarea: `max-lg:flex-1 min-h-0`, 기존 `min-h-[50vh]`는 `lg:` 쪽으로
- [ ] 브레이크포인트 `lg` 통일 (layout·page·AiPanel)
- [ ] 정적 가드 테스트: 편집기·AI 패널이 탭 상태로 조건부 렌더링되지 않음(AST 기반)
- [ ] 단위 테스트: 탭 상태 reducer, 자동 전환 규칙 (순수 함수)
- [ ] 뷰포트 자동화(의존성 추가는 사용자 승인 후): 가로 오버플로, 트리 인스턴스 1개, 탭 전환 시 값·입력 보존
- [ ] 실기기 수동 UAT 체크리스트: iOS Safari·Android Chrome 키보드, 안전 영역, 터치 DnD, 스크롤 보존
- [ ] 금지 사항: 독자 화면·admin 수정 금지, Phase 17 버그 수정 금지, 전역 viewport 변경 금지(studio 범위만)

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

- 사용자와의 대화·산출 문서는 한국어. (CLAUDE.md "Language")
- 코드 탐색 전에 graphify 질의를 먼저 쓴다(graphify-out/graph.json 존재 확인). 이번 조사에서 `graphify query`를 1회 실행했다. 코드 수정 후에는 `graphify update .` 다음 `python3 scripts/graph-link-requirements.py`를 실행해야 한다(요구사항 ID 노드 유지).
- 외부 AI 호출(Codex 등)은 모델을 명시한다. 이번 리서치는 외부 AI를 호출하지 않았다. 플래너를 Codex로 돌릴 때는 `config.json`의 `model_overrides`를 따른다.
- 로드맵 상태 변경 시 `traceability-sync` 절차(REQUIREMENTS → ROADMAP → STATE → SSOT → graphify)를 따른다. 이 리서치는 상태를 바꾸지 않았다.
- UI 작업이 UI-SPEC으로 끝나면 `design` 스킬로 Artifact 목업을 함께 제공한다(메모리 규칙). 이번 보완은 `EditorMobile.dc.html` 목업이 이미 있으므로 UI-SPEC 작성 시 그 목업을 기준으로 삼고, 목업과 실제 헤더 높이 차이(목업 52px vs `h-14` 56px, 탭 바 60px)를 정리한다.
- 금지: 외부 AI 호출 없이 모델 임의 대체, 커밋 자동 실행(이번 리서치는 커밋하지 않음).
- `AGENTS.md`: 이 Next는 breaking change가 있으므로 코드 작성 전 `node_modules/next/dist/docs/`를 확인한다. 이번 리서치에서 viewport·layout·searchParams 문서를 확인했다.

---

## Sources

### Primary (HIGH confidence) — 저장소 내부
- `.planning/phases/16-studio-workflow-upload/16-CONTEXT.md` (D-01~D-07, 2026-10-12 Reopen 결정)
- `.planning/phases/16-studio-workflow-upload/16-SUMMARY.md`, `16-VERIFICATION.md`, `16-UAT.md`
- `.planning/REQUIREMENTS.md` 112~115행 (STUDIO-01~04 원문)
- `.planning/design/UI-DESIGN-BACKLOG.md` 56행 (스튜디오 에디터 모바일 하단 탭), 69행
- `.planning/design/mockups/project/EditorMobile.dc.html` (18·44·57·100·120행: 390×844, 하단 바 60px, 헤더 52px, 탭 3개)
- `app/studio/[workId]/layout.tsx` (44~91행), `app/studio/layout.tsx`, `components/layout/site-header.tsx` (h-14 sticky)
- `app/studio/[workId]/chapters/[chapterId]/page.tsx` (28·108·116·186행), `kb/[nodeId]/page.tsx` (21·75·82·104~106행)
- `app/studio/[workId]/chapters/[chapterId]/ai-panel/AiPanel.tsx` (121~148·156~166·189~262·326·484·565~578행)
- `UploadFilesDialog.tsx` (181행), `PlacementTree.tsx` (32~36·145행)
- `components/studio/kb-tree.tsx` (1·27·110행), `components/ui/tabs.tsx`, `components/ui/sheet.tsx`
- `tests/studio/client-bundle-fs-free.test.ts`, `vitest.config.ts`, `package.json`
- `.planning/ROADMAP.md` 22·46·70·435~452행, `.planning/phases/02-studio-core-writer-loop-no-ai/02-CONTEXT.md` 139행
- `graphify-out/graph.json` 질의(`graphify query`) 결과 — 보조 확인용

### Primary (HIGH confidence) — 설치된 문서·타입
- `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` (43행: 네비게이션 시 layout 상태 보존)
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` (viewport export 규칙)
- `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md` (202행: useSearchParams Suspense)
- `node_modules/next/dist/lib/metadata/types/extra-types.d.ts` (52~53행: viewportFit, interactiveWidget)
- `node_modules/@base-ui/react/tabs/panel/TabsPanel.d.ts` (33~36행: keepMounted 기본 false) — @base-ui/react 1.7.0

### Secondary (MEDIUM) — 레지스트리 조회
- `npm view @playwright/test version` → 1.64.0
- `npm view @testing-library/react version` → 16.3.3
- `npm view jsdom version` → 30.1.2
- `npm view @dnd-kit/core version` → 6.3.1 (설치본과 동일)

### Tertiary (LOW — 실기기·브라우저 확인 필요)
- iOS Safari 키보드 시 `position: fixed` 하단 바 동작
- `display: none` 전환 시 scrollTop 리셋 여부 (브라우저별)
- Chrome Android `interactive-widget=resizes-content` 실제 동작
- 인앱 브라우저의 `visibilitychange` 취소 현상은 16-UAT.md 7번 기록에 근거(재현은 미실시)

---

## Metadata

**Confidence breakdown:**
- 현재 코드 구조·재사용: HIGH (직접 읽음)
- 상태 보존 원리(언마운트 시 유실): HIGH (AiPanel 로컬 state 구조)
- 브레이크포인트 불일치: HIGH (md/lg 혼재 확인)
- Next 16 layout·viewport 규칙: HIGH (설치된 docs)
- Base UI Tabs keepMounted 기본값: HIGH (d.ts)
- 탭 바 마크업·`lg` 선택·자동 전환 규칙: MEDIUM (권장, 제품 결정 포함)
- iOS 키보드·안전 영역·display:none 스크롤: LOW (실기기 필요)
- Playwright 도입 가능성·AI 모킹: MEDIUM~LOW (구현 시 확인)

**Research date:** 2026-10-12
**Valid until:** 2026-11-11 (Next·Base UI 버전 변동 시 재확인; 레지스트리 버전은 설치 직전 재확인)

**작업 메모:** 이 문서는 조사 결과다. 코드·문서·의존성은 변경하지 않았다. 커밋하지 않았다.

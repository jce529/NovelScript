# Phase 19: 작가용 작품 홈 디자인 (`/studio/[workId]`) - Context

**Gathered:** 2026-11-01
**Status:** Ready for planning

<domain>
## Phase Boundary

작가가 `/studio/[workId]`에서 작품의 현황을 한눈에 보고, 큰 작업 화면(회차 목록·세계관 설정·타임라인·가지 치기·심사 요청)으로 이동할 수 있게 한다. 지금은 제목·시놉시스·심사 패널·밑줄 링크 3개뿐이다.

범위는 **디자인(UI-SPEC·목업)과 실제 화면 구현 둘 다**다. 기존 17-07 작품 트리 사이드바 구조는 바꾸지 않는다. 독자 지표, 토큰 잔액, 최근 작업 목록은 이번 범위 밖이다.

</domain>

<decisions>
## Implementation Decisions

### 현황 요약 (시안: Main/B/C/D의 위쪽 4칸)
- **D-01:** 현황 영역은 **전체 회차 · 공개 · 미공개 · 심사 상태** 4칸으로 한다. 이미 있는 데이터(`listChapters`, 심사 패널 상태)만 쓴다.
- **D-02:** 설정 문서 수, 토큰 잔액, 독자 지표(조회수·구독자)는 현황에 넣지 않는다.

### 다음 할 일 방식 (시안 C → B 전환, 사용자 확정)
- **D-03:** 첫 연재를 마칠 때까지는 **연재 시작 가이드(체크리스트형, 5단계 + 진행 막대)** 를 보여 준다. 5단계는 작품 만들기 · 세계관 설정 문서 추가 · 첫 회차 쓰기 · 첫 회차 공개하기 · 세계관 공개 심사 요청(선택)이다.
- **D-04:** 가이드를 마친 뒤에는 **고정 바로가기 5개 카드(시안 B에서 작품 설정 카드 제외)** 로 바뀐다. 5개는 회차 목록 · 세계관 설정 · 타임라인 · 가지 치기 · 심사 요청이다. 작품 설정 카드는 이동할 화면이 없고 세계관 설정 카드와 겹쳐 뺀다(2026-11-01 사용자 결정). 각 카드에는 짧은 상태 문구를 붙인다(예: 회차 12개, 심사 대기 중·2일 전 요청).
- **D-05:** 상태를 읽어 "지금 할 일"을 추천하는 방식(시안 A)과 항상 같은 5개 카드 외의 추가 안내는 넣지 않는다.

### 이동 구조 · 사이드바 관계 (시안 D, 사용자 확정)
- **D-06:** **홈은 개요, 왼쪽 트리는 탐색**으로 역할을 나눈다. 홈의 카드는 큰 작업 화면만 안내하고, 개별 회차·설정 문서로 가는 길은 17-07 사이드바 트리만 맡는다.
- **D-07:** 17-07 트리(작품 폴더 · 계정 폴더)는 건드리지 않는다.

### 빈 상태 (시안 G, 데스크톱)
- **D-08:** 회차가 0개인 새 작품은 현황 4칸을 **숨기고** 연재 시작 가이드만 크게 보여 준다. 지금 할 단계(설정 문서 추가)를 강조하고 버튼을 둔다.
- **D-09:** 가이드를 마칠 때까지는 작업 화면 카드를 가이드 아래에 접어 둔다.
- **D-10:** 사이드바 트리의 빈 폴더에는 "아직 회차가 없어요", "아직 설정 문서가 없어요" 안내를 둔다. 시놉시스가 없어도 제목 아래에 추가 링크나 안내 문구를 두지 않는다(작품 설정 화면이 없고 새 회차 쓰기가 가이드·트리에 이미 있어 뺀다, 2026-11-01 사용자 결정).

### 모바일 (시안 H·I)
- **D-11:** 모바일은 기존 하단 탭(`설정집·회차` / `집필` / `AI`) 중 **`집필` 탭에 홈이 들어간다.** 하단 탭 구조는 바꾸지 않는다.
- **D-12:** 모바일에서 현황은 2×2, 작업 화면은 세로 목록(행 높이 44px 이상)으로 배치한다. 가이드 단계 버튼은 전체 폭의 큰 알약 모양이다.

### 범위
- **D-13:** 이번 phase는 **UI-SPEC + 목업 + 실제 구현**까지 한다.
- **D-14:** UI 결정은 확정 전에 목업을 먼저 보여 준다는 사용자 지시를 따른다. 구현 중 시안에 없는 UI가 생기면 그 부분도 목업을 먼저 보여 준다.

### Claude's Discretion
- 가이드가 "끝났다"고 보는 기준(5단계 중 선택 단계 제외 4단계 완료인지, 5단계 전부인지)과 끝난 뒤 가이드를 접을지 사라지게 할지.
- 각 단계의 완료 판정을 계산하는 방식(회차·설정 문서 수, 공개 여부, 심사 요청 여부).
- 기존 `ReviewRequestPanel`을 홈에 그대로 둘지, '심사 요청' 카드에서 여는 방식으로 옮길지.
- 현황·카드 문구의 세부 표현, 색, 간격(기존 앱 톤: 흰 카드, 중립 회색, 인디고 포인트 하나).
- 데스크톱에서 사이드바 폭이 좁을 때의 카드 열 수(시안은 3열).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 시안 (사용자가 보고 고른 근거)
- Artifact `https://claude.ai/artifact/7fwJSpwr62QCZ2W5aRTxt8` (비공개, 소유자만 열람) — Phase 19 시안 캔버스. Main(A)·B·C: 다음 할 일 3방식, D·E·F: 사이드바 관계 3방식, G: 빈 상태, H·I: 모바일. **확정은 C→B 전환, D, G, H, I.** 가짜 데이터다. 저장소 사본: `.planning/phases/19-studio-workid-ui/mockups/` (`canvas.json` + 보드별 `*.dc.html`).

### 프로젝트 문서
- `.planning/ROADMAP.md` §Phase 19 — 목표, Depends on Phase 2, UI hint, Notes(목업 Artifact까지 완료 조건)
- `.planning/design/UI-DESIGN-RESUME.md` — 목업 작업 방법, 톤(흰 카드·중립 회색·인디고 포인트 하나)
- `.planning/design/UI-DESIGN-BACKLOG.md` — 확정된 UI 결정(스튜디오 영역과 충돌 확인용)
- `.planning/design/mockups/project/StudioShell.dc.html` — 기존 스튜디오 셸 목업
- `.planning/design/mockups/project/StudioEmptyStates.dc.html` — 기존 스튜디오 빈 상태 목업(문구 톤 확인)
- `.planning/design/mockups/project/Dashboard.dc.html` — 작가 대시보드 목업(카드 톤 참고)

### 참고: 찾지 못한 문서
- ROADMAP이 언급하는 `phase17-handover-author-work-home-phase.md`는 저장소와 모든 worktree에서 찾지 못했다. 필요하면 사용자에게 위치를 묻는다.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/studio/[workId]/page.tsx`: 현재 홈. `getWork`, `getReviewPanelStateAction`, `ReviewRequestPanel`을 쓴다. 이번 phase의 주 수정 대상이다.
- `app/studio/[workId]/layout.tsx`: 사이드바 트리와 `StudioWorkspace`를 조립하며 이미 `listChapters`, KB 노드를 불러온다. 홈 현황의 데이터 출처로 재사용하거나 같은 쿼리를 공유할 수 있다.
- `components/studio/workspace/mobile-tabs.tsx`: `STUDIO_TABS`(`tree`=설정집·회차, `write`=집필, `ai`). 모바일 홈은 `write` 탭에 해당한다.
- `components/moderation/review-request.tsx`의 `ReviewRequestPanel`: 심사 요청 UI.
- 링크 대상 라우트: `/studio/[workId]/chapters`, `/world`, `/world/timeline`, `/world#world-branching`.

### Established Patterns
- 17-07 트리 사이드바는 작품 폴더(회차·설정·템플릿)와 계정 폴더(설정)로 구성되고, 홈은 이 구조를 침범하지 않는다.
- 기존 시안 톤: 흰 카드, 중립 회색, 인디고 포인트 하나.

### Integration Points
- 회차 공개 수는 `listChapters` 결과의 `is_published`로 셀 수 있다.
- 심사 상태는 `getReviewPanelStateAction(workId, null)` 결과를 쓴다.
- 설정 문서 유무는 `getWorkKbNodes` 결과로 판단할 수 있다(가이드 2단계 완료 판정).

</code_context>

<specifics>
## Specific Ideas

- 사용자는 디자인을 글로 고르지 않고 목업을 보고 결정하길 원한다. 쟁점마다 같은 샘플 작품(달빛 아래의 서재, 12회차, 공개 9, 미공개 3, 심사 대기)으로 나란히 비교하는 방식이 잘 맞았다.
- "첫 연재 기준 체크리스트 이후 고정 바로가기가 더 깔끔해 보인다"는 판단이 D-03·D-04의 근거다.

</specifics>

<deferred>
## Deferred Ideas

- 최근 작업 목록("이어서 쓰기", 시안 E): 최근 수정 기록 조회를 새로 만들어야 해서 이번 범위 밖. 다음 후보 phase로 둔다.
- 홈이 사이드바를 대체하는 구조(시안 F): 17-07 트리 구조와 충돌해 범위가 커진다.
- 독자 지표(조회수·구독자), 토큰 잔액을 현황에 표시: 별도 데이터 정의가 필요하다.
- 상태를 읽어 다음 할 일을 추천하는 카드(시안 A): 첫 연재 이후에는 쓰지 않기로 했다.

None of the above were folded into this phase.

</deferred>

---

*Phase: 19-studio-workid-ui*
*Context gathered: 2026-11-01*

---

## 개정 2 (2026-11-01, 리서치 후 사용자 결정) — 아래가 위 본문과 충돌하면 이 절이 우선한다

- **심사 제거**: 일반 작품은 심사 요청을 할 수 없다(기존 `ReviewRequestPanel`은 블라인드된 작품의 재검토 요청 전용, `requestReview`는 블라인드가 아니면 거부). 따라서 현황 "심사 상태" 칸, 가이드 5단계 "세계관 공개 심사 요청", "심사 요청" 바로가기 카드를 모두 뺀다.
- **현황 3칸**: 전체 회차 · 공개 · 미공개. 모바일은 3칸 한 줄(또는 2+1) — 구현이 정하되 가로 스크롤 금지.
- **가이드 4단계**(작품 만들기 · 세계관 설정 문서 추가 · 첫 회차 쓰기 · 첫 회차 공개하기), 진행 막대 "N / 4". 4단계를 모두 마치면 가이드가 사라진다.
- **바로가기 카드 4개**: 회차 목록 · 세계관 설정 · 타임라인 · 가지 치기.
- **기존 심사 패널**: 지금처럼 작품이 블라인드이거나 열린 요청이 있을 때만 홈 맨 위에 `ReviewRequestPanel`을 그대로 렌더한다. 새 UI·카드·접힘 없음. 일반 작품에는 아무것도 보이지 않는다.
- **2단계 "설정 추가" 버튼**은 `/studio/[workId]/world`로 보낸다. 거기서 새 문서를 만들 수 없다면 구현 단계에서 버튼 문구만 "세계관 보기"로 바꾼다(새 화면 없음).
- 목업 보드 1~5는 2026-11-01에 이 개정대로 고쳐 다시 발행했다(현황 3칸, 가이드 4단계, 카드 4개, 심사·시놉시스 링크 없음, 2단계 버튼 "세계관 보기", 모바일 현황은 2+1).

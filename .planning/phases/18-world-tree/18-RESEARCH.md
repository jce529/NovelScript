# Phase 18: 세계수 (셀프 가지 · 연표 · 세계수 보기) - Research

**Researched:** 2026-10-12
**Domain:** 세계관 가지 치기(설정집 스냅샷) · 연표 배치 · 그래프형 트리 시각화 · RLS/RPC 데이터 모델
**Confidence:** MEDIUM (구현 선택지는 저장소 코드로 검증, 라이브러리 번들 크기·PG 버전은 미검증)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (CONTEXT.md `## 결정`, 번복 금지)
- **세계관 탭(작품 상세 4탭):** Phase 3 정합 보완이 4탭 셸(소개·회차·세계관·리뷰)을 만든다. Phase 18은 그 `세계관` 탭 안에 `세계수` 보기를 채운다. 따라서 Phase 18 plan은 Phase 3 보완의 4탭 셸 완료를 선행으로 둔다.
- **세계관 공개 설정 화면:** **Phase 18이 최소 버전을 직접 만든다.** 범위는 가지 치기 시작 위치인 작품 설정 화면의 `이 세계관에서 가지 치기` 버튼과 세계수 연결 공개 토글(WTREE-07)까지. 문서별 공개 스위치·등장 회차·세부 항목 잠금(READ-06, WTREE-09)은 후속 Lore 위키 phase로 남긴다.
- **열매 크기 지표(WTREE-08):** 완독 데이터 phase가 생기기 전에는 **현행 피드 점수 지표(조회·좋아요·다음화 이동률)** 로 임시 산출한다. 지표 어댑터를 한 곳에 두어 완독률·연독률 데이터가 생기면 그 어댑터만 교체한다. 작가 본인 조회 제외 규칙은 유지한다.

### Claude's Discretion (구현 선택지, 이 문서에서 좁힘)
- 렌더링 방식(SVG 직접 / 경량 라이브러리 / absolute 배치), 열매 많을 때 성능·겹침 기준
- DB 테이블 구조, RLS 정책 형태, 계층 조회 쿼리 방식
- 크기 산식 계수(근접도 감쇠율, 인기 가중치, 픽셀 매핑)
- 목록 보기 대체 수단의 구현 형태

### Deferred Ideas (OUT OF SCOPE)
- WTREE-09 스포일러 잠금의 가지 확장 (READ-06 Lore 위키 phase와 함께)
- 문서별 공개 스위치, 등장 회차, 세부 항목 잠금 (READ-06)
- WTREE-11~13 스토어 편입·환불·운영 검토 (스토어 보류 해제 후)
- 연표 편집 모바일 작가 화면, 모바일 가지 치기 흐름 (UI-SPEC 범위 밖)
- UI-SPEC의 "구매 스냅샷 시작" 입력(시작 위치 `내 구매 에셋`)은 이 phase에서 UI 자리만 두고 활성화하지 않는다

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WTREE-01 | 세계관별 연표(구간 필수, 연도 선택, 동시 진행) | 데이터 모델 A의 `world_eras` + `world_era_placements` (§2) |
| WTREE-02 | 가지별 연표, 잔가지는 분기 시점까지 이어받고 독립 구간에 메모 | 분기 시 구간 복사 + 독립 구간 메모 컬럼 (§2, 열린 질문 7) |
| WTREE-03 | If 가지 생성, 변경 0건이면 확정 불가 | 확정 RPC 서버 재검증 + 설정 diff (§2, §5) |
| WTREE-04 | 확장 가지 생성, 추가 0건이면 확정 불가, 기존 문서 수정·삭제 불가 | 상속 문서 쓰기 가드 트리거 (§2, 위험 3) |
| WTREE-05 | 분기 스냅샷 고정, 원작 변경은 알림만 | 스냅샷 복사 + 원본 참조 + 알림 큐 (§2, 열린 질문 6) |
| WTREE-06 | 세계수 보기(본가지·잔가지·열매, 시간순, 동시 진행 위·아래, 상세) | 레이아웃 순수함수 + SVG/버튼 오버레이 (§1) |
| WTREE-07 | 연결 공개 토글(기본 공개), 끄면 독자에게 본가지만, 작가·관리자 전체 | 가시성 정책 + reader RPC 투영 (§2, 열린 질문 1~3) |
| WTREE-08 | 가지 굵기 = 근접도·파생 규모, 열매 크기 = 지표 어댑터(임시: 피드 점수) | 지표 어댑터 설계 (§3) |
| WTREE-10 | 하위 가지가 있으면 삭제 불가, 비공개는 하위에 비전파 | 소프트 삭제 가드 트리거 (§2, 위험 2) |
</phase_requirements>

---

## 결론 요약

1. **렌더링은 의존성 없이 직접 구현한다.** 연표가 x축을 고정하므로 자동 그래프 레이아웃 라이브러리(elkjs, dagre, @xyflow/react)의 이점이 거의 없다. 좌표는 순수 TypeScript 함수로 계산하고, 선은 단일 SVG, 열매·가지 노드는 `<button>` 오버레이로 그린다. 접근성(Tab/Enter, aria-label)이 기본 제공되고 번들 증가가 없다.
2. **DB는 정규화 4테이블 + 독자용 RPC 투영 1개**로 간다. 설정 내용(`kb_nodes` 복사본)은 작가 전용 RLS에 두고, 독자에게는 RPC가 숫자와 메타만 돌려준다. 이렇게 해야 스포일러·설정 본문 노출을 막는다.
3. **가지 치기 초안은 `works` 행(draft 플래그)에 편집용 설정집을 두는 방식**을 권장한다. 스튜디오 KB 에디터를 그대로 재사용하기 위해서다. 단 현재 `works_public_read`가 삭제되지 않은 모든 작품을 공개하므로, 초안 노출 차단을 RLS 변경으로 같이 해야 한다(위험 1).
4. **열매 크기 어댑터는 pure TS 인터페이스 + 현행 가중치(조회 0.4·좋아요 0.3·다음화 이동률 0.3)** 로 만든다. 그러나 현재 코드는 **작가 본인 조회를 제외하지 않는다**(`lib/reader/views.ts`는 쓰기 권한이 있는 사용자의 조회를 센다). CONTEXT의 "유지" 전제가 코드에 없으므로 구현 항목으로 새로 잡아야 한다.
5. **plan 전에 사용자 결정이 필요한 것이 3가지 있다**: (a) 연결 공개 토글이 세계관 단위인지 가지 단위인지(UI-SPEC §5는 두 곳에서 같은 토글을 말한다), (b) 숨긴 가지의 하위 가지를 어떻게 그릴지, (c) 숨긴 가지의 작품이 피드·직접 URL에서도 숨겨지는지. 자세한 내용은 열린 질문 1~3.

**Primary recommendation:** 세계수 화면은 `lib/world-tree/`에 순수 함수(레이아웃·크기·근접도)를 두고, 데이터는 `SECURITY DEFINER` reader RPC 하나로만 내보내며, 확정·삭제 규칙은 DB 트랜잭션 RPC와 트리거로 강제한다. 프론트는 이 함수들을 `'use client'` 리프 컴포넌트에서 쓴다.

**선행 블로커:** 현재 `app/works/[workId]/page.tsx`는 **3탭(소개·작품설정·회차)** 이고 `세계관` 탭은 코드에 없다. Phase 3 보완(4탭 셸)이 끝나야 이 phase의 독자 진입점이 생긴다.

---

## 1. 세계수 시각화 (렌더링·크기·모바일)

### 권장안: 직접 구현 (순수 레이아웃 함수 + SVG 선 + 버튼 오버레이) — 신뢰도 HIGH (구조), MEDIUM (성능 수치)

| 층 | 구현 | 이유 |
|----|------|------|
| 좌표 계산 | `lib/world-tree/layout.ts` 순수 함수. 입력: 구간 목록·가지 목록·열매 목록, 출력: 노드 좌표·선 path 문자열 | x = 구간 인덱스 기반(연표 고정), y = 본가지 기준 위/아래 오프셋. 서버·클라이언트 공용, 단위 테스트 용이 |
| 선·가지 | 단일 `<svg>` 안 `<path>` (cubic bezier 문자열 직접 생성) | 가지 수백 개도 path 수백 개는 부담 없음. `d3-shape`는 필요 없음 |
| 열매·가지 노드 | 절대 배치 `<button>` 오버레이 (SVG와 같은 좌표계, 같은 스크롤 컨테이너) | Tab/Enter가 기본 동작, `aria-label`을 붙이기 쉬움. 44px 터치 영역은 투명 패딩으로 확보하고 시각 원은 작게 |
| 상태 | 선택 ID만 `useState`. 레이아웃은 `useMemo` | 상세 패널·시트가 같은 선택 ID를 본다 |

**근거**
- UI-SPEC의 구조(본가지 가로선, 시간순 x, 동시 진행 위·아래, 구간 눈금)는 전부 **고정 좌표 규칙**이다. 그래프 자동 배치(Sugiyama 등)가 바꿀 여지가 거의 없다.
- 노드 수는 "수백 개"(UI-SPEC 열매 많음 상태)다. 이 규모면 DOM 버튼 수백 개로 충분하다. 실제 DOM 비용은 구현 후 측정해야 하며 아래 임계값은 제안이다.

**성능 기준 (제안, 플랜에서 확정)**
- 노드 ≤ 300: 단일 렌더, 가상화 없음.
- 300~1000: 구간(열) 단위 가로 윈도잉(뷰포트 밖 열은 빈 래퍼로 치환). 선택된 노드는 항상 렌더.
- > 1000: Canvas 전환을 별도 과제로 본다. 이 phase에서는 구현하지 않는다.
- 측정 항목: 초기 렌더 시간, 선택 후 상세 갱신 시간(목표 100ms 이내, 제안). 측정은 실데이터 시드 후 수행한다(미검증).

### 라이브러리 비교 (버전은 npm 레지스트리에서 확인, 번들 크기는 **미확인**)

| 후보 | 최신 버전 (npm) | 마지막 갱신 | 적합성 |
|------|-----------------|-------------|--------|
| 직접 구현 (권장) | — | — | x축 고정 + 커스텀 가지 모양에 맞춤 |
| `@xyflow/react` | 12.12.0 | 2026-10-11 | 노드 에디터용 범용 그래프. 드래그·줌·미니맵 등 불필요 기능 다수. 번들 부담 큼 (크기 미확인) |
| `elkjs` | 0.12.0 | 2026-07-17 | 자동 레이아웃 엔진. 연표 x 고정과 충돌, 엔진 로딩 비용 |
| `d3-hierarchy` | 3.1.2 | 2022-06 | 트리 레이아웃. 연표 기반 x를 수동으로 넣어야 해서 이득 작음. 장기간 미갱신 |
| `d3-shape` | 3.2.0 | 2023-04 | path 생성만. 직접 구현으로 대체 가능 |
| `dagre` | 0.8.5 | 2022-06 | 장기간 미갱신, 비추천 |

**판단:** 새 의존성을 추가하지 않는다. 현재 `package.json`에 그래프·차트 라이브러리가 없다(확인함).

### 모바일
- 캔버스 가로 스크롤 컨테이너(`overflow-x: auto`), 상세는 하단 시트. 열 너비·노드 간격은 데스크톱과 같은 좌표를 쓰고 CSS `transform: scale`은 쓰지 않는다. scale은 터치 영역 계산을 어긋나게 한다.
- 시트 최소 높이는 CSS 변수로 두고 캔버스 높이를 `100dvh - 시트 높이`로 계산한다(고정 px 금지).

### 접근성
- 색만으로 If/확장을 구분하지 않는다. 노드 `aria-label` 예: `"{작품명}, If 가지, 세계관 내 시점 {구간명}"`.
- 목록 보기는 **같은 reader 데이터의 시간순 `<ol>`** 로 만든다. 상세 패널 컴포넌트를 재사용한다(UI-SPEC 기본안과 일치). 목록은 트리와 같은 projection을 쓰므로 데이터 중복이 없다.
- 다크 모드 대비: 시각화 토큰(`--tree-*`)은 라이트·다크 각각 값을 둔다. 대비 측정 도구 확인은 미검증.

### 연표 배치 (레이아웃 규칙)
- 구간은 열, 구간 안 작품은 **작가가 지정한 순서**(`order_index`)대로 위→아래로 쌓는다. 동시 진행 작품은 직전 작품과 같은 열의 반대쪽(위/아래)에 붙인다. 구간의 첫 작품은 동시 진행 불가(UI-SPEC 규칙 반영).
- 가지 분기점은 "분기 구간 인덱스"로 x를 정하고, 가지 선은 본가지의 해당 x에서 위/아래로 갈라진다.

---

## 2. DB 모델 · RLS · 계층 조회

### 권장안 A: 정규화 테이블 4개 + 독자 RPC 1개 — 신뢰도 MEDIUM

| 테이블 | 역할 | 핵심 컬럼 |
|--------|------|-----------|
| `world_branches` | 잔가지 1개 = 작품 1개 (열매) | `id`, `root_work_id`(본가지 작품), `parent_branch_id`(null이면 본가지에서 직접 갈라짐), `work_id`(이 가지의 작품, unique), `owner_id`, `kind` (`'if'`/`'expand'`), `fork_era_id`(분기 구간), `draft_work_id`, `status` (`'draft'`/`'confirmed'`), `connection_public` boolean, `deleted_at`, `created_at` |
| `world_branch_docs` | 분기 시점 설정 스냅샷 (문서 단위 복사 + 원본 참조) | `branch_id`, `source_node_id`(원본 kb_nodes id, 삭제돼도 보존), `name`, `category`, `content_hash`, `change_kind` (`'unchanged'`/`'modified'`/`'deleted'`/`'added'`), `content` |
| `world_eras` | 연표 구간 (가지별 독립) | `id`, `root_work_id`, `branch_id`(null = 본가지), `position`, `name`, `year_label`(선택), `memo`(잔가지 독립 구간만), `inherited` boolean(분기 시점 복사본 여부), `deleted_at` |
| `world_era_placements` | 작품 → 구간 배치 | `era_id`, `work_id`, `order_index`, `concurrent_with_prev` boolean, unique(`era_id`, `order_index`) |

**근거**
- 규칙 2(확장 가지 기존 설정 불변), 규칙 3(스냅샷 고정), 규칙 12(잔가지가 분기까지 본가지 연표 이어받음)를 "복사 + 원본 참조"로 가장 직접 표현한다.
- 연표 구간을 **분기 시점에 복사**하면 본가지 연표를 나중에 고쳐도 잔가지의 이어받은 구간이 흔들리지 않는다(스냅샷 원칙과 일치). 참조 방식은 열린 질문 7 참조.

### 대안 B: 가지 1행에 jsonb(문서+연표) — 비추천
- 장점: 저장 1회로 원자성 쉬움. 단점: 문서 단위 RLS가 없어 **독자 RPC 실수 한 번에 설정 본문이 샌다**. 연표 조회·열매 위치 조회가 jsonb 파싱에 의존. 기각.

### 대안 C: `kb_nodes`에 `scope='branch_snapshot'` 추가 — 비추천 (당장은)
- 장점: 기존 KB 에디터·복사 코드 재사용. 단점: `kb_nodes_scope_work_check` 제약·유니크 인덱스(`owner_id, work_id, parent_id, name`)·`guard_locked_kb_node` 트리거와 충돌하고, 기존 KB 조회 쿼리 전부에 필터가 필요해진다. 스키마 영향 범위가 크다.

### RLS 정책 (권장 형태)

| 테이블 | 작가(owner) | 독자(anon/authenticated) | 관리자 |
|--------|-------------|--------------------------|--------|
| `world_branches` | `owner_id = auth.uid()` 전체 | **직접 SELECT 금지 권장**: 노출은 RPC로만. 정책을 연다면 `deleted_at is null and connection_public` | RPC/정책에서 전체 |
| `world_branch_docs` | owner 전체 | **없음** (직접·RPC 모두 본문 미노출) | 기존 관리자 경로 |
| `world_eras` | owner 전체 | 없음 (RPC 투영만) | — |
| `world_era_placements` | owner 전체 | 없음 (RPC 투영만) | — |

**이유:** 기존 프로젝트 패턴(`0003_reader.sql`의 `security definer` RPC, `0009`의 blind 투영)과 일치한다. 가시성 판단을 RLS 행 단위로 하면 "본가지는 보이고 잔가지만 숨김"을 표현하기 어렵다(본가지 행은 항상 보이고, 가지 행만 조건부). RPC에서 한 번에 투영하는 편이 명확하다.

### 독자 가시성 RPC (핵심)
- `get_world_tree(p_root_work_id uuid)` — `security definer`, `set search_path = public`, 반환은 `jsonb` 한 덩어리 또는 `returns table`.
- 내부 규칙:
  1. 본가지 작품은 항상 포함(삭제·관리자 블라인드 작품 제외 — 기존 `admin_blinded` 규칙 준용).
  2. `auth.uid()`가 owner이거나 관리자면 전체, 아니면 `connection_public = false`인 가지와 그 열매를 제외.
  3. 제외된 가지의 **하위 가지**는 가장 가까운 **보이는** 조상에 재부착(열린 질문 2).
  4. 설정 본문·문서명은 반환하지 않는다. 반환 필드는 작품 id·제목·가지 종류·구간 위치·동시 진행 여부·근접도·크기 등급·변경 문서 **수**만.
  5. 지표 계산은 RPC 안에서 하지 않고 어댑터(§3)가 raw 값을 받아 계산한다(아래 주의).

### 계층 조회 쿼리 패턴
- **권장:** 가지 행을 `root_work_id` 기준 **플랫 SELECT 1회** 후 TS에서 `buildTree`를 만든다. 기존 `lib/kb/tree.ts`의 `buildTree`(한 번 순회, 고아는 루트로 취급) 패턴을 재사용한다. 세계관당 가지 수가 수백 이하라 DB 재귀가 필요 없다.
- **재귀 CTE가 필요한 곳:** "이 가지의 하위 가지 존재 여부", 깊이 제한, 순환 방지는 트리거·RPC 안에서 **직접 자식 존재 여부**로 충분하다(재귀 불필요).
- 재귀가 꼭 필요하면 `with recursive ... ` + `path uuid[]`로 순환을 막고 깊이 상한을 `MAX_FOLDER_DEPTH`(32, `lib/kb/actions.ts`)와 맞춘다. `ltree` 확장은 쓰지 않는다(Supabase 가용성 미확인).
- **주의:** `kb_nodes.ancestor_ids`/`depth`는 프로젝트에서 이미 "죽은 컬럼"으로 판정됐다(`lib/kb/tree.ts` 주석). 같은 방식을 반복하지 않는다.

### 삭제 가드 (WTREE-10) — 소프트 삭제라서 FK가 안 막는다
- 프로젝트는 `deleted_at` 소프트 삭제를 쓴다. `on delete restrict` FK는 **UPDATE로 deleted_at을 채우는 경우를 막지 못한다**(확인된 함정).
- 권장: `world_branches`에 `before update` 트리거 — `new.deleted_at is not null and old.deleted_at is null`이고 **살아 있는 자식 가지가 있으면 raise**. 기존 `guard_locked_kb_node`(0002)와 같은 패턴. 작품(열매) 삭제도 같은 규칙: 하위 가지가 있는 `works`는 소프트 삭제 불가 — works 쪽 트리거 또는 RPC 가드.
- 비공개 전환은 트리거 대상이 아니다(행 하나만 변경). 전파가 없다는 것이 자연스럽게 보장된다.

### 가지 확정 RPC (WTREE-03~05)
- `confirm_world_branch(p_draft_work_id uuid)` 단일 트랜잭션:
  1. 호출자가 draft의 owner인지 확인.
  2. 원본 `kb_nodes`와 draft `kb_nodes`를 비교해 `change_kind`별 건수 계산(**서버에서 재계산**, 클라이언트 값 불신).
  3. If: modified+deleted+added ≥ 1, expand: added ≥ 1 아니면 raise. (UI의 비활성화는 편의일 뿐)
  4. `world_branch_docs` 스냅샷 기록, `world_branches.status = 'confirmed'`, draft work 공개 전환 준비(공개 여부는 작가 선택).
  5. 원본 변경 알림용 행 기록(열린 질문 6).
- 확정 후에는 draft 설정 수정이 막혀야 한다(`status = 'confirmed'`인 work의 kb_nodes 쓰기 차단 트리거). 되돌릴 수 없음(UI 경고와 일치).

### 원본 변경 감지 (WTREE-05)
- 스냅샷 행의 `source_node_id`와 원본 `kb_nodes.updated_at`/`content_hash`를 비교하는 **읽기 시점 계산**은 가능하지만, 알림은 쓰기 시점 이벤트가 필요하다. 원본 kb 수정 트리거에서 `world_branch_notices` 행을 만드는 방식을 권장한다. 알림 채널(기존 알림 테이블 없음, 열린 질문 6) 확정 전에는 행만 쌓는다.

### 확장 가지의 상속 문서 가드 (WTREE-04)
- 확장 가지의 상속 문서는 `kb_nodes`에 복사되므로 기존 편집 경로가 열려 있다. `kb_nodes`에 `inherited_from_node_id uuid null` 컬럼을 추가하고, 그 값이 있는 행의 **content·name 수정과 삭제를 트리거로 막는다**. `is_locked`는 템플릿 폴더 이름 잠금 용도라 재사용하지 않는다(의미가 다름: `guard_locked_kb_node`는 name·삭제만 막고 content는 막지 않는다).
- 신규 문서 추가는 허용.

---

## 3. 임시 열매 크기 지표 어댑터 (WTREE-08)

### 현행 피드 지표 (코드로 확인)
- `lib/discovery/actions.ts`: 조회 = 공개 회차 `view_count` 합, 좋아요 = `work_likes` 행 수, 다음화 이동률 = 연속 회차 조회 비율 평균(`averageNextChapterCtr`).
- 점수 = `views_norm × 0.4 + likes_norm × 0.3 + ctr × 0.3` 후 0~100. `normalize`는 **전체 작품 집합의 최댓값**으로 나눈다.
- `listFeed`는 전체 작품과 좋아요를 메모리로 불러온다(1000행 페이지네이션, 150개 배치). **세계수 어댑터는 이 함수를 호출하지 않는다.** 세계관 하나의 작품 id만 받아 필요한 값만 조회해야 한다.

### 발견된 불일치 (구현 전에 알아야 함)
1. **작가 본인 조회는 현재 제외되지 않는다.** `lib/reader/views.ts`는 `checkWriteAccess`가 통과하는(쓰기 권한이 있는) 사용자의 조회를 **센다**. 작가는 쓰기 권한이 있으므로 자기 작품 조회가 `view_count`에 들어간다. CONTEXT의 "작가 본인 조회 제외 규칙은 유지한다"는 전제는 현재 코드에 없다. 신규 구현 항목이다.
2. 과거 `view_count`는 작가 조회가 섞여 있어 **소급 제외가 불가능**하다. 선택지: (a) 이후 조회부터 제외하고 과거 누적은 그대로 둠, (b) 지표 집계 기준일을 두고 그 이후만 사용. 권장은 (b)를 플랜에서 검토.
3. `view_count`는 사용자 중복 제거가 없다(D-09). 어뷰징 여지가 있다. 규칙 9가 "독자 지표 중심"을 요구하므로 열매 크기는 어뷰징에 약하다는 한계를 명시한다.
4. `ctr`(연속 회차 조회 비율)은 완독·연독이 아니라 **조회 수 비율**의 근사다. 이름을 `nextChapterRatio`처럼 정직하게 두는 편이 안전하다. 그대로 쓰면 UI 칩 "산식은 임시안"과 맞다.

### 권장 설계
```
lib/world-tree/metrics/
  types.ts          // interface FruitMetricAdapter, WorkStats (raw)
  feed-proxy-v1.ts  // 현행 지표 구현 (views·likes·nextChapterRatio → 0~1)
  index.ts          // 활성 어댑터 1곳 선택 (상수 하나)
```
- `FruitMetricAdapter.score(stats: WorkStats[]): Map<workId, number /* 0..1 */>`. 입력은 raw 값만, 출력은 0~1 정규화 값. 픽셀 매핑은 레이아웃 쪽에서 한다.
- 가중치 상수는 `feed-proxy-v1.ts`에 복사해 둔다. **`computeTrendingScores`는 건드리지 않는다**(피드 동작 변경 방지).
- raw 수집은 `world_work_stats(p_work_ids uuid[])` 같은 RPC나 서버 쿼리 한 곳에서. 작가 본인 제외 조건은 이 레이어에서 적용하되, 현재 카운터에는 개별 조회자 정보가 없어 **제외 자체가 불가능**하다(위 1·2). 따라서 어댑터 입력에는 `ownerViews` 필드를 두지 않고, 제외는 "조회 기록 테이블 도입" 또는 "increment RPC에서 owner 스킵"(prospective) 중 플랜에서 선택한다.
- 교체 지점: `index.ts`의 활성 어댑터 1곳 + 완독 데이터 테이블의 raw 수집 쿼리. 레이아웃·UI는 0~1 값만 보므로 바뀌지 않는다.

### 근접도·굵기 산식 (규칙 14, 임시안 계수)
- 근접도 = `(1 − changed / total) × decay^depth`. `changed` = modified+deleted+added(If), added(expand, 상속 문서는 total에 포함). `total` = 원본 설정 문서 수, 0이면 근접도 1.
- `decay` 제안 0.85 (깊이 1 → 0.85, 깊이 3 → 0.61). 본가지 = 1.
- 굵기 = 근접도 0.2~1.0을 1~6px 선형 매핑(제안). 파생 규모(하위 가지 수)를 더하는 항은 플랜에서 결정.
- 열매 크기 = 0~1 지표를 14~44px 매핑(제안). 선형은 한 작품이 최댓값을 독점하면 나머지가 작아지므로 **백분위(percent_rank) 또는 log 변환**을 권장. 어느 쪽이든 **세계관 내부가 아니라 전체 게시 작품 기준**으로 정규화해야 세계관끼리 크기가 비교된다(정규화 범위 열린 질문 8).

---

## 4. Next.js 16.3.2 주의점 (저장소 `node_modules/next/dist/docs` 확인)

- `package.json`의 `next` 버전 16.3.2. `next.config.ts`에 `cacheComponents`가 **설정되어 있지 않다** → 기본 동적 렌더링. 세계수 데이터를 `use cache`로 감쌀 필요 없음. 캐시가 필요해지면 `use cache` 대신 **`revalidateTag(tag, 'max')`** 2번째 인자 형태를 쓴다(docs `09-revalidating.md`). 1인자 호출은 금지.
- 연표 저장 직후 세계수 갱신(UI 계약 "연표 저장 → 열매 위치 갱신")은 서버 액션에서 **`updateTag(tag)`** 로 읽기 자기 일관성을 확보하는 방식이 docs 예시다(`09-revalidating.md` 135행 부근). 적용 시 실제 타입 체크로 확인 필요.
- 페이지 params·searchParams는 Promise → `await` 필수(docs `03-layouts-and-pages.md`). 세계수 라우트 `app/works/[workId]/...`와 `app/studio/[workId]/...`에서 적용.
- 요청 가로채기는 `proxy.ts`(`middleware.ts` 아님)다. 이 phase에서 라우트 가드를 추가하면 `proxy.ts`에 둔다. 현재 프로젝트는 `proxy.ts`를 이미 쓴다(`01-foundation` 기록).
- 상호작용 트리는 `'use client'` 리프에만 두고 데이터는 서버 컴포넌트에서 RPC로 받는다. 큰 projection을 클라이언트 번들에 넣지 않는다.
- AGENTS.md 지시대로 Next 16 docs를 확인했다. 이 문서에서 언급한 API는 모두 로컬 docs로 대조했다.

---

## 5. 구현 순서가 드러내는 의존성 (plan 입력)

1. Phase 3 보완: 4탭 셸(세계관 탭 자리).
2. Phase 2 재개분: 읽기 전용 템플릿 정책(확장 가지 상속 가드의 기준).
3. DB 마이그레이션: 4테이블 + `kb_nodes.inherited_from_node_id` + 트리거 3종(삭제 가드, 확장 가드, 확정 후 쓰기 차단) + draft 플래그 + `works_public_read` 조정.
4. 순수 함수: 레이아웃, 근접도, 크기, 어댑터 (단위 테스트 먼저).
5. 작가 측: 연표 편집(데스크톱) → 가지 치기 5단계 → 공개 토글.
6. 독자 측: reader RPC → 세계수 보기(데스크톱·모바일) → 목록 보기 → 단독 화면.

---

## 위험 (Risks)

| # | 위험 | 영향 | 완화 |
|---|------|------|------|
| 1 | `works_public_read`가 `deleted_at is null`인 모든 작품을 공개함. 초안 작품 id가 URL로 노출 | 작성 중 설정집 작품 존재가 샐 수 있음(본문은 kb RLS로 보호되지만 제목·id 노출) | 초안 플래그를 두고 `works_public_read` 정책을 교체(`not is_branch_draft`). 정책 교체는 additive OR 구조를 깨지 않는지 확인 필요 |
| 2 | 소프트 삭제가 FK restrict를 우회 | WTREE-10 위반: 하위 가지 있는 가지가 삭제되어 고아 발생 | `before update` 트리거로 자식 존재 검사 (기존 `guard_locked_kb_node` 패턴) |
| 3 | 확장 가지 상속 문서가 기존 편집 경로로 수정됨 | WTREE-04 위반 (기존 설정 수정 불가) | `inherited_from_node_id` + content·name·delete 트리거 가드. `is_locked`로는 content를 못 막음 |
| 4 | 작가 본인 조회가 열매 지표에 섞임 | WTREE-08 규칙 위반, 작가 부풀리기 | 조회 기록 테이블 또는 increment RPC의 owner 스킵(prospective). 과거 누적은 소급 불가 |
| 5 | reader RPC가 설정 본문·문서명을 반환 | 스포일러·설정 유출 (WTREE-09 연기 상태라 특히 위험) | 반환 필드 화이트리스트, 문서명 대신 변경 수만 |
| 6 | 확정 RPC가 클라이언트 건수를 신뢰 | 0건 가지 확정 가능 | 서버에서 원본과 draft를 diff해 재계산 |
| 7 | 원본 수정과 복제 사이 레이스 | 스냅샷이 원본과 어긋남 | 확정 RPC에서 원본 행을 `for share`로 잠그거나 `updated_at` 기준 검증 (`0005`/`0009`의 락 패턴 참고) |
| 8 | 숨김 가지의 하위 가지 처리 규칙 불일치 | 고아 선 또는 잘못된 부모 연결 | 열린 질문 2의 결정 전까지 재부착 로직을 프로젝션에만 둔다 |
| 9 | 열매 지표 과대평가 (조회 중복) | 크기 어뷰징 | 한계를 UI "산식은 임시안" 칩과 문서에 명시. 완독 데이터 phase에서 교체 |
| 10 | `listFeed`식 전체 로드를 세계수에 복붙 | 작품 수 증가 시 느려짐 | 세계관 단위 `work_id in (...)` 배치 조회만 사용 |
| 11 | 세계관 탭 선행 미완 | 독자 진입점 없음 | 플랜 순서에서 Phase 3 보완을 선행으로 강제 |

---

## 열린 질문 (사용자 결정 또는 플랜 확정 필요)

1. **연결 공개 토글의 단위.** UI-SPEC §5는 "가지 치기 4단계와 세계관 공개 설정에서 토글"이라고 적는다. 가지별인지 세계관 단위인지 불분명하다. 권장: 데이터는 두 레벨(세계관 루트 플래그 + 가지별 플래그), 독자 가시성 = 둘 다 공개. 세계관 루트를 끄면 모든 잔가지가 숨겨지는데, 규칙 17("비공개 전환은 하위에 전파하지 않는다")과 충돌하는지 사용자 확인 필요. (규칙 17은 가지 계층 안에서의 전파 금지로 읽는다.)
2. **숨긴 가지의 하위 가지.** 규칙 17은 하위에 전파하지 않는다고 했으므로 하위는 보인다. 그러면 하위는 가장 가까운 보이는 조상에 붙여야 하는가? 권장: 재부착 + 연결선은 조상 쪽에서 시작. 사용자 확인 필요.
3. **숨긴 가지 작품의 피드·직접 URL 노출.** 연결 공개는 "세계수에서만 숨김"인지 "작품 자체 숨김"인지. 권장: 세계수에서만 숨긴다(작품 공개 규칙은 기존과 같음). 확인 필요.
4. **작가 본인 조회 제외 구현 방식.** (a) increment RPC에서 `auth.uid() = owner`면 스킵(간단, 과거 누적 미해결), (b) 조회 기록 테이블(정확, 쓰기 비용 증가), (c) 집계 기준일 리셋. 권장: (a) + 기준일 명시. 비용·정확도 결정 필요.
5. **초안 작품의 작성 중 노출 방식.** draft 플래그 + `works_public_read` 교체(권장)가 맞는지, 또는 초안을 별도 테이블로 빼고 에디터를 재작성할지.
6. **원본 변경 알림 채널.** 프로젝트에 `notifications` 테이블이 없다(마이그레이션 검색 결과 없음). 알림을 이 phase에서 최소 구현할지(행 기록 + 세계수 배너) 아니면 알림 phase로 넘길지.
7. **연표 상속 방식.** 분기 시점 구간을 복사(권장, 스냅샷 원칙과 일치) 또는 본가지 행 참조(본가지 연표 수정이 잔가지 이어받은 구간에 전파). 확정 필요.
8. **열매 크기 정규화 범위.** 전체 게시 작품 기준(권장, 세계관끼리 비교 가능) 또는 세계관 내부 기준(작은 세계관에서 과장됨).
9. **독자에게 변경 문서 이름 노출 여부.** 권장: 이 phase에서는 개수만. 이름은 WTREE-09·READ-06 이후.
10. **Supabase Postgres 버전.** `supabase/config.toml`에 `major_version`이 없어 확인 불가. 재귀 CTE의 `CYCLE` 절 사용 여부와 연관. 권장: 재귀를 피하므로 영향 낮음. LOW 신뢰.

---

## 검증 아키텍처 (nyquist_validation 활성)

| 항목 | 값 |
|------|-----|
| Framework | Vitest 4.x (`package.json`: `vitest`, script `test: vitest run`) |
| 기존 패턴 | `tests/payments/`, `tests/kb/`, `tests/discovery/`, `tests/migrations/` 존재 |
| Quick run | `npx vitest run tests/world-tree` |
| Full suite | `npm test` |

### 요구사항 → 테스트 맵

| Req | 행동 | 유형 | 자동 명령 | 파일 |
|-----|------|------|-----------|------|
| WTREE-01 | 구간 순서, 연도 선택, 동시 진행 위·아래 배치 | unit | `vitest run tests/world-tree/layout.test.ts` | ❌ Wave 0 |
| WTREE-02 | 잔가지 구간 이어받기 (복사본 잠금) | integration | `vitest run tests/migrations/world-tree-eras.test.ts` | ❌ Wave 0 |
| WTREE-03 | 변경 0건 확정 거부 (서버) | integration | `vitest run tests/world-tree/confirm.test.ts` | ❌ Wave 0 |
| WTREE-04 | 확장 가지 상속 문서 수정·삭제 거부 | integration (트리거) | `vitest run tests/migrations/world-tree-guards.test.ts` | ❌ Wave 0 |
| WTREE-05 | 원본 변경 시 알림 행 생성 | integration | 같은 파일 | ❌ Wave 0 |
| WTREE-06 | 투영 결과 시간순·종류·선택 상세 필드 | unit | `vitest run tests/world-tree/projection.test.ts` | ❌ Wave 0 |
| WTREE-07 | 독자 RPC에서 비공개 가지 숨김, 작가 전체 | integration | `vitest run tests/world-tree/visibility.test.ts` | ❌ Wave 0 |
| WTREE-08 | 근접도·크기 산식, 작가 본인 조회 제외 | unit + integration | `vitest run tests/world-tree/metrics.test.ts` | ❌ Wave 0 |
| WTREE-10 | 하위 가지 있으면 소프트 삭제 거부, 비공개 비전파 | integration | `vitest run tests/migrations/world-tree-guards.test.ts` | ❌ Wave 0 |

**Sampling:** 커밋마다 해당 파일 quick run, phase 게이트에서 `npm test` 전체 green. 레이아웃·산식은 순수 함수라 밀리초 단위.
**Wave 0 gaps:** `tests/world-tree/` 디렉터리와 공유 fixture(연표 3구간·가지 2단계 샘플), DB 테스트용 픽스처는 기존 `tests/migrations` 패턴을 따른다. 샘플 데이터는 UI-SPEC의 가짜 이름을 쓰지 않고 테스트 전용 값을 쓴다.
**Manual-only:** 모바일 가로 스크롤 감촉, 다크 모드 대비, 스크린리더 읽기 순서는 수동 확인 항목으로 둔다(근거: 자동화 비용 대비 효과 낮음, 미검증).

---

## 출처 (Sources)

**Primary (HIGH: 저장소 파일 직접 확인)**
- `.planning/phases/18-world-tree/18-CONTEXT.md` — 확정 결정 3건
- `.planning/phases/18-world-tree/18-UI-SPEC.md` — 화면·상태·카피·Open Items
- `.planning/design/WORLD-TREE.md` — 규칙 1~21
- `.planning/REQUIREMENTS.md` 146~158행 — WTREE-01~13 정의
- `.planning/ROADMAP.md` 469~482행 — Phase 18 절
- `lib/discovery/actions.ts` — 현행 지표 공식과 전체 정규화
- `lib/reader/views.ts` — 조회 카운트 규칙(작가 본인 미제외)
- `lib/kb/tree.ts`, `lib/kb/actions.ts`(MAX_FOLDER_DEPTH), `lib/kb/folder-copy.ts`
- `supabase/migrations/0002_studio.sql`(kb_nodes·works·RLS·guard 트리거), `0003_reader.sql`(works_public_read, RPC 패턴), `0009_blind_access.sql`(투영·블라인드 패턴), `0012_template_category_folders.sql`
- `app/works/[workId]/page.tsx` — 현재 3탭 확인
- `package.json`, `next.config.ts`(cacheComponents 미설정)
- `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`, `09-revalidating.md`, `03-layouts-and-pages.md`

**Secondary (MEDIUM: 레지스트리 조회)**
- npm 레지스트리 `npm view` — d3-hierarchy 3.1.2, d3-shape 3.2.0, @xyflow/react 12.12.0, elkjs 0.12.0, dagre 0.8.5 (버전·갱신일만 확인, 번들 크기는 미확인)

**Tertiary (LOW: 미검증)**
- 권장 성능 임계값(300/1000 노드), 감쇠 계수 0.85, 굵기·크기 픽셀 범위는 제안치이며 실측 전 검증 필요
- Supabase Postgres 버전 및 CYCLE 절 지원 여부

## Metadata

**Confidence breakdown:**
- 렌더링 방식: HIGH (구조 근거는 UI-SPEC과 레이아웃 규칙에서 직접 도출, 라이브러리 비교는 버전 확인)
- DB 모델·RLS: MEDIUM (기존 패턴과 일치, 실제 마이그레이션 실행 검증 전)
- 지표 어댑터: HIGH (현행 코드 확인), 계수는 LOW (임시안)
- Next 16 주의점: HIGH (로컬 docs 대조)
- 성능 임계값·번들 크기: LOW (미측정)

**Research date:** 2026-10-12
**Valid until:** 2026-11-11 (30일, 안정 스택) — 단, Phase 3 보완·Phase 2 재개 진행에 따라 기존 파일 상태가 바뀌면 재확인 필요

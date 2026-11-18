---
phase: 23
slug: reader-ranking-list
status: checker-verified
created: 2026-11-18
shadcn_initialized: true
preset: base-nova / neutral base / indigo primary (existing components.json, unchanged)
mockups: .planning/design/mockups/project/Ranking.dc.html (보드 7), RankingMobile.dc.html (보드 8), EmptyStates.dc.html (보드 16), 후속 참고 HallOfFame.dc.html
requirements: RANK-01~04 (후보, REQUIREMENTS 반영은 총괄 세션)
---

# Phase 23 — UI Design Contract

> 독자용 랭킹 목록(`/ranking`)의 화면 계약. 목업의 작품명·수치는 가짜 데이터이며 구조·규칙만 계약이다.
> 디자인 시스템·토큰·타이포·간격·색은 **Phase 21 UI-SPEC(approved)을 그대로 상속**한다. 이 문서는 달라지는 부분과 랭킹 전용 규칙만 적는다. 상속 항목을 바꾸지 않는다.
> **status: draft** — `gsd-ui-checker` 검증 전. 마이그레이션 번호·RPC/스냅샷 테이블 형태는 plan에서 확정한다(UI는 `total`과 순서가 있는 앞 N건만 요구).
> `태그검색` 칩은 만들지 않는다(Phase 27). 명예의 전당은 안내 셸만이다(리뷰 phase 전까지).

---

## 화면 목록

| # | 화면 | 사용자 | 진입 | 목업 |
|---|------|--------|------|------|
| 1 | 랭킹 목록 — 주간 랭킹 (데스크톱, 자동 열 그리드) | 독자·비로그인 포함 | 헤더 `랭킹` 탭, 서브 행 `주간 랭킹`, 홈 `더보기 ›` | 7 |
| 2 | 랭킹 목록 (모바일, 3열 그리드) | 독자 | 위와 동일 | 8 |
| 3 | 서브 행 `루키 쿼터존` | 독자 | 서브 행, 홈 루키 `더보기 ›` | 7 구조 + 16 빈 상태 |
| 4 | 서브 행 `완결작` | 독자 | 서브 행 | 7 구조 |
| 5 | 서브 행 `명예의 전당` (준비 안내 셸) | 독자 | 서브 행, 홈 명예의 전당 `더보기 ›` | 신규 최소 UI(목업 없음, 5절) |
| 6 | 빈 상태 / 스냅샷 없음 / 로딩 / 오류 | 독자 | 필터 결과 0건, 첫 집계 전, 조회 중, 실패 | 16 |

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (initialized, unchanged) |
| Preset | `base-nova`, baseColor `neutral`, indigo primary — 새 레지스트리 없음 |
| Component library | base-ui (`render` prop 규칙 유지) |
| Icon library | lucide-react (빈 상태 아이콘: 데이터 없음 `Trophy`, 루키 `Sparkles`, 오류 `TriangleAlert`, 명예의 전당 `Award`; 모두 `aria-hidden`, 24px) |
| 재사용(설치됨) | `Button`, `Badge`, `Select`, `Separator` |
| 신규 shadcn 추가 | 없음 |
| 재사용 도메인 컴포넌트 | `SeriesCard`(`overlay`·`corner`·`footer`), `WorkGrid`, `ListFilterBar`(확장 필요, 6절) |
| 신규 도메인 컴포넌트 | `RankBadge`(순위 숫자 overlay), `RatioBadge`(연독률 corner), `RankingPage` 조립부, `RankingEmpty`(빈 상태 4종), `HallOfFameShell` |
| 기존 컴포넌트 처리 | 홈 `FeedCard`·`FeedFilters` 수정 없음. 21 전용(가격 문구·NEW/완결 라벨·연재 목록 서브 행 라우팅)은 쓰지 않는다 |

---

## Spacing / Typography / Color (21 상속, 랭킹 적용만)

**간격**: 4·8·16·24·32·48만. 컨테이너 `max-w-6xl`, 좌우 16px, 상단 24px, 하단 48px, 블록 간 24px. 데스크톱 그리드 `repeat(auto-fill, minmax(180px, 1fr))` gap 16px, 모바일(<640px) `repeat(3, minmax(0,1fr))` 열 gap 8px·행 gap 16px·좌우 패딩 8px. 칩·셀렉트·버튼 히트 영역 최소 44px.

**글자 크기 정확히 4개: 11 / 12 / 14 / 18px. 굵기 정확히 2개: 400 / 600.** 본문 line-height 1.5, 제목 1.2. 목업의 22·13·15px는 쓰지 않는다.

| 랭킹 요소 | 크기·굵기 |
|-----------|-----------|
| `h1` 서브 행 제목 | 18px / 600 |
| 설명·기준일 줄·정렬 안내·100위 안내·모바일 카드 제목·칩 | 12px |
| 데스크톱 카드 제목·셀렉트·버튼·빈 상태 본문 | 14px (제목 600) |
| 순위 숫자(데스크톱) | 14px / 600 |
| 순위 숫자(모바일) | 12px / 600 |
| 연독률 배지 | 11px / 600 |
| 모바일 카드 보조 줄 | 11px |

**색**: 60% `--background` / 30% `--card`·`--secondary` / 10% indigo primary. 랭킹 목록에서 **accent는 21 목록(활성 메인 탭·서브 행 항목·포커스 링)에만** 쓴다. 가격 문구가 없으므로 `text-primary` 가격 용도는 없다. 새 accent 용도를 만들지 않는다.

- 순위 숫자: `--foreground` 배경 + `--background` 글자, **불투명**(목업의 `rgba(0,0,0,.6)` 반투명 폐기, 표지 위 4.5:1 이상 보장).
- 연독률 배지: 같은 `--foreground` 배경 + `--background` 글자, 불투명 pill. 순위 숫자와 같은 색이라 시각 무게가 비슷하지만 위치(좌상단 vs 우상단)와 글자(`1`~`100` vs `연독률 N%`)로 구분된다.
- 1~3위도 색 강조 없이 같은 스타일(accent 예약 규칙 유지, 순위는 텍스트로 전달).
- destructive 색 없음(파괴적 액션 없음). 오류 문구는 `--foreground` + 보더.
- 다크 모드는 토큰 자동 반전, 순위 숫자·배지 대비만 확인.

---

## 1. 헤더 · 라우팅 (RANK-01)

- 경로 `/ranking` 한 주소. `getHeaderVariant('/ranking')` → **`reader`**(2단). `getActiveMainTab('/ranking')` → **`ranking`**(현재는 `/series/*` 외에 모두 `free` 폴백이라 수정 필요, plan 포함). 활성 메인 탭 `aria-current="page"`.
- `READER_MAIN_TABS`의 `ranking` 탭 `href: null` → `/ranking`. `내서재`는 건드리지 않는다.
- 서브 행 4개 `href` 연결(`href: null`의 "준비 중" 스타일 4개 사라짐). 현재 `주간 랭킹`의 `/#weekly-ranking` 앵커는 `/ranking`으로 교체한다.

| 항목 | key | href | 유지 쿼리 |
|------|-----|------|-----------|
| 주간 랭킹 | `weekly` | `/ranking` | `genre`, `period` |
| 루키 쿼터존 | `rookie` | `/ranking?sub=rookie` | `genre`, `period` |
| 명예의 전당 | `hall` | `/ranking?sub=hall` | 없음(필터 없는 셸) |
| 완결작 | `ranking-completed` | `/ranking?sub=completed` | `genre`, `period` |

- 서브 행 이동은 `sort`·`page`·`status`를 제거한다(서브 행마다 정렬 기본값은 같지만 목록이 달라 처음부터 보여준다). `buildSubRowHref`는 지금 `genre`만 유지하므로 랭킹용으로 `period`도 유지하도록 확장하거나 랭킹 전용 함수 `buildRankingSubHref`를 둔다(plan 선택, 단 21의 연재 목록 동작은 바꾸지 않는다).
- `ReaderSeriesSubKey`는 연재 목록용이라 랭킹 서브 키 타입 `RankingSubKey = 'weekly'|'rookie'|'hall'|'completed'`를 새로 두고 `getRankingSubKey(subParam)`(알 수 없는 값 → `weekly`)로 활성 항목을 도출한다. 서브 행 접근성은 21과 동일(`<nav aria-label="서브 구분">`, `Link`, 최소 높이 44px, 가로 스크롤, 포커스 시 `scrollIntoView`).
- **홈 연결**: 홈 `app/page.tsx`의 `주간 랭킹`·`루키 쿼터존`·`명예의 전당` 섹션 제목 옆에 `더보기 ›` 링크(12px/600, `text-muted-foreground`, hover `text-foreground`, 히트 영역 44px, `aria-label="주간 랭킹 더보기"` 등 섹션명 포함)를 둔다. 목적지: `/ranking`, `/ranking?sub=rookie`, `/ranking?sub=hall`. 홈 슬라이더 자체와 `FeedCard`는 그대로 둔다(주간 랭킹 슬라이더를 스냅샷으로 바꿀지는 plan 판단, UI 계약 영향 없음).

---

## 2. 화면 구성 (위→아래, 서브 행 `hall` 제외 공통)

1. **제목 블록**: `h1`(서브 행 제목) 18px/600 + 12px 설명(3절 카피 표).
2. **기준 안내 두 줄**(12px, `--muted-foreground`): 
   - 줄 1(고정): `클릭이 아니라 끝까지 읽은 비율(완독률)과 다음 화로 이어진 비율(연독률)로 줄 세웠어요. 매주 월요일 갱신돼요.` (모든 서브 행·기간 공통. 서브 행 설명과 중복되면 서브 행 설명 뒤에 이어 붙이지 않고 이 줄을 설명 자리에 쓴다. 3절 표 참조)
   - 줄 2(기간별 기준일, 스냅샷이 있을 때만): 3절 `기준일 줄` 표.
3. **필터 바**(`ListFilterBar` 확장): 좌측 장르 칩 가로 스크롤 줄(`태그검색` 없음), 우측 `정렬`·`기간`·`연재` 셀렉트 3개. 모바일(<640px)은 두 줄(칩 줄 / 셀렉트 줄)로 접히고 셀렉트 3개는 한 줄에 `flex-1`로 균등(각 44px 이상). 셀렉트 폭이 모자라면 줄바꿈 대신 가로 스크롤하지 않고 두 줄로 내린다.
4. **정렬 안내 한 줄**(12px muted): 현재 `sort` 설명(3절).
5. **그리드**(`WorkGrid`, `ul/li` — 순서 의미는 순위 숫자 텍스트로 전달): `SeriesCard` N개, 기본 24개.
6. **더보기 버튼**(그리드 아래 중앙) 또는 **100위 안내**(4절).
7. 결과 건수 `aria-live="polite"` sr-only `작품 {n}개`(기존 `WorkGrid`가 처리).

`hall` 서브 행은 필터 바·그리드 없이 제목 블록 + 5절 셸만 둔다.

### 장르 칩
21과 동일: `전체` + `GENRES`(기존 소스), 단일 선택, `button aria-pressed`, 화살표/Home/End 이동, 활성은 `--foreground` 반전. `태그검색` 칩은 만들지 않는다. 선택 시 `genre` 설정·`page` 제거.

### 정렬 셀렉트 (`sort`, `aria-label="정렬"`)
| 옵션 라벨 | `sort` 값 | 기본 |
|-----------|-----------|------|
| 종합순 | `overall` | 예(URL 생략) |
| 완독률순 | `completion` | |
| 연독률순 | `continuation` | |

동점 처리: 선택한 정렬 지표 내림차순 → 도달 독자 수 내림차순 → 작품 id(결정적 순서). 서브 행이 바뀌어도 기본 정렬은 `종합순`으로 같다.

### 기간 셀렉트 (`period`, `aria-label="기간"`)
| 옵션 라벨 | `period` 값 | 기본 |
|-----------|-------------|------|
| 주간 | `weekly` | 예(URL 생략) |
| 월간 | `monthly` | |
| 전체 | `all` | |

세 서브 행(`weekly`·`rookie`·`completed`) 모두 노출한다. 기간 변경 시 `page`를 제거한다. `sort`는 유지한다.

### 연재 셀렉트 (`status`, `aria-label="연재"`)
| 옵션 라벨 | `status` 값 | 비고 |
|-----------|-------------|------|
| 연재 전체 | `all` | 기본(URL 생략) |
| 연재중 | `ongoing` | `serial_status = 'ongoing'` |
| 완결만 | `completed` | `serial_status = 'completed'` |

- 서브 행 `완결작`에서는 값이 **`완결만`으로 고정**: 셀렉트는 `disabled`(+`aria-disabled`, 표시값 `완결만`)이며 URL의 `status`는 무시한다. 포커스 이동은 건너뛰되 스크린리더에는 읽힌다. 다른 서브 행에서는 자유 선택.
- 21과 달리 이 셀렉트는 서브 행(`sub`)과 **동기화하지 않는다**(독립 쿼리 `status`). 변경 시 `page`만 제거하고 `sort`는 유지한다(21의 "status 변경 시 sort 제거" 동작을 쓰지 않는다).

---

## 3. 서브 행별 화면과 카피

| 서브 행 | `h1` | 설명(12px) | 집합 규칙(D-) | 기간 셀렉트 | 연재 셀렉트 |
|---------|------|------------|---------------|-------------|-------------|
| `weekly` | `주간 랭킹` | `클릭이 아니라 끝까지 읽은 비율(완독률)과 다음 화로 이어진 비율(연독률)로 줄 세웠어요. 매주 월요일 갱신돼요.` | 전체 작품 (D-10) | 선택 가능, 기본 주간 | 선택 가능 |
| `rookie` | `루키 쿼터존` | `10화 또는 5만 자 이상 연재하고 시작한 지 90일 이내인 신작만 모았어요. 같은 기준으로 매주 월요일 갱신돼요.` | 공개 회차 10화 이상 또는 5만 자 이상 + 첫 공개 회차 `published_at` 90일 이내 (D-11, 상수 둘 한 곳) | 선택 가능 | 선택 가능 |
| `hall` | `명예의 전당` | 5절 셸 | — (D-12) | 없음 | 없음 |
| `completed` | `완결작` | `완결된 작품을 같은 기준으로 줄 세웠어요. 매주 월요일 갱신돼요.` | `serial_status = 'completed'` (D-13) | 선택 가능 | `완결만` 고정·비활성 |

설명 문구의 `90일`·`10화`·`5만 자`는 상수에서 가져온다(값 바뀌면 카피가 함께 바뀌도록 정렬 키 정의 옆에 둔다).

### 기준일 줄(스냅샷이 있을 때, 12px muted, 스냅샷 `period_start`·`period_end`에서 생성)
| 기간 | 문구 예시 |
|------|-----------|
| 주간 | `지난주(11.10 ~ 11.16) 기준` |
| 월간 | `지난달(10월) 기준` |
| 전체 | `전체 누적 · 11.17 기준` |

날짜는 KST. 연도는 쓰지 않는다(올해가 아닐 때만 `2025.12.29 ~ 2026.01.04` 형식으로 연도 포함).

### 표본 안내(고정, 12px muted, 기준일 줄 뒤에 붙임)
`도달 독자가 5명 미만인 작품은 순위에 넣지 않아요.` (임계 5는 26의 상수에서 가져옴)

### 정렬 안내
| `sort` | 문구 |
|--------|------|
| `overall` | `완독률과 연독률을 함께 반영한 순서예요.` |
| `completion` | `끝까지 읽은 독자 비율이 높은 순서예요.` |
| `continuation` | `다음 화로 이어서 읽은 독자 비율이 높은 순서예요.` |

---

## 4. 카드 구조와 더보기·100위 상한

### 카드 (`SeriesCard` 재사용, 표시 전용 계약 유지)
```
[표지 3:4]  좌상단 overlay : RankBadge  (순위 숫자 1~100)
            우상단 corner  : RatioBadge (연독률 N%)  ← 표본 부족 시 렌더하지 않음
제목 (2줄 clamp)
작가 필명
장르 Badge · {n}화 Badge
footer : 완독률 N% (12px, --muted-foreground)  ← 데스크톱만, null이면 숨김
```
- `overlay`가 있으므로 21의 `badge`(NEW/완결)는 그리지 않는다(SeriesCard 계약). `priceLabel`도 생략.
- **RankBadge**: 표지 좌상단 모서리에 붙는 사각 라벨(좌상단 0 오프셋, 우하단만 `rounded-br-lg`). 데스크톱 `min-width 28px, height 28px`(4 배수 토큰 대신 시각 라벨 크기이며 히트 영역 아님), 가로 패딩 8px, 14px/600, `tabular-nums`. 모바일 `min-width 24px, height 24px`, 가로 패딩 4px, 12px/600. 세 자리(`100`)도 잘리지 않도록 `min-width`만 쓰고 `width`는 고정하지 않는다.
- **RatioBadge**: 표지 우상단 `top 8px, right 8px`(모바일 4px), pill, 11px/600, 글자 `연독률 {N}%`. N은 정수 반올림(`Math.round`), `0~100`. **연독률이 `null`(도달 독자 5명 미만)이면 컴포넌트를 렌더하지 않는다.** 표본 부족 작품은 어차피 순위에서 제외(D-04)되므로 방어적 처리다.
- 완독률 문구(footer): `완독률 {N}%` — `null`이면 숨김. 모바일 3열에서는 footer를 그리지 않는다(공간 부족, 정렬 `완독률순` 설명은 상단 안내로 대신함).
- 모바일 3열(`size="compact"`): 21과 같은 레이아웃(테두리 없는 카드, 제목 12px/600 2줄, 보조 11px `장르 · n화`, 작가 11px 한 줄). 순위 숫자·배지는 표지 위에 겹친다.
- 표지 없음: 회색 배경 + `표지 없음` 12px(21과 동일). `alt`는 작품 제목, 상위 6개 eager.
- `href`: `/works/{id}`. 카드 한 장이 탭 정지 하나.

### 더보기 · 100위 상한 (D-15)
- 한 번에 24개, `page`는 **누적 페이지 수**(21과 같은 방식): `page=2` → 앞 48개를 서버 렌더. `더보기` 클릭 → `page+1`로 `router.push(..., { scroll: false })`, 새 24개가 이어 붙는다.
- 표시 상한은 **100위**: `page=5`이면 100개(24·4+4)에서 멈춘다. `page`가 상한을 넘으면 마지막 가능 페이지(5)로 보정한다. 앞 항목의 순위 숫자는 페이지가 늘어도 변하지 않는다(순위 = 정렬 순서 1부터).
- 스냅샷에 100개 미만이면 있는 만큼만 보이고 `더보기`는 `전체 건수 > 표시 수`일 때만 노출한다.
- 100위까지 모두 보여준 뒤(스냅샷이 100개 이상일 때)에는 `더보기`를 숨기고 그리드 아래에 12px muted 문구 `순위는 100위까지 보여요.`를 중앙 정렬로 둔다. 100위 미만에서 끝나면 문구 없이 버튼만 사라진다.
- `더보기` 버튼: 글자 `더보기`, `aria-label="작품 더 보기"`, 클릭 중 `불러오는 중…`+`disabled`, 완료 알림 `작품 {n}개 더 불러왔어요`, 새로 추가된 첫 카드로 포커스(21 규칙 그대로).
- `total`(sr-only `작품 {n}개`)은 100으로 상한 처리한 값을 쓴다.

---

## 5. 명예의 전당 준비 셸 (D-12)

- `sub=hall`: 필터 바·그리드 없음. `h1` `명예의 전당` + 12px 설명 `독자 리뷰에서 뽑은 우수 리뷰를 모아 보여줄 곳이에요.`
- 본문: 중앙 안내 카드(WorkGrid 빈 상태와 같은 시각 구성: 보더 + `--card` 배경, 패딩 48px/16px, 중앙 정렬, gap 8px).
  - 아이콘 `Award` 24px(`aria-hidden`)
  - 제목(18px/600): `명예의 전당을 준비하고 있어요`
  - 본문(14px/400): `리뷰가 모이면 우수 리뷰를 여기에서 소개할게요. 지금은 랭킹에서 인기 작품을 만나 보세요.`
  - 버튼(`Button` outline, 44px): `랭킹 보기` → `/ranking`
- `hall`에서는 `genre`·`sort`·`period`·`status`·`page` 쿼리를 모두 무시한다. 서브 행 `명예의 전당` 활성(`aria-current="page"`).
- 홈 명예의 전당 `더보기 ›`도 여기로 온다.

---

## 6. 컴포넌트 변경 사항 (재사용 경계 확장)

### `ListFilterBar` 확장 (21의 동작 유지, 모두 선택 prop)
| 추가 prop | 타입 | 설명 |
|-----------|------|------|
| `periodOptions` | `{ value; label }[] \| undefined` | 있으면 `기간` 셀렉트를 정렬 셀렉트 뒤·연재 셀렉트 앞에 그린다. `paramNames.period`(기본 `period`), `defaults.period` |
| `statusAriaLabel` | `string` | 연재 셀렉트 `aria-label`(기본 `상태`, 랭킹은 `연재`) |
| `statusLocked` | `string \| undefined` | 값이 있으면 연재 셀렉트를 그 값으로 고정·`disabled`, URL의 `status`는 무시 |
| `statusResetsSort` | `boolean` | 기본 `true`(21 그대로). 랭킹은 `false` — 연재 셀렉트 변경이 `sort`를 지우지 않는다 |

- `resetKeys`는 `['page']`(기본)면 충분하다. 장르·정렬·기간·연재 모두 변경 시 `page`를 제거한다.
- 셀렉트 표시 순서(좌→우): `정렬`, `기간`, `연재`.
- 현재 구현은 `status` 변경 시 `sort`를 무조건 삭제하므로 위 `statusResetsSort`로 분기해야 한다(랭킹에서 `연독률순`을 고른 뒤 연재를 바꿔도 정렬이 유지돼야 함).

### `WorkGrid`
- 기본 빈 상태 문구와 `필터 초기화` 버튼(링크 문구 고정)을 그대로 쓸 수 있는 경우: 필터 결과 0건. 서브별 빈 상태는 `emptyState`로 ReactNode(`RankingEmpty`)를 넘긴다(자체 CTA를 포함하므로 `resetHref`는 필터 결과 0건에서만 넘긴다).
- `loadMoreHref`: `page+1`, 100위 상한이면 `null`.

### `SeriesCard`
- 변경 없음. `overlay`(RankBadge), `corner`(RatioBadge), `footer`(완독률)만 사용.

### 사용 범위
| 컴포넌트 | 21 | 23 랭킹 |
|----------|----|---------|
| `SeriesCard` | `badge`+`priceLabel` | `overlay`+`corner`+`footer` |
| `WorkGrid` | 전부 | 전부 |
| `ListFilterBar` | 장르+정렬+상태 | 장르+정렬+기간+연재 |

---

## 7. 상태

| 상태 | 처리 |
|------|------|
| 로딩(초기) | 그리드 형태 스켈레톤 12개(표지 3:4 + 텍스트 3줄 막대, 표지 좌상단 순위 칸 막대). `aria-busy="true"`. `prefers-reduced-motion`이면 pulse 끔 |
| 로딩(더보기) | 기존 카드 유지, 버튼만 `불러오는 중…` |
| 스냅샷 없음(해당 기간·서브 행의 스냅샷 자체가 없거나 집합이 비어 있고 필터가 하나도 없음) | 중앙 카드: 아이콘 `Trophy`, 제목 `아직 집계된 순위가 없어요`, 본문 `순위는 매주 월요일에 집계돼요. 조금만 기다려 주세요.`. CTA 없음. 기준일 줄은 숨김 |
| 필터 결과 0건(장르·연재 등 조건 때문에 0건) | 기본 `WorkGrid` 빈 상태 + 문구 교정: 제목 `조건에 맞는 작품이 없어요`, 본문 `장르나 연재 조건을 바꿔 보세요.`, 버튼 `필터 초기화` → `/ranking?sub=…`(현재 서브 행 유지, `genre`·`sort`·`status`·`period`·`page` 제거). 포커스는 장르 칩 `전체`로 이동 |
| 루키 구역 비었음(`rookie`, 필터 없이도 0건) | 구역을 숨기지 않는다. 아이콘 `Sparkles`, 제목 `지금은 루키 작품이 없어요`, 본문 `10화 이상 연재한 신작이 올라오면 여기에 나타나요.`, 버튼 `주간 랭킹 보기` → `/ranking` (16번 보드 문구에서 `이번 주`를 `지금`으로 교정: 지난주 기준 집계이기 때문) |
| 완결작 비었음(`completed`, 필터 없이도 0건) | 아이콘 `Trophy`, 제목 `순위에 오른 완결작이 아직 없어요`, 본문 `완결 처리된 작품이 순위 기준을 채우면 여기에 나타나요.`, 버튼 `주간 랭킹 보기` → `/ranking` |
| 오류 | 중앙 카드 `role="alert"`: 아이콘 `TriangleAlert`, 제목 `순위를 불러오지 못했어요`, 본문 `잠시 후 다시 시도해 주세요.`, 버튼 `다시 불러오기`(재조회). 필터 바 유지 |
| 비로그인 | 동일하게 열람 가능(공개 데이터). 개인화 표시 없음 |

판별 규칙(plan에 위임, UI 계약): "필터 없음" = `genre`·`status`가 기본값이고 (`rookie`/`completed`가 아닌) 서브 행에서 `total=0`이면 `스냅샷 없음`, `rookie`·`completed`에서는 해당 서브 행 빈 상태가 우선한다. 필터가 하나라도 걸려 있으면 `필터 결과 0건`.

---

## 8. URL 쿼리 규칙 (D-14)

| 쿼리 | 값 | 기본(생략) | 비고 |
|------|----|------------|------|
| `sub` | `rookie` \| `hall` \| `completed` | `weekly` | `weekly`는 URL에 쓰지 않는다. 알 수 없는 값 → `weekly` |
| `genre` | `GENRES` 중 하나 | 전체 | 알 수 없는 값은 무시 |
| `sort` | `overall` \| `completion` \| `continuation` | `overall` | 기본이면 생략 |
| `period` | `weekly` \| `monthly` \| `all` | `weekly` | 기본이면 생략. `hall`에서는 무시 |
| `status` | `all` \| `ongoing` \| `completed` | `all` | 기본이면 생략. `sub=completed`에서는 무시(항상 `completed`) |
| `page` | 1 이상 정수 | 1 | 1이면 생략. 상한 5로 보정, `NaN`·0·음수 → 1, 404 없음 |

- `searchParams`는 `Promise`로 `await`한다(21과 동일).
- 장르·정렬·기간·연재 변경은 `page` 제거. 서브 행 이동은 2절 표대로 `sort`·`page`·`status` 제거.
- `searchParams`에 `tag` 같은 검색 쿼리는 도입하지 않는다.

---

## 9. 접근성

- 모든 인터랙티브 요소(서브 행, 메인 탭, 장르 칩, 셀렉트 3개, `더보기`, `필터 초기화`, 빈 상태 버튼, 홈 `더보기 ›`) 최소 **44×44px** 히트 영역. 모바일 3열 카드 전체가 단일 탭 대상.
- 포커스 `focus-visible` 2px `--ring`, `outline-offset: 2px`, 카드 링은 `overflow:hidden`에 잘리지 않게 바깥쪽.
- `<nav aria-label="랭킹 구분">`은 쓰지 않고 헤더의 서브 행(`aria-label="서브 구분"`)이 그 역할을 한다. 활성 항목 `aria-current="page"`.
- `h1` 하나, 카드 제목 `h3`, 그리드는 `ul/li`.
- **순위 접근성**: RankBadge는 화면용 숫자(`aria-hidden`)와 sr-only `{n}위` 텍스트를 함께 둔다. 카드의 읽기 순서는 `{n}위, 제목, 작가, …, 연독률 N%`(RatioBadge는 글자 그대로 읽히므로 별도 `aria-label` 없음).
- 색만으로 전달하지 않는다(순위·연독률·완독률 모두 숫자 텍스트).
- 셀렉트 3개 `aria-label`: `정렬`, `기간`, `연재`. 비활성 연재 셀렉트(완결작)는 `aria-disabled="true"`이며 표시값 `완결만`.
- `aria-live="polite"`: 결과 건수(`작품 {n}개`), 더보기 완료. 로딩 `aria-busy`, 오류 `role="alert"`.
- 장르·정렬·기간 변경으로 목록이 갱신되면 sr-only 알림 `{정렬 라벨}, {기간 라벨} 순위로 바뀌었어요`는 만들지 않는다(결과 건수 알림으로 충분, 중복 방지).
- `prefers-reduced-motion`: 호버 전환·스켈레톤 pulse 끔.
- 대비: 순위 숫자·연독률 배지는 불투명 배경이라 표지 색과 무관하게 4.5:1 이상.

---

## 10. Interaction Contract 요약

| 트리거 | 동작 |
|--------|------|
| 헤더 `랭킹` 탭 | `/ranking`(주간 랭킹) |
| 서브 행 항목 | `sub` 설정, `genre`·`period` 유지(hall은 모두 제거), `sort`·`page`·`status` 제거 |
| 홈 `더보기 ›` 3곳 | `/ranking`, `/ranking?sub=rookie`, `/ranking?sub=hall` |
| 장르 칩 | `genre` 설정, `page` 제거 |
| 정렬·기간 셀렉트 | 각 쿼리 설정(기본이면 제거), `page` 제거 |
| 연재 셀렉트 | `status` 설정(기본이면 제거), `page` 제거, `sort` 유지 |
| `더보기` | `page+1`(상한 5), 스크롤 유지, 새 첫 카드로 포커스 |
| 100위 도달 | `더보기` 숨김 + `순위는 100위까지 보여요.` |
| `필터 초기화` | `/ranking?sub=…`(현재 서브 행 유지) |
| 루키·완결 빈 상태 `주간 랭킹 보기` | `/ranking` |
| 명예의 전당 `랭킹 보기` | `/ranking` |
| 카드 클릭 | `/works/{id}` |

---

## 11. 카피 표

| 요소 | 문구 |
|------|------|
| 메인 탭 | `랭킹` |
| 서브 행 | `주간 랭킹`, `루키 쿼터존`, `명예의 전당`, `완결작` |
| 홈 더보기 링크 | `더보기 ›` (`aria-label`: `주간 랭킹 더보기` / `루키 쿼터존 더보기` / `명예의 전당 더보기`) |
| 제목 | `주간 랭킹` / `루키 쿼터존` / `명예의 전당` / `완결작` |
| 갱신 문구 | `클릭이 아니라 끝까지 읽은 비율(완독률)과 다음 화로 이어진 비율(연독률)로 줄 세웠어요. 매주 월요일 갱신돼요.` |
| 표본 안내 | `도달 독자가 5명 미만인 작품은 순위에 넣지 않아요.` |
| 정렬 옵션 | `종합순`, `완독률순`, `연독률순` |
| 기간 옵션 | `주간`, `월간`, `전체` |
| 연재 옵션 | `연재 전체`, `연재중`, `완결만` |
| 순위 숫자 | `{n}` (sr-only `{n}위`) |
| 연독률 배지 | `연독률 {N}%` |
| 완독률 | `완독률 {N}%` |
| 회차 수 | `{n}화` |
| 표지 없음 | `표지 없음` |
| 결과 건수(스크린리더) | `작품 {n}개` |
| 더보기 | `더보기` / `불러오는 중…` / `작품 {n}개 더 불러왔어요` |
| 100위 상한 | `순위는 100위까지 보여요.` |
| 스냅샷 없음 | `아직 집계된 순위가 없어요` / `순위는 매주 월요일에 집계돼요. 조금만 기다려 주세요.` |
| 필터 0건 | `조건에 맞는 작품이 없어요` / `장르나 연재 조건을 바꿔 보세요.` / `필터 초기화` |
| 루키 비었음 | `지금은 루키 작품이 없어요` / `10화 이상 연재한 신작이 올라오면 여기에 나타나요.` / `주간 랭킹 보기` |
| 완결작 비었음 | `순위에 오른 완결작이 아직 없어요` / `완결 처리된 작품이 순위 기준을 채우면 여기에 나타나요.` / `주간 랭킹 보기` |
| 명예의 전당 셸 | `명예의 전당을 준비하고 있어요` / `리뷰가 모이면 우수 리뷰를 여기에서 소개할게요. 지금은 랭킹에서 인기 작품을 만나 보세요.` / `랭킹 보기` |
| 오류 | `순위를 불러오지 못했어요` / `잠시 후 다시 시도해 주세요.` / `다시 불러오기` |

CTA 주 동작: `더보기`(목록 이어보기). 빈 상태 CTA는 위 표의 서브별 버튼.

---

## Registry Safety

shadcn 공식 컴포넌트만 사용, 서드파티 레지스트리 없음. 게이트 불필요. 신규 shadcn 컴포넌트 추가 없음.

---

## 구현 메모 (UI에 영향)

- 순위·`total`·카드 데이터는 스냅샷 테이블에서 읽는다(D-07). UI는 `{ rank 없이 정렬된 작품 배열, total, 기준 기간 시작·종료, 기준 생성일 }`만 요구하고 순위 = 인덱스 + 1.
- 점수·가중치·보정식은 정렬 키 함수 한 곳에 상수로 둔다(D-02). 화면 카피(정렬 안내, 표본 임계 `5`, 루키 상수)도 같은 위치의 상수에서 가져와 값이 어긋나지 않게 한다.
- 마이그레이션 번호는 0062(CONTEXT 반영). pg_cron 활성화·월요일 0시(KST) 스케줄은 사용자 선행 작업이며 첫 집계 전에는 `스냅샷 없음` 상태가 정상이다.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting
- [x] Dimension 2 Visuals
- [x] Dimension 3 Color
- [x] Dimension 4 Typography
- [x] Dimension 5 Spacing
- [x] Dimension 6 Registry Safety

**Approval:** gsd-ui-checker VERIFIED 2026-11-18 (BLOCK 0, FLAG 4). 사용자 최종 승인 대기.

### plan에서 흡수할 FLAG (비차단)
1. 시각 앵커 한 줄 선언(21처럼 첫 줄 카드 그리드) + 1~3위 강조 여부 결정.
2. 모바일 3열(표지 약 109px)에서 RankBadge(좌상단)와 `연독률 N%` pill(우상단)이 겹치지 않는 규칙(예: 모바일은 `N%`로 축약).
3. RankBadge 28px를 24 또는 32px로 맞춰 간격 예외 축소.
4. §2 기준 안내 줄의 서브 행별 노출 표 확정, ListFilterBar에서 연재 셀렉트는 `paramNames.status=status`(독립 쿼리, `sub` 매핑 아님) 명시, 모바일에서 완독률 footer를 숨기는 선택의 확인.

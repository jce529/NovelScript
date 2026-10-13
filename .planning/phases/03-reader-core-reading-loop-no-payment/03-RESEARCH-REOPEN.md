# Phase 3 재개 보완 리서치 (2026-10-12, Haiku 조사 → 오케스트레이터가 파일로 저장)

신뢰도 표기: HIGH(코드·공식 문서 직접 확인) / MEDIUM / LOW. 마이그레이션 번호는 병렬 plan 충돌 방지를 위해 **0024–0025 예약값**을 쓴다(조사 원문의 0022를 치환).

## 1. 결론 요약
- 스크롤 진도: `reading_progress`(사용자+작품당 1행, 회차 포인터)는 유지하고, **사용자+회차당 1행 `chapter_reading_state`** 신규. 완독 판정과 이후 완독률·연독률 산출의 원천.
- 저장 경로: Server Action이 아니라 **Route Handler `POST /api/reader/progress` + 5초 스로틀 + pagehide `fetch keepalive`**. (Server Action은 클라이언트당 순차 실행이라 좋아요·신고를 막는다. `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`)
- 완독 판정: (끝 센티넬 1초 이상 노출) AND (서버 계산 최소 읽기 시간 이상 활성 시간). 완독 기록은 **RPC로만** 쓴다.
- 뷰어 chrome: 탭 토글 + 상·하단 바 슬라이드, 설정은 base-ui `popover` 말풍선. 설정 저장은 **cookie 권장**.
- 완독률·연독률 산출은 Phase 3에서 하지 않는다(작품 상세는 "집계 중", 랭킹은 현행 점수 유지·"인기" 표기).

## 2. 현재 코드 사실 (HIGH)
- `lib/reader/progress.ts`: 회차 **열기** 시점에만 `upsertReadingProgress`(`trackChapterOpenAction`, `app/works/[workId]/chapters/[chapterId]/actions.ts`). 스크롤 위치 저장 없음.
- `0003_reader.sql`: `reading_progress` PK (user_id, work_id), 소유자 RLS. `0008_sanction_enforcement.sql`이 `reading_progress`·`work_likes` 등에 restrictive 쓰기 가드를 씌운다 → 신규 테이블도 같은 목록에 추가.
- `chapters.content`는 `text not null default ''`. 뷰어는 `whitespace-pre-wrap`(평문 가정, 편집기 저장 형식 확인 필요).
- `components/reader/viewer-shell.tsx`: 헤더·푸터 항상 표시, 설정은 `ViewerSettingsSheet`(하단 시트), 글자 4단계 [17,19,21,24], 테마 light/sepia/dark. 스크롤 추적 없음. `<main overflow-y-auto>`의 실제 스크롤 컨테이너가 window인지 확인 필요.
- `ViewTracker`는 StrictMode 개발 모드에서 중복 호출.
- `components/layout/site-header.tsx`는 로고+로그인뿐(2단 헤더는 새로 만든다).
- `components/ui/*`는 `@base-ui/react` 기반(`asChild` 없음, `render` prop). 캐러셀/embla 없음. `components/reader/promo-banner.tsx`=READ-09(삭제 대상). `next` 16.3.2, `next-themes`는 설치만 되고 ThemeProvider 미연결.

## 3. 항목별 권장안
### (1) 스크롤 진도 모델
```sql
create table chapter_reading_state (
  user_id uuid not null references profiles(id) on delete cascade,
  chapter_id uuid not null references chapters(id) on delete cascade,
  work_id uuid not null references works(id),
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  scroll_ratio numeric(5,4) not null default 0 check (scroll_ratio between 0 and 1),
  max_scroll_ratio numeric(5,4) not null default 0 check (max_scroll_ratio between 0 and 1),
  active_ms integer not null default 0 check (active_ms >= 0),
  completed_at timestamptz,
  primary key (user_id, chapter_id)
);
create index on chapter_reading_state (chapter_id);
create index on chapter_reading_state (work_id, user_id);
```
- RLS: 소유자 SELECT만. **INSERT/UPDATE 정책은 열지 않고** SECURITY DEFINER RPC로만 쓴다(PostgREST로 `completed_at` 직접 조작 방지). 0008 restrictive 가드 목록에 추가.
- `chapters.char_count integer generated always as (length(regexp_replace(content, '\s', '', 'g'))) stored` 추가(content가 평문이라는 전제).
- 저장: 스크롤 중 5초 트레일링 스로틀, 1%p 미만 변화 생략, `visibilitychange→hidden`/`pagehide`/회차 전환 시 즉시 플러시. 이탈 시 같은 엔드포인트에 `fetch(..., {keepalive:true})`(sendBeacon 쓰지 않음). 서버는 `scroll_ratio` 덮어쓰기, `max_scroll_ratio`=greatest, `active_ms` 단조 증가+상한 검사.
- 위치는 픽셀이 아니라 **본문 기준 비율** `(scrollY − 본문 상단)/(본문 높이 − 뷰포트 높이)` 0~1 클램프. 복원은 `document.fonts.ready` 후 rAF `scrollTo`, 복원 전 본문 `opacity-0`. 회차 전환 `<Link scroll={false}>`+새 회차 맨 위 시작 명시.
- 열람 시작 기록: `trackChapterOpenAction`에서 RPC로 `insert ... on conflict do nothing`(`opened_at`).
- 이어보기: `reading_progress`로 회차, 같은 회차의 `scroll_ratio` 복원. 신뢰도: 설계 MEDIUM, 코드 사실 HIGH, keepalive MEDIUM.

### (2) 완독 판정
- 끝 도달: 본문 뒤 센티넬이 IntersectionObserver `threshold 1.0`으로 1초 이상 보임(하단 바 56px rootMargin 보정). 짧은 회차도 시간 조건은 적용.
- `min_ms = max(30_000, ceil(char_count/1200 × 60_000 × RATIO))`, **RATIO=0.5(임시)**. 1,200자/분은 사용자 임시값. 예: 5,000자→125초, 10,000자→250초. 한국어 묵독 속도 근거 자료 없음 → 1,200·0.5 모두 LOW, 베타 데이터(완독 건 active_ms/char_count 하위 p5)로 교정.
- 서버 RPC `complete_chapter(p_chapter_id, p_active_ms)` SECURITY DEFINER: char_count는 DB에서 읽음; `active_ms ≤ now()−opened_at+5초`; `active_ms ≥ min_ms`; `max_scroll_ratio ≥ 0.98`; 열람 가능 회차(canView); `completed_at = coalesce(completed_at, now())`.
- 클라이언트 활성 시간: `visibilityState==='visible'`일 때만 누적, 스크롤·포인터·키 입력이 120초 없으면 정지(임시값).
- 잔여 위험: 자동 스크롤·active_ms 위조는 클라이언트 측에서 막지 못함 → v1 수용, 완독률이 랭킹 기준이 될 때 재검토. 신뢰도: 구조 MEDIUM, 수치 LOW.

### (3) 연독률/완독률
- Phase 3은 **원천 행만 쌓고 산출하지 않는다.** `getWorkReadingStats()`는 `null` → UI "집계 중"(표본 최소치 예: 회차 열람자 30명 미만, LOW). 이후 phase: A 실시간 집계 뷰 → 트래픽이 생기면 B 카운터 비정규화(`chapters.opened_count/completed_count`) → C 머티리얼라이즈드 뷰는 스케줄러 없어 보류.
- 랭킹은 현행 가중치(views 0.4/likes 0.3/CTR 0.3) 유지, 카드 배지 "인기"+툴팁. 현행 CTR 프록시를 "연독률"이라 부르지 않는다.

### (4) 뷰어 chrome · 설정 5항목 · 저장
- 본문 onClick 토글. 무시 조건: 텍스트 선택 중, 링크·버튼·입력 대상, pointerdown~up 이동 ≥10px. 바는 `fixed`+transform 슬라이드. `env(safe-area-inset-*)`에 `viewport.viewportFit:'cover'` 필요(타입 확인됨).
- 설정 패널 = `components/ui/popover.tsx` 말풍선(현행 Sheet 대체). 팝오버 열림 중 바 자동 숨김 금지.
- 상단: 홈(작품 상세), 목차, 설정 / 하단: 이전화 · 댓글(자리만, 댓글 phase 전 비활성) · 다음화. 정주행 토글은 결제 확장 phase 소관이라 Phase 3에서 렌더하지 않음.
- 설정 5항목: 글꼴 · 뷰어 모드(라이트/다크/시스템) · 글자 크기 · 여백 · 줄 간격. 컨테이너 CSS 변수(`--viewer-size/lh/pad`, `data-viewer-theme/font`)로 재렌더 없이 변경. 시스템 모드는 `prefers-color-scheme` CSS.
- 글꼴: 고딕은 현행 스택, 명조는 (a) `next/font/google` Noto Serif KR(뷰어 레이아웃 한정, 용량 미측정 LOW) 또는 (b) OS 명조 스택 중 택1.
- 저장: **cookie**(`ns_viewer`=5키 JSON, 화이트리스트 검증, max-age 1년, SameSite=Lax). 뷰어 `page.tsx`에서 `cookies()`로 읽어 props로 전달(루트 layout에서 읽지 않음; `02-guides/preventing-flash-before-hydration.md`). 계정 동기화는 독자 계정 설정 phase.

### (5) 홈 슬라이더 · 2단 헤더 · Next 주의점
- 슬라이더: 네이티브 CSS scroll-snap(`flex overflow-x-auto snap-x snap-mandatory`), region+aria-label+tabIndex=0, 데스크톱 화살표는 `scrollBy`. embla 미추가. base-ui `scroll-area`는 쓰지 않음.
- 2단 헤더: 독자 레이아웃(route group)에 별도 헤더(스튜디오 헤더와 분리). 윗줄·메인 탭·서브 행 각각 모바일 가로 스크롤, sticky는 한 번만. 부품: tabs, popover(최근 검색어), badge, separator, tooltip, button, input, dropdown-menu.
- Next 16.3.2: `proxy.ts`(middleware 아님), `params/searchParams`는 Promise, Server Action 순차 실행, 쿠키는 해당 page에서만, Link 기본 scroll 유지 주의, 유료 회차는 RSC 프리패치에서 `content` 제외 유지, 개발 StrictMode useEffect 2회 실행.

## 4. 위험
1 완독 수치 근거 부족(LOW) 2 클라이언트 조작 3 신규 테이블 RLS 쓰기 정책/0008 가드 누락 4 pagehide 전송 유실 5 Server Action 큐 막힘 6 StrictMode 중복(열람 시작은 on conflict do nothing) 7 복원 점프(fonts.ready) 8 쿠키 값 신뢰(화이트리스트로 충분) 9 Noto Serif KR 용량 10 작품 목록 점수 계산이 요청마다 전체 스캔(이번 phase 손대지 않음)

## 5. 구현 순서 제안
1 마이그레이션(chapter_reading_state, chapters.char_count, RLS, RPC open/save/complete, 0008형 가드, 익명·비소유자 테스트) 2 trackChapterOpenAction 확장+진도 Route Handler+클라이언트 훅 3 완독 판정 훅+RPC 위조/상한/경계 테스트 4 뷰어 chrome·설정 팝오버·쿠키 5 홈·헤더·작품 상세 4탭·"집계 중" 메타·신고 상단 고정 6 READ-09 배너 제거+문서 정리

## 6. 문서 충돌 (사용자 확인 필요 — plan은 기본안 적용 후 Open Decisions에 기록)
1 설정 저장: 청사진 "설정 저장" ↔ UI-SPEC "세션만 유지" → 기본안 cookie
2 뷰어 모드: 청사진 라이트/다크/시스템 ↔ 현행 라이트/세피아/다크 → 기본안 청사진(세피아 제거)
3 뷰어 바: UI-SPEC 상시 표시 ↔ 청사진 탭 시 표시 → 청사진 우선(UI-SPEC 갱신)
4 랭킹 카드 배지: 청사진 "연독률" ↔ UI-SPEC "인기+툴팁" → 기본안 UI-SPEC
5 홈 "더보기" 대상(랭킹 목록 창)·루키 쿼터존은 신규 phase → 더보기 숨김, 루키는 안내 카드만
추가: READ-09 제거 시 REQUIREMENTS·ROADMAP 문구 처리

## 7. 열린 질문
RATIO 0.5/1,200자/30초 하한/120초 유휴 임시값 동의 · 본문 평문 여부 · 실제 스크롤 컨테이너(window?) · 명조 글꼴 방식 · 완독 RPC 호출 경로(Route Handler vs Server Action) · 댓글 버튼 자리 비활성 vs 숨김

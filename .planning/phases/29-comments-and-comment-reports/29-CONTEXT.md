# Phase 29: 댓글 · 댓글 신고 처리 - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning
**Requirements:** CMT-01 ~ CMT-06 (v1.1 확장)
**Depends on:** Phase 7(신고 큐·조치·제재 모델), Phase 3(뷰어 하단 바), Phase 24(본인 확인 `user_is_verified`)

<domain>
## Phase Boundary

독자·작가가 회차 댓글 창에서 댓글·답글·좋아요를 쓰고, 신고(사유 4종)를 접수하며, 관리자가 `/admin`의 `댓글 신고` 탭에서 처리한다. 작품 단위 댓글 허용 스위치와 독자 닉네임 표시를 포함한다.

**이 단계가 전달하지 않는 것:** 제재 이력 탭·조기 해제·기간 변경(Phase 35), 닉네임 변경 UI와 14일 제한(Phase 33 RENT-05), 통합 설정 허브 화면(Phase 32 HUB-09 — 이 단계는 작품별 스위치의 데이터·서버 경계만 만든다), 외부 알림(이메일·푸시), 자동 필터링.

**마이그레이션 번호는 '미정'** — 다른 phase와 동시 진행되므로 실행 직전에 최신 번호 다음으로 확정한다.
</domain>

<decisions>
## Implementation Decisions (2026-11-13 discuss, 사용자 확정)

### 작성 권한 · 정책
- **D-01:** 본인 확인(Phase 24 `user_is_verified`: 카카오·구글 연동 또는 번호 인증)이 없는 계정(이메일 가입만)은 댓글·답글을 **읽기만** 한다. 작성은 DB 경계(RLS/RPC)에서 차단하고, UI는 `본인 확인 후 댓글을 쓸 수 있어요`로 안내한다. 좋아요·신고는 로그인만 하면 가능.
- **D-02:** 익명 불가, 로그인 필수, 독자 닉네임 공개(CMT-01). 작가 계정이 쓴 댓글은 작가 배지 + 작가 이름(`pen_name`)으로 표시한다.
- **D-03:** 답글은 **1단**(댓글→답글). 답글에 다는 답글은 같은 부모 댓글 스레드에 이어 붙고 별도 중첩이 없다. 부모 댓글이 삭제·숨김이어도 답글은 유지된다.
- **D-04:** 스팸 제한: 사용자당 **1분 5건**(DB 검사), 본문 **최대 800자**(trim 후 1자 이상). 초과 시 입력을 유지한 채 안내 문구를 보인다.

### 수정 · 삭제 · 표시 상태
- **D-05:** 수정은 작성자 본인만(작가도 동일), 삭제는 작성자 본인 또는 관리자만. 작가는 다른 사람의 댓글을 지울 수 없다(관리자 신고 경로로만). 삭제·숨김은 소프트 처리(`deleted_at`/`admin_hidden`), 하드 삭제 없음.
- **D-06:** 본인 삭제는 자리에 `삭제된 댓글`, 관리자 숨김은 `관리자에 의해 숨겨진 댓글`로 남기고 **답글은 유지**한다. 자리표시에는 본문이 DTO·DOM에 포함되지 않는다.
- **D-07:** 좋아요: 댓글·답글에 토글, 본인 글에도 가능(작성 규칙은 "누구나"). 로그인 필수.

### 신고
- **D-08:** 댓글·답글 모두 `신고`(본인 글 제외, 로그인 필수, 본인 확인 불필요). 사유는 욕설·비하·혐오 / 스포일러 / 광고·도배 / 기타(기존 `REPORT_CATEGORIES`와 1:1). 같은 신고자의 같은 대상 중복 신고는 막는다. 작성자가 독자든 작가든 같은 기준이다.
- **D-09:** 기존 `reports`(작품·회차 대상)를 확장할지 별도 댓글 신고 테이블을 둘지는 planner 재량 — 단 (a) 작품·회차 신고 큐(ADMIN-01~04)에 회귀를 만들지 않고, (b) 감사 로그 `admin_actions`와 service-role 단일 경로(Phase 7 D-02), (c) 신고자 닉네임은 관리자 화면에서도 비공개(건수·사유만)를 지킨다.

### 관리자 처리 (CMT-05)
- **D-10:** `/admin` 상단 탭은 Phase 7 개정 구조(작품·회차 신고 / **댓글 신고** / 작가 재검토 / 제재 이력)에 `댓글 신고`를 끼워 넣는다. 큐(열림·처리됨·전체, 오래된 순, 같은 대상 묶음 건수) → 상세(댓글 본문·답글이면 원 댓글, 신고 내역 사유별 건수, 작성자 이력 경고/댓글 정지/계정 정지 횟수) → 조치.
- **D-11:** 조치: **댓글 숨김 · 경고 · 댓글 정지(1일·7일·30일·영구) · 계정 정지(7일·30일·영구) · 기각**. 조치한 경우 내부 사유(최대 2000자)와 작성자에게 전달되는 공개 사유(최대 500자) 필수, 기각은 메모 선택(Phase 7 D-19). 확정 전 확인 대화상자.
- **D-12:** **댓글 정지 모델:** 기존 `user_sanctions.kind`에 `comment_suspension`(기간)과 `comment_permanent_suspension`(영구) 계열을 추가하고, `profiles` 현재상태 캐시에 댓글 정지 전용 컬럼을 둔다(예: `comment_suspended_until` + 영구 표현). 캐시는 `apply_user_sanction()` **단일 쓰기 경로**로만 갱신(Phase 7 D-06). 댓글 정지는 **댓글·답글 작성만** 막고 집필·발행·구매·읽기·좋아요·신고는 유지한다. 기존 계정 정지(Phase 7 D-07)는 댓글 작성도 함께 막는다. 만료는 조회 시점 판단(D-08, 크론 없음). 계정 정지는 기존 `suspension`/`permanent_suspension` 경로를 그대로 재사용한다.
- **D-13:** 경고는 Phase 7 D-09 방식(다음 접속 시 `운영 알림` + `확인했습니다`)을 재사용하고, 댓글 정지·댓글 숨김도 작성자에게 알림(공개 사유 포함)으로 전달된다. 제재 이력 타임라인 조회·조기 해제는 Phase 35이므로 여기서는 `user_sanctions`에 이력이 정확히 쌓이게만 한다.

### 작품 단위 설정 · 닉네임 (CMT-06)
- **D-14:** 작가가 작품별로 댓글 허용 여부를 정한다(`works`에 불리언, 기본 허용). 끄면 해당 작품 모든 회차의 댓글 창이 `작가가 댓글을 닫았어요`로 바뀌고 기존 댓글은 저장돼 있되 작성·좋아요·신고가 막히고 열람은 가리지 않는다(기존 댓글은 읽기 전용으로 계속 보인다(UI-SPEC 확정)). 새 작품 기본값은 HUB-09(Phase 32)가 연결하며 이 단계는 작품별 서버 액션과 스튜디오 작품 설정 위치의 최소 토글만 만든다.
- **D-15:** 코드에 독자 닉네임이 없으므로 **`profiles.reader_nickname`을 이 단계에서 추가**한다(가입 시 자동 부여 `독자` + 난수 4자리·유일, 기존 계정은 백필). 댓글은 조회 시 프로필을 조인해 항상 최신 닉네임을 보인다(이전 댓글에도 반영 = CMT-06). 닉네임 변경 UI·14일 제한은 Phase 33(RENT-05)이 이 컬럼 위에서 구현한다. 작가 계정 댓글은 `pen_name`을 쓴다.

### Claude's Discretion
- 댓글 테이블·좋아요 테이블 스키마, 인덱스, 페이지네이션 방식(회차당 최신순/인기순 페이지 크기)
- 정지 캐시 컬럼 형태(`comment_sanction_kind` 등)와 `user_can_comment()` 가드 함수 구성
- 신고 테이블 확장 vs 별도 테이블(D-09 제약 준수)
- 낙관적 UI 여부, 컴포넌트 분해
</decisions>

<canonical_refs>
## Canonical References

**다운스트림 에이전트는 계획 전에 반드시 읽을 것.**

- `.planning/REQUIREMENTS.md` CMT 절(CMT-01~06), `.planning/ROADMAP.md` Phase 29
- `.planning/gaps/2026-11-13-unassigned-areas-scope.md` — 범위 결정 근거
- `.planning/design/UI-DESIGN-BACKLOG.md` — "독자 뷰어", "댓글 신고·답글", "댓글 권한 규칙", "관리자 탭 구조", "빈 상태" 행
- `.planning/design/mockups/project/` — `AdminComments.dc.html`(관리자 댓글 신고), `ViewerDesktop.dc.html`·`ViewerMobile.dc.html`(댓글 창)
- `.planning/phases/07-admin-moderation-surface/07-CONTEXT.md`, `07-UI-SPEC.md` — 관리자 모델·제재 모델·큐 UX
- `supabase/migrations/0006_admin_foundation.sql`(`user_sanctions`, `apply_user_sanction`, 캐시 가드), `0007_admin_operations.sql`, `0008_sanction_enforcement.sql`(`user_can_write`, 제한적 RLS 패턴), `0051_verified_account_gates.sql`(`user_is_verified`), `0052_verified_completion.sql`
- `lib/reader/reports.ts`(`REPORT_CATEGORIES`, `submitReport`), `components/reader/report-dialog.tsx`, `components/reader/viewer-shell.tsx`, `components/reader/like-button.tsx`
- `lib/admin/*`, `app/admin/*`, `components/admin/*` — 기존 큐·조치 UI와 service-role 단일 경로(`lib/supabase/admin.ts`)
</canonical_refs>

<code_context>
## Existing Code Insights
- 제재는 `user_sanctions`(append-only, kind: warning/suspension/permanent_suspension/lift) + `profiles.sanction_kind/sanctioned_until` 캐시(트리거 가드, `apply_user_sanction()`만 갱신). 쓰기 차단은 제한적(RESTRICTIVE) RLS + SECURITY DEFINER RPC의 명시 검사.
- `user_is_verified(uuid)`/`is_verified_account()`가 0051에 이미 있다.
- 독자 닉네임은 없다(`pen_name`만). 마이그레이션 최신은 0052(번호 충돌 주의, '미정').
- 뷰어 하단 바에 댓글 버튼 자리가 설계돼 있으나 구현은 없다.
</code_context>

<deferred>
## Deferred Ideas
- 제재 이력 탭·조기 해제 — Phase 35
- 닉네임 변경 UI·14일 제한 — Phase 33
- 설정 허브 내 댓글 허용 기본값 화면 — Phase 32
- 댓글 검색·정렬 고급 옵션, 자동 필터, 멘션
</deferred>

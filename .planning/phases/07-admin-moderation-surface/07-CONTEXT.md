# Phase 7: Admin Moderation Surface - Context

**Gathered:** 2026-09-16
**Status:** Ready for planning

<domain>
## Phase Boundary

운영자가 신고된 콘텐츠를 검토하고 조치한다 — Phase 3(READ-05)에서 신고 접수만 열어두고 닫지 않은 루프를 닫는다.

이 단계가 전달하는 것: 신고 큐 조회/처리(ADMIN-01, ADMIN-04), 회차 블라인드(ADMIN-02), 사용자 제재와 이력 조회(ADMIN-03).

**이 단계가 전달하지 않는 것:** 자동 모더레이션/필터링, 신고 큐 검색·고급 필터, 감사 로그 열람 UI, 상용구 응답 템플릿(전부 v2 ADMIN-05), 환불 처리, 외부 알림 발송(채널 자체가 v1 범위 밖).

</domain>

<decisions>
## Implementation Decisions

### 관리자 권한 모델

- **D-01:** 관리자 자격은 `profiles.role` 확장이 아니라 **별도 `admin_users` 테이블**에 둔다. `profiles.role`은 `('reader','writer')` 2값 CHECK이고 `/studio` 게이트가 writer를 보므로, role을 'admin'으로 바꾸면 그 사람이 작가 기능을 잃는다. 권한과 정체성을 분리해 "작가이면서 관리자"를 허용하고, 권한 부여/회수 이력도 남긴다.
- **D-02:** 운영 데이터 접근은 **service-role 클라이언트(`createAdminClient`) 단일 경로**로만 한다. 서버 액션에서 관리자 여부를 확인한 뒤 접근한다. `reports`에 관리자용 RLS 정책을 추가하지 않는다 — 기존 신고자-본인-읽기 정책과 섞이지 않게 하고, 독자/작가 경로에 회귀 위험을 만들지 않는다. 전례: `lib/ai/chat.ts`, `app/account/actions.ts`.
- **D-03:** 관리 화면은 **`/admin` 별도 라우트**, 비관리자에게는 **404**(403 아님) — 관리 화면의 존재 자체를 노출하지 않는다.
- **D-04:** 모든 운영 조치를 **`admin_actions` 감사 테이블**에 기록한다(누가/언제/누구·무엇에/어떤 조치를/왜). ADMIN-03의 "과거 조치 이력 조회"가 이것 없이는 성립하지 않고, 제재 분쟁 시 근거가 된다. 블라인드 해제도 조치로 기록한다.
- **D-05:** **최초 관리자는 마이그레이션 시드 + 수동 SQL**로 만든다. 앱 안에 권한 부여 UI나 부트스트랩 경로를 만들지 않는다 — "누구나 첫 관리자가 될 수 있는" 취약점을 원천 차단한다. 관리자가 관리자를 임명하는 UI는 이 단계 범위 밖.

### 제재 모델 (ADMIN-03)

- **D-06:** 제재는 **`user_sanctions` 이력 테이블 + `profiles` 현재상태 캐시** 둘 다 둔다. **이력 테이블이 진실 원천이고 캐시는 파생값이다.** 캐시는 반드시 단일 쓰기 경로(DB 함수 또는 트리거)로만 갱신하며, 애플리케이션 코드가 두 곳을 각각 쓰지 않는다 — 두 곳을 따로 쓰면 반드시 어긋난다. 이력이 쌓이므로 "3번째 경고" 같은 누적 판단이 가능하다.
- **D-07:** '정지'의 효력은 **읽기 허용 / 쓰기 계열 전면 차단**이다. 집필·발행·신고·좋아요 등 쓰기 동작을 막고 읽기는 남긴다. 로그인 자체를 막지 않는 이유: 이미 구매한 유료 회차(Phase 6 `entitlements`)와 지갑 잔액에 접근할 수 없게 되면 환불 분쟁이 생긴다.
- **D-08:** 정지는 **만료 시각(`sanctioned_until`) 지정 + 영구정지 별도 구분**(until이 null). 만료는 **조회 시점에 판단**해 자동 해제하고, 별도 배치/크론을 두지 않는다.
- **D-09:** '경고'는 기록만 하지 않고 **다음 접속 시 화면(배너 또는 모달)으로 사유와 함께 통지**하고 확인 처리를 받는다. 외부 알림 채널이 v1 범위 밖이므로, 이것이 경고가 실제로 사용자에게 닿는 유일한 경로다. 경고받은 줄 모르는 사람을 나중에 정지시키는 불공정을 막는다.
- **D-10:** **정지된 작가의 기존 발행 작품은 독자에게 그대로 보인다.** 제재는 사람의 행위를 막고, 콘텐츠 노출은 블라인드로 개별 판단한다 — 두 장치를 섞지 않는다. 구매자 접근권을 제재가 부수적으로 없애는 사고도 방지된다.

### 블라인드 처리 (ADMIN-02)

- **D-11:** 블라인드는 작가의 `is_published`를 내리는 방식이 아니라 **별도 `admin_blinded` 플래그**로 표현한다. 작가가 재발행해도 블라인드는 유지되고, 운영자가 푸는 순간 작가가 원래 의도했던 발행 상태로 정확히 돌아간다. 누가 내렸는지도 구분된다.
- **D-12:** **작품 전체 블라인드도 지원한다.** ⚠️ **ADMIN-02 문면("특정 회차")을 넘어서는 확장이다.** 근거: `reports`는 `work_id`가 필수이고 `chapter_id`는 선택이라 작품 단위 신고가 이미 데이터 모델에 존재하며, 회차 개별 블라인드만으로는 그 신고를 조치할 수단이 없다. **파급:** 피드(`listFeed`)·작품 상세·회차 목록·뷰어 쿼리 전부에 블라인드 분기가 추가된다 — 계획 시 이 분기 지점들을 빠짐없이 훑어야 한다.
- **D-13:** 블라인드된 유료 회차를 이미 구매한 독자는 **`entitlement`를 그대로 유지한 채 본문만 차단**되고 사유 안내를 본다. **환불 없음, 재결제 없음.** 해제되면 재구매 없이 바로 읽힌다. 환불은 지갑 정산 및 미구현 상태인 Phase 6 90/10 작가 정산과 얽히므로 이 단계에서 다루지 않는다.
- **D-14:** 블라인드된 회차는 **회차 목록에 표시하되 잠긴 상태**로 둔다(예: '검토 중' 배지). 목록에서 통째로 숨기지 않는 이유: 5화 다음이 7화가 되면 독자가 혼란스럽고 이어보기(`reading_progress`) 위치가 깨진다.
- **D-15:** 블라인드 **해제는 운영자 승인으로만** 이뤄진다. 작가는 내용을 수정한 뒤 **재검토를 요청**할 수 있을 뿐이고, 수정 저장만으로 자동 해제되지 않는다.
- **D-16:** 작가의 재검토 요청은 **운영 화면의 별도 탭**에 모인다(신고 큐와 분리). ⚠️ 이것도 ADMIN-02를 넘어서는 확장이다 — 작가측 "재검토 요청" 진입점과 요청 상태 모델이 추가로 필요하다. 최소 형태로 유지한다: 작가는 요청만, 상태 전이와 해제는 운영자.

### 신고 큐 UX (ADMIN-01/04)

- **D-17:** 처리 동선은 **목록 → 상세 화면에서 조치**. 상세에는 신고 내용·대상 본문·해당 작가의 과거 신고/조치 이력을 함께 띄운다. 블라인드나 제재는 실제 본문을 보지 않고 결정할 수 있는 일이 아니다.
- **D-18:** 같은 대상(회차/작품)에 쌓인 **중복 신고는 대상별로 묶어** 한 줄로 보여주고 건수를 표시한다. 한 번의 조치로 묶인 신고들이 함께 처리된다.
- **D-19:** 처리 메모(`resolution_note`)는 **조치한 경우(블라인드·제재)에만 필수**, 단순 기각은 생략 가능. 분쟁이 생기는 건 항상 조치한 쪽이다.
- **D-20:** 큐 기본 화면은 **`status='open'`만, 오래된 순(created_at 오름차순)**. 처리/기각 건은 필터로 전환해 본다. 큐는 비우는 게 목적이므로 오래 방치된 건이 위로 온다.

### Claude's Discretion

- `profiles` 현재상태 캐시의 동기화 수단(DB 트리거 vs `SECURITY DEFINER` 함수) — D-06의 "단일 쓰기 경로" 제약만 지키면 방식은 자유
- 중복 신고 묶음의 구현 방식(뷰, 집계 쿼리, 애플리케이션 레벨 그룹핑)
- `/admin` 레이아웃과 화면 구성 세부, 배지·안내 문구
- 쓰기 차단(D-07)을 각 서버 액션에 거는 방식 — 공통 가드 헬퍼 위치와 형태
- `admin_actions`의 구체 스키마(대상 다형성 표현 방식 등)

</decisions>

<canonical_refs>
## Canonical References

**다운스트림 에이전트는 계획/구현 전에 반드시 읽을 것.**

### 이 단계의 요구사항·범위
- `.planning/ROADMAP.md` — Phase 7 섹션(Goal, Depends on, Success Criteria 4개)
- `.planning/REQUIREMENTS.md` — ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04(v1 범위) 및 ADMIN-05(v2로 미룬 것: 큐 검색/필터, 감사 로그 UI, 상용구 템플릿)

### 신고 데이터 모델 (이 단계가 그대로 이어받음)
- `supabase/migrations/0003_reader.sql` — `reports` 테이블 정의, `status`/`resolution_note`/`resolved_by`/`resolved_at` 컬럼, 신고자-본인-읽기 RLS 정책, 그리고 "Phase 7이 역할 기반 정책을 추가하거나 service-role을 쓸 것"이라는 주석
- `lib/reader/reports.ts` — `REPORT_CATEGORIES` 단일 원천(DB CHECK 제약과 축자 일치), `submitReport`
- `.planning/phases/03-reader-core-reading-loop-no-payment/03-CONTEXT.md` — D-16(신고 사유 고정 4분류, ADMIN-01의 reason category와 1:1 대응), D-17(신고는 로그인 필수 — 큐 스팸 방지)

### 계정·역할·소프트 삭제
- `supabase/migrations/0001_init.sql` — `profiles.role` CHECK가 `('reader','writer')`뿐이라는 사실(D-01의 근거), `profiles.deleted_at`
- `.planning/phases/01-foundation-wallet-infrastructure/01-CONTEXT.md` — D-08(계정 삭제는 소프트 삭제)
- `docs/4. 시스템 아키텍처 및 기술 스택.md` §4.4 (보안 및 데이터 무결성) — 소프트 삭제 원칙. 제재도 하드 삭제가 아닌 상태 표현이어야 한다
- `lib/auth/account.ts` — `isAccountActive()` 게이트. 제재 판정이 붙을 자연스러운 자리

### 유료 콘텐츠·구매 권리 (블라인드 결정의 제약)
- `supabase/migrations/0005_commerce.sql` — `orders`/`order_items`/`entitlements`, 구매 RPC
- `lib/access/actions.ts` — 세션 기반 `canView`와 보호된 본문 읽기. 블라인드 분기가 들어갈 지점
- `docs/commerce-entitlements.md` — 구매/열람 구현 보고서
- `.planning/phases/06-paid-chapter-unlock/06-CONTEXT.md` — D-10(90/10 정산은 잠정치, 미구현). D-13이 환불을 다루지 않는 이유

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`reports` 테이블**: ADMIN-01/04가 요구하는 필드(신고자·대상·사유·시각·상태)와 처리 필드(`resolution_note`, `resolved_by`, `resolved_at`)를 **이미 전부 갖고 있다.** Phase 3이 의도적으로 Phase 7 모양으로 만들어뒀다 — 신고 스키마를 새로 설계하지 말 것
- **`lib/supabase/admin.ts`의 `createAdminClient`**: D-02의 접근 경로. `lib/ai/chat.ts`, `app/account/actions.ts`에 사용 전례 있음
- **`lib/chapters/actions.ts`의 `unpublishChapter`**: 발행 내리기 로직 참고용. 단 D-11에 따라 재사용이 아니라 별도 플래그 경로를 만든다
- **`components/ui/*`** (shadcn): badge(검토 중 배지), dialog(조치 확인), select(사유/기간), scroll-area(큐), sonner(처리 토스트), textarea(처리 메모) 모두 설치돼 있음
- **`lib/auth/account.ts`의 `isAccountActive`**: 제재 게이트를 붙일 기존 활성 판정 지점

### Established Patterns
- **소프트 삭제/상태 플래그** — 하드 삭제를 쓰지 않는 것이 프로젝트 전반의 원칙 (Phase 1 D-08, docs/4 §4.4)
- **비파괴적 발행 취소** — Phase 2가 `is_published=false` + `unpublished_at`으로 처리. 블라인드도 같은 성격(되돌릴 수 있는 상태 전이)
- **서버 액션 계층에서의 소유권 가드** — Phase 2 이후 모든 뮤테이션이 방어적 소유권 검사를 한다. 관리자 판정도 같은 계층에 놓인다
- **zod 스키마로 DB CHECK 제약을 앞단에서 검증** — 제재 유형·기간 입력에 그대로 적용

### Integration Points
- `app/` 아래에 `admin` 라우트 신규 생성 (현재 account/auth/login/studio/works/write만 존재)
- 블라인드 분기가 들어가는 독자측 읽기 경로: `lib/discovery/actions.ts`(피드), `lib/works/*`(작품 상세), `lib/chapters/actions.ts`(회차 목록/본문), `lib/access/actions.ts`(열람 권한), `components/reader/viewer-shell.tsx`(뷰어)
- 쓰기 차단(D-07)이 걸리는 지점: 집필/발행(`lib/chapters`, `lib/kb`), 신고(`lib/reader/reports.ts`), 좋아요·구독·선호작(`lib/reader/*`)
- 경고 통지(D-09)가 뜰 지점: 로그인 후 진입하는 공통 레이아웃

</code_context>

<specifics>
## Specific Ideas

- 블라인드된 회차의 목록 표시는 "검토 중" 성격의 배지 + 잠김 상태 — 회차 번호 연속성을 깨뜨리지 않는 것이 핵심 의도 (D-14)
- 신고 상세 화면은 "신고 내용 + 대상 본문 + 그 작가의 과거 이력"이 한 화면에 모이는 형태 — 조치 결정에 필요한 재료를 화면 이동 없이 보게 한다 (D-17)
- 운영자가 푼 뒤 작가의 원래 발행 상태로 "정확히" 복귀하는 것이 D-11 별도 플래그 선택의 핵심 이유

</specifics>

<deferred>
## Deferred Ideas

- **환불 처리** — 블라인드된 유료 회차의 토큰 환불. Phase 6의 90/10 작가 정산(미구현)과 지갑 정산 설계가 선행돼야 한다. D-13에서 명시적으로 제외
- **관리자가 관리자를 임명하는 UI** — D-05에서 최초 관리자를 수동 SQL로 정한 결과, 권한 부여 UI와 그 감사는 이 단계 밖
- **신고 큐 검색/고급 필터, 감사 로그 열람 UI, 상용구 응답 템플릿** — v2 ADMIN-05로 이미 요구사항에 분류돼 있음
- **자동 모더레이션/콘텐츠 필터링** — 이 단계는 사람이 판단하는 도구만 만든다
- **제재·경고의 외부 알림 발송** — 알림 채널 자체가 v1 범위 밖 (READ-07은 구독 상태만 저장). D-09의 화면 통지로 대체

</deferred>

---

*Phase: 07-admin-moderation-surface*
*Context gathered: 2026-09-16*

# Phase 6: Paid Chapter Unlock - Research

**Researched:** 2026-09-08  
**Focused re-research:** 2026-09-08 — `06-CONTEXT.md` Unresolved 3문항 + D-12 영향  
**Domain:** 유료 회차 영구 소장, 원자적 wallet 정산, 멱등성, 유료 본문 접근 제어, Phase 5 충전 흐름 체이닝  
**Confidence:** HIGH — 저장소의 현재 스키마/코드와 설치된 Next.js 16.3.2 문서를 직접 확인했고, PostgreSQL·Supabase의 최신 공식 문서로 잠금/함수 보안 원칙을 재검증했다. Phase 5는 아직 미구현이므로 충전 컴포넌트와의 최종 결합부만 MEDIUM이다.

---

## Executive Summary

Phase 6의 핵심은 UI 모달이 아니라 **하나의 경제 트랜잭션과 하나의 콘텐츠 접근 경계**다.

권장 구현은 신규 `chapter_unlocks` 테이블과 신규 `unlock_paid_chapter()` PostgreSQL RPC를 추가하는 것이다. RPC 한 번 안에서 다음 네 가지가 전부 성공하거나 전부 롤백되어야 한다.

1. 현재 로그인 사용자가 이미 소장했는지 확인한다.
2. 독자 wallet에서 현재 회차 가격 100%를 차감한다.
3. 작가 wallet에 가격의 90%를 크레딧한다.
4. 영구 소장권과 당시 가격/분배 스냅샷을 `chapter_unlocks`에 기록한다.

기존 `apply_wallet_delta()`를 애플리케이션 코드에서 두 번 호출하면 두 RPC 호출 사이에 실패할 수 있으므로 PAY-02의 원자성을 충족하지 못한다. 대신 신규 DB 함수 내부에서 기존 함수를 두 번 호출하면 하나의 PostgreSQL 트랜잭션에 참여하므로 기존 원장 규칙을 재사용하면서 전체 원자성을 확보할 수 있다.

추가로 현재 `chapters_public_read` RLS는 모든 공개 회차 **행 전체**를 `anon`/`authenticated`에 노출한다. `getPublicChapter()`가 반환값에서 `content`를 `null`로 바꾸는 것은 앱 UI만 보호할 뿐, Supabase Data API를 직접 호출하는 사용자의 유료 본문 접근을 막지 못한다. DB 수준 보완은 선택 사항이 아니라 유료 언락 기능의 완료 조건이다. 다만 `06-CONTEXT.md`의 후속 지침에 따라 **본문을 함수로만 읽는 A안과 별도 `chapter_bodies` 테이블로 분리하는 B안 중 무엇을 채택할지는 사용자 선택 전까지 미확정**이다. 아래 집중 재조사에서 Studio 초안 경로까지 포함해 비교한다.

마지막으로 Phase 5 UI 계약은 충전 상태 훅을 `AccountPanel`에 마운트한다고 정했지만, 현재 챕터 뷰어에는 `SiteHeader`와 `AccountPanel`이 없다. Toss 결제는 전체 페이지 이탈/복귀를 포함하므로 D-06을 지키려면 Phase 6에서 충전 흐름을 공용 provider로 승격하고, `unlock=<chapterId>` 복귀 의도를 URL에 보존해야 한다.

---

## Constraints and Requirements

### Locked decisions from `06-CONTEXT.md`

- 언락 전 확인 모달을 한 번 거친다(D-01).
- 잠긴 회차 CTA에 가격을 함께 표시한다(D-02).
- 작품 상세/TOC에서는 현재 화면에서 모달과 언락을 완료한 뒤 뷰어로 이동한다(D-03).
- 성공 후 별도 새로고침 없이 같은 클라이언트 화면에서 본문을 즉시 렌더링한다(D-04).
- 잔액 부족 시 자동 충전 모달 전환이 아니라 사용자가 `충전하기`를 눌러야 한다(D-05).
- 충전 완료 후 원래 언락 확인 모달로 자동 복귀한다(D-06).
- 부족 수량을 구체적으로 표시한다(D-07).
- 언락은 계정 귀속 영구 소장이다(D-08); 대여/구독은 제외한다(D-09).
- 작가 90% / 플랫폼 10%를 현재 기본값으로 사용하되 단일 상수로 격리한다(D-10).
- 작가 크레딧은 wallet 원장 기록일 뿐 현금화/정산 UI는 없다(D-11).
- 비로그인 사용자가 잠긴 회차를 선택하면 `/login`을 거친 뒤 원래 회차/확인 모달로 복귀한다(D-12). 로그인 완료만으로 자동 차감하지 않고 D-01 확인을 다시 거친다.

### Literal phase requirement

| ID | Requirement | Research support |
|---|---|---|
| PAY-02 | 토큰으로 유료 회차를 언락하고 잔액을 원자적으로 차감한다. 작가 90%/플랫폼 10%의 잠정 분배를 단일 조정점으로 구현한다. | `chapter_unlocks`, `unlock_paid_chapter()` 단일 트랜잭션, DB 멱등키, 콘텐츠 RPC, 동시성 테스트 |

### Dependency gate

`.planning/STATE.md`와 `ROADMAP.md` 기준 Phase 5는 아직 미실행이다. Phase 6 계획은 작성할 수 있지만 실제 실행 순서는 다음을 지켜야 한다.

1. Phase 5의 `payment_orders`, Toss Route Handlers, `components/payment/token-topup-dialog.tsx`, `components/payment/use-topup-flow.ts`가 먼저 구현·검증된다.
2. Phase 6가 Phase 5 흐름을 공용 provider로 승격하거나 동등한 단일-owner 구조로 확장한다.
3. 충전 성공 콜백과 `unlock=<chapterId>` 복귀 의도를 이용해 원래 확인 모달을 재개한다.

Phase 5 산출물의 실제 public API가 확정되기 전에는 Phase 6 계획에서 import 이름이나 hook 반환 타입을 최종 고정하지 말아야 한다.

---

## Current Codebase Findings

### Reusable foundations

| Asset | Evidence | Reuse decision |
|---|---|---|
| `wallets`, `ledger_entries` | `supabase/migrations/0001_init.sql:18-33` | 그대로 재사용 |
| `apply_wallet_delta()` | `0001_init.sql:36-63` | 신규 언락 RPC **내부에서** 독자/작가 각각 호출 |
| wallet 동시성 테스트 | `tests/wallet/ledger.concurrency.test.ts` | 다중 wallet·동일 멱등키 테스트를 확장 |
| 가격 티어 10/30/50/100 | `lib/chapters/actions.ts:4`, `0002_studio.sql:77` | 서버가 DB의 현재 `price_tier`를 진실 원천으로 사용 |
| 공개 회차 DTO | `lib/chapters/actions.ts:166-229` | viewer별 `locked` 계산으로 변경 |
| 잠금 UI 자리 | `components/reader/viewer-shell.tsx:73-81` | 언락 확인/부족 모달 연결 |
| TOC 잠금 항목 | `components/reader/toc-sheet.tsx:20-31` | 잠긴 항목만 링크 대신 버튼/모달 트리거 |
| 작품 상세 회차 목록 | `app/works/[workId]/page.tsx:82-94` | 같은 unlock coordinator 재사용 |
| Phase 5 충전 모달 계약 | `05-UI-SPEC.md:45-53`, `325-371` | 시각 컴포넌트와 폴링 로직 재사용, 소유권은 확장 필요 |

### Blocking security gap: paid prose is currently API-readable

`0003_reader.sql:8-10`의 정책은 다음 조건을 만족하는 `chapters` 행을 공개한다.

```sql
is_published = true and deleted_at is null
```

RLS는 행 단위 정책이다. 따라서 이 정책을 통과한 유료 회차는 `content` 컬럼도 Data API에서 선택할 수 있다. 현재 `getPublicChapter()`가 `content: locked ? null : data.content`로 매핑하는 것은 해당 함수의 반환값만 가릴 뿐 데이터베이스 권한을 바꾸지 않는다.

**필수 보완의 목표:** DB가 직접 다음 규칙을 강제해야 한다.

- 작가는 자신의 발행/미발행 회차 본문을 항상 읽고 쓸 수 있다.
- 독자는 무료·발행 회차 또는 자신이 언락한 유료·발행 회차 본문만 읽을 수 있다.
- anon key나 임의 PostgREST 쿼리로 이 규칙을 우회할 수 없어야 한다.

아래 grant는 A안의 구성 요소이지 아직 확정 migration이 아니다. A안을 택할 때는 `anon`/`authenticated`의 `chapters` 테이블 수준 SELECT를 회수하고 메타데이터 컬럼만 열 단위로 다시 grant한다. B안을 택하면 `content` 자체를 `chapter_bodies`로 옮기므로 `chapters`는 공개 메타데이터 테이블로 유지할 수 있다.

권장 grant의 개념적 형태:

```sql
revoke select on table public.chapters from anon, authenticated;
grant select (
  id, work_id, title, order_index, is_published, price_tier,
  published_at, unpublished_at, created_at, updated_at,
  deleted_at, view_count, folder_id
) on table public.chapters to anon, authenticated;
```

실제 migration은 Phase 5 적용 후의 최종 컬럼 목록과 아래 사용자 선택을 기준으로 작성한다. Supabase 공식 문서도 table-level privilege가 있으면 먼저 이를 회수한 뒤 필요한 column privilege만 부여하는 방식을 안내한다.

### Phase 5 integration mismatch

Phase 5 UI-SPEC은 다음을 전제로 한다.

- `use-topup-flow.ts`는 `AccountPanel`에 마운트된다.
- `?topup=<orderId>`를 그 훅 하나가 소비하고 폴링한다.
- 이 전제는 `SiteHeader`가 있는 화면에서만 성립한다.

그러나 `app/works/[workId]/chapters/[chapterId]/page.tsx`는 `ViewerShell`만 렌더링하고 `SiteHeader`를 렌더링하지 않는다. 뷰어의 부족 잔액 흐름에서 기존 소유권을 그대로 두면 충전 모달을 열 주체도, Toss 복귀 후 `?topup=`을 소비할 주체도 없다.

**권장 해결:** Phase 6에서 `use-topup-flow`와 `TokenTopUpDialog`의 단일 소유자를 root-level client provider(예: `PaymentFlowProvider`)로 승격한다. `AccountPanel`과 `UnlockDialog`는 provider의 명령만 호출한다. 동일 marker를 두 hook 인스턴스가 경쟁해서 소비하는 구조는 금지한다.

---

## Focused Re-research: Unresolved 3 Questions

이 절은 `06-CONTEXT.md`의 `⚠️ Unresolved` 섹션만을 해소하기 위한 재조사 결과다. **결론을 바탕으로 사용자가 A/B 중 하나를 선택하기 전까지 planner는 접근 제어 migration을 확정하면 안 된다.**

### Question 1 — Studio 초안 읽기를 A/B/C에서 어떻게 처리하는가

#### A. Column privilege 회수 + 조건부 read RPC

구조:

- `chapters.content`는 그대로 둔다.
- `anon`/`authenticated`의 table-level SELECT를 회수하고 `content`를 제외한 메타데이터 컬럼만 grant한다.
- 독자용 `get_public_chapter(p_chapter_id)`는 발행 상태, 무료 여부, `chapter_unlocks`, 작가 본인을 검사해 조건부로 본문을 반환한다.
- Studio용 `get_owned_chapter(p_chapter_id)`를 **별도로 추가**한다. `auth.uid() = works.owner_id`만 통과시키며 발행 여부와 무관하게 본문을 반환한다.
- `saveChapterContent()`는 `UPDATE chapters SET content = ...`를 계속 사용할 수 있다. SELECT 권한 회수와 UPDATE 권한은 별개이고 기존 owner RLS가 쓰기 범위를 제한한다. 단, 실제 migration test로 PostgREST update가 요구하는 metadata SELECT grant를 확인해야 한다.

현재 빠져 있던 Studio 해법은 `app/studio/[workId]/chapters/[chapterId]/actions.ts:13-27`의 `getChapterAction()`을 `get_owned_chapter` RPC 호출로 바꾸는 것이다. 서버 전용 admin SELECT도 가능하지만, 서비스 역할 우회가 불필요하게 넓고 소유권 검사를 애플리케이션 코드 한 곳에 의존하므로 좁은 owner RPC가 더 안전하다.

장점은 기존 `chapters` 저장 모델과 `saveChapterContent()`를 유지해 변경 폭이 가장 작다는 점이다. 단점은 reader/owner라는 두 읽기 함수를 계속 관리해야 하고, 앞으로 본문을 읽는 새 경로가 생길 때 반드시 올바른 함수를 선택해야 한다는 점이다.

#### B. `chapter_bodies` 분리 + RLS

구조:

```sql
create table public.chapter_bodies (
  chapter_id uuid primary key references public.chapters(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);
```

- `chapters`는 공개 가능한 metadata만 보유한다.
- `chapter_bodies` SELECT RLS는 다음 중 하나일 때만 행을 보이게 한다.
  - 연결된 work의 `owner_id = auth.uid()` — Studio 초안/발행본 모두 허용.
  - chapter가 발행·비삭제 상태이고 `price_tier is null` — anon/독자 무료 본문 허용.
  - chapter가 발행·비삭제 상태이고 `(auth.uid(), chapter_id)` unlock이 존재 — 구매 독자 허용.
- UPDATE RLS는 work owner에게만 허용한다.
- 신규 chapter 생성 시 빈 body를 보장하기 위해 `AFTER INSERT` trigger를 두거나, chapter+body 생성 RPC로 원자화한다. 현재 `createChapter()`가 한 행 INSERT만 수행하므로 trigger가 가장 작은 호환 변경이다.
- `getChapterAction()`은 metadata와 `chapter_bodies(content)`를 join/별도 query로 읽는다. owner 정책이 미발행 초안도 허용하므로 owner 전용 SECURITY DEFINER 읽기 함수가 별도로 필요하지 않다.
- `saveChapterContent()`는 `chapter_bodies`를 UPDATE한다.

이 방식은 “행별·사용자별 본문 접근”을 RLS가 직접 표현하므로 장기 모델이 가장 명료하다. 정책의 `EXISTS`가 `chapters`, `works`, `chapter_unlocks`를 참조하므로 인덱스와 정책 테스트가 필수다. 순환 참조는 없다: `chapter_bodies` 정책은 metadata/unlock을 읽지만 그 반대 정책은 `chapter_bodies`를 읽지 않는다.

운영 DB가 이미 있다면 expand/contract가 안전하다.

1. `chapter_bodies` 생성·backfill·동기화 trigger 추가.
2. 애플리케이션 read/write를 새 테이블로 전환.
3. 직접 API 누출 테스트 통과 확인.
4. 마지막 migration에서 `chapters.content` 제거.

한 번에 `DROP COLUMN content`를 먼저 수행하면 이전 배포 인스턴스가 즉시 깨진다.

#### C. View 계열 대안

`security_invoker` view **단독**으로는 이 문제를 해결하지 못한다.

- PostgreSQL 공식 문서상 `security_invoker=true`는 base relation의 권한과 RLS를 view 호출자 기준으로 검사한다.
- 따라서 base table의 `content` SELECT를 회수하면 invoker view도 `content`를 읽지 못한다.
- 반대로 base table `content` SELECT를 유지하면 사용자가 view를 건너뛰고 `chapters`를 직접 조회할 수 있어 기존 누출이 그대로다.

기본 `security definer` view에 `CASE`로 무료/언락/owner를 판정하고 base table 권한을 회수하는 변형은 기술적으로 가능하다. 그러나 Supabase 공식 문서는 definer view가 기본적으로 creator 권한으로 RLS를 우회한다고 경고한다. 독자 view와 Studio draft view 각각에 완전한 권한 조건을 다시 구현해야 하고, 일반 table처럼 넓게 filter/join 가능한 API 표면을 노출한다. 이 저장소에는 안전한 view 선례가 없고 `increment_chapter_view()` 같은 좁은 함수 선례가 있으므로 A보다 이점이 없다.

**C 판정:** `security_invoker` view는 독립 해법에서 제외한다. metadata 전용 view는 사용할 수 있지만 본문 보안은 결국 A의 함수나 B의 분리 테이블이 담당해야 한다.

### Question 2 — 범위·정합성·성능·유지보수 비교

| 기준 | A: column grant + RPC | B: `chapter_bodies` + RLS | C: view 중심 |
|---|---|---|---|
| 보안 경계 | 좁은 함수가 본문 반환을 통제 | 본문 테이블 RLS가 직접 통제 | invoker view 단독 불가; definer view는 자체 권한 로직 필요 |
| Studio 미발행 초안 | 별도 `get_owned_chapter()` RPC | owner RLS로 일반 SELECT | 별도 owner draft view 필요 |
| 기존 본문 쓰기 | `saveChapterContent()` 유지 가능 | UPDATE 대상을 `chapter_bodies`로 변경 | base table write는 별도 유지 |
| production 코드 영향 | migration + `lib/chapters/actions.ts` + Studio `actions.ts` 중심 | migration + `lib/chapters/actions.ts` + Studio `actions.ts`; 생성 trigger/함수 추가 | A와 비슷하나 view 정의/권한 검증 추가 |
| 기존 테스트 영향 | public read/paid lock/Studio get 중심 약 3~5개 | `chapters.content`를 직접 insert/select하는 테스트 최소 5개 + public RLS | A와 비슷하거나 더 큼 |
| migration 난이도 | 중간 — grant 목록과 두 read RPC | 높음 — backfill, 이중화 기간, 최종 drop | 중간 — 권한 우회 검증이 까다로움 |
| 조회 성능 | PK 기반 단일 RPC, 예측 용이 | body PK + `EXISTS` 정책; 적절한 인덱스 필요 | query planner/view 조건에 의존 |
| 유지보수 | 새 본문 read path가 RPC 규칙을 지켜야 함 | 데이터 모델 자체가 공개 metadata/비공개 body를 구분 | 권한 로직이 view 정의에 숨어 감사 난이도 높음 |
| 저장소 선례 | `increment_chapter_view()` SECURITY DEFINER와 가장 유사 | 일반 table RLS 패턴과 가장 유사 | 안전한 exposed view 선례 없음 |
| Phase 6 적합성 | **최소 변경 우선일 때 적합** | **장기 모델 명료성 우선일 때 적합** | 권장하지 않음 |

실제 코드 검색 결과, production의 직접 본문 DB 경로는 주로 세 곳이다.

1. `app/studio/[workId]/chapters/[chapterId]/actions.ts` — owner draft 읽기.
2. `lib/chapters/actions.ts` — `saveChapterContent()` 쓰기와 `getPublicChapter()` 읽기.
3. `supabase/migrations/0002_studio.sql` — `chapters.content` 정의.

B안에서 파급이 커지는 주된 이유는 production 파일 수보다 테스트 fixture다. `draft.test.ts`, `edit-unpublish.test.ts`, `ownership-guard.test.ts`, `chapter-read.test.ts`, `paid-lock.test.ts`가 `chapters.content`를 직접 insert/select한다. 이는 나쁜 신호라기보다 schema migration이 검증해야 할 기존 계약의 범위다.

성능 면에서 A는 단일 chapter PK 조회에 가장 단순하다. B도 `chapter_bodies.chapter_id` PK, `chapter_unlocks(reader_id, chapter_id)` UNIQUE, `works.id`, `chapters.id`가 모두 인덱스되므로 정상 설계에서는 충분하다. Supabase 공식 문서는 RLS가 필터링하는 컬럼에 인덱스를 두고 `(select auth.uid())`처럼 행과 무관한 helper 호출을 statement당 한 번 계산하게 하라고 권고한다. B를 택하면 실제 `EXPLAIN`과 anon/auth/owner pgTAP 정책 테스트를 plan 완료 조건에 포함한다.

### Decision aid — 사용자 선택 지점

- **A 선택 조건:** Phase 6 범위를 작게 유지하고 현재 chapter 저장 구조를 보존하는 것이 우선이다. 두 개의 좁은 read RPC를 명시적으로 관리할 수 있다.
- **B 선택 조건:** 유료 본문을 장기적으로 민감 데이터 경계로 취급하고, 이후 대여/구독/관리자 차단 같은 접근 모드도 RLS 정책으로 확장할 가능성이 크다. 이번에 migration 비용을 지불할 의향이 있다.
- **C:** 현재 요구에는 선택하지 않는 것을 권장한다.

연구자 권고는 **v1 일정/현재 코드 규모를 우선하면 A**, 장기 콘텐츠 권한 모델을 우선하면 **B**다. 어느 쪽도 기능적으로 열등하지 않지만, planner가 임의로 선택해서는 안 된다.

### Question 3 — D-12 로그인 후 복귀의 정확한 영향 범위

현재 callback은 `next`를 읽지만 흐름이 완성되어 있지 않다.

| 현재 경로 | 현재 상태 | D-12 변경 |
|---|---|---|
| `app/login/page.tsx` | OAuth `redirectTo`가 `/auth/callback` 고정 | `/login?next=...`를 읽고 검증된 `next`를 callback URL에 포함 |
| `app/auth/callback/route.ts` | `next`를 읽어 문자열 결합, 검증 없음 | 공용 validator로 내부 경로만 허용; 이메일 보완 분기에도 `next` 전달 |
| `app/auth/complete-email/page.tsx` | `error`만 읽음 | `next`를 hidden input/action에 보존 |
| `app/auth/complete-email/actions.ts` | 성공 시 항상 `/account`; 오류 시 `next` 소실 | 오류·성공 redirect 모두 검증된 `next` 유지 |
| `app/auth/auth-code-error/page.tsx` | `/login` 링크 고정 | 가능하면 `next`를 유지해 재시도 시 원래 intent 보존 |
| 신규 `lib/auth/return-path.ts` | 없음 | 모든 단계가 공유하는 단일 내부 경로 validator/encoder |
| unlock coordinator | 비로그인 복귀 없음 | 현재 화면 URL에 `unlock=<chapterId>`를 병합해 `next` 생성; 복귀 후 확인 모달 오픈 |

권장 흐름:

```text
잠긴 회차 클릭
  -> /login?next=%2Fworks%2F...%3Funlock%3D<chapterId>
  -> OAuth redirectTo=/auth/callback?next=<encoded internal path>
  -> callback session exchange
     -> 이메일 있음: next로 redirect
     -> 이메일 없음: /auth/complete-email?next=<encoded internal path>
        -> 이메일 저장 후 next로 redirect
  -> unlock coordinator가 marker 확인
  -> 최신 quote 조회
  -> 확인 모달 재오픈
```

로그인은 구매 승인이 아니다. 복귀 후 자동으로 `unlock_paid_chapter()`를 호출하면 D-01의 확인 단계를 우회하므로 금지한다.

`next`는 모든 단계에서 다음 조건을 만족해야 한다.

- `/`로 시작하지만 `//` 또는 `/\`로 시작하지 않는다.
- `://`, 제어문자, 외부 origin을 허용하지 않는다.
- 저장값은 `pathname + search`만 사용하고 origin/hash는 버린다.
- 누락/부적합/과도하게 긴 값은 `/`로 대체한다.
- callback에서만 검사하지 말고 login, callback, complete-email action에서 같은 helper로 다시 검사한다.

Supabase 공식 문서상 OAuth `redirectTo`는 프로젝트 Redirect URLs 허용 목록과 일치해야 한다. production에서는 광범위한 wildcard보다 정확한 `/auth/callback` 경로를 등록하고, `next`는 그 callback URL의 query로 운반한다. 배포 전 Google/Kakao 양쪽에서 기존 query가 OAuth 왕복 후 유지되는지 통합 테스트한다.

D-12의 `unlock` marker는 D-06 충전 후 복귀에도 그대로 재사용할 수 있다. 로그인과 충전이라는 두 외부 왕복이 동일한 resume-intent 규약을 쓰면 별도 `sessionStorage`나 중복 상태 머신이 필요 없다.

---

## Recommended Data Model

### `chapter_unlocks`

```sql
create table public.chapter_unlocks (
  id uuid primary key default gen_random_uuid(),
  reader_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id),
  author_id uuid not null references public.profiles(id),
  price_tokens bigint not null check (price_tokens > 0),
  author_credit_tokens bigint not null check (author_credit_tokens >= 0),
  platform_fee_tokens bigint not null check (platform_fee_tokens >= 0),
  created_at timestamptz not null default now(),
  unique (reader_id, chapter_id),
  check (price_tokens = author_credit_tokens + platform_fee_tokens)
);

create index chapter_unlocks_chapter_idx
  on public.chapter_unlocks (chapter_id);

create index chapter_unlocks_author_created_idx
  on public.chapter_unlocks (author_id, created_at desc);
```

설계 이유:

- `(reader_id, chapter_id)` UNIQUE가 영구 소장 및 더블클릭 멱등성의 최종 DB 보장이다.
- `id`는 한 번의 구매를 나타내는 안정적인 ledger reference가 된다.
- 당시 `price_tokens`, `author_credit_tokens`, `platform_fee_tokens`, `author_id`를 스냅샷으로 보존하면 이후 가격/수수료율 변경에도 과거 정산이 해석 가능하다.
- 플랫폼 10%는 별도 플랫폼 wallet에 크레딧하지 않고 `platform_fee_tokens`로 명시 기록하는 것을 권장한다. 전용 wallet은 특수 profile 수명주기와 RLS, 삭제 정책을 새로 만들지만 이번 phase에 실제 출금/회계 기능은 없다. 미크레딧 수수료를 구매 레코드에 명시하는 편이 최소 범위이면서도 감사 가능하다.

RLS는 활성화하고 독자는 자신의 행만 SELECT 가능하게 한다. INSERT/UPDATE/DELETE policy는 만들지 않는다. 모든 생성은 제한된 RPC만 수행한다. 작가가 구매자 명단을 읽는 정책은 D-11 범위 밖이므로 추가하지 않는다.

---

## Atomic Unlock RPC

### Why one new RPC is required

다음 TypeScript 흐름은 금지한다.

```text
apply_wallet_delta(reader, -price)
apply_wallet_delta(author, +credit)
insert chapter_unlocks
```

각 호출은 별도 트랜잭션이다. 두 번째나 세 번째 단계가 실패하면 독자만 차감되거나 작가만 크레딧되는 부분 성공이 남는다.

신규 `unlock_paid_chapter(p_chapter_id, p_expected_price)` 함수가 위 작업 전체를 감싸고, 내부에서 기존 `apply_wallet_delta()`를 호출해야 한다. PostgreSQL 함수 호출 하나가 실패하면 그 호출 안의 변경은 함께 롤백된다.

### Security shape

- `security definer set search_path = ''`를 사용하고 모든 relation/function을 `public.*`로 완전 수식한다.
- 함수 내부 신원은 클라이언트가 보낸 `readerId`가 아니라 `auth.uid()`에서 얻는다.
- 기본 함수 EXECUTE 권한을 `public`/`anon`에서 회수하고 `authenticated`에만 grant한다.
- Next.js Server Action도 `supabase.auth.getUser()`를 다시 확인하고 입력 UUID/예상 가격을 zod로 검증한다. Server Action은 누구나 POST할 수 있는 진입점이므로 렌더 시점 로그인 여부를 권한 검사로 간주하면 안 된다.

Supabase 공식 문서는 `SECURITY DEFINER` 사용 시 반드시 `search_path`를 설정하고 함수 execute 권한을 명시적으로 제한하라고 안내한다.

### Transaction algorithm

권장 순서는 다음과 같다.

1. `auth.uid()`가 없으면 거부한다.
2. 대상 `chapters`와 `works.owner_id`를 읽고 회차 행을 `FOR UPDATE`로 잠근다.
3. 미발행/삭제 회차는 `NOT_AVAILABLE`로 반환한다.
4. 작가 본인이면 무료 접근을 반환하고 소장권/ledger를 만들지 않는다.
5. 무료 회차면 `NOT_PAID`로 반환한다.
6. 기존 `(reader_id, chapter_id)`가 있으면 `ALREADY_UNLOCKED`와 본문을 반환한다.
7. DB의 현재 가격이 `p_expected_price`와 다르면 `PRICE_CHANGED`와 새 가격을 반환해 재확인시킨다. 확인 모달에 표시한 금액과 실제 차감액이 달라지는 것을 막는다.
8. 독자/작가 두 wallet 행을 UUID 정렬 순서로 한 번에 `FOR UPDATE` 한다.
9. 잔액이 부족하면 변경 없이 `INSUFFICIENT_BALANCE`, 현재 잔액, 부족 수량을 반환한다.
10. `AUTHOR_CREDIT_BPS constant integer := 9000` 한 곳에서 작가 몫을 계산한다. 현재 티어는 모두 90%가 정수지만 계산은 `floor(price * bps / 10000)`로 명시한다.
11. `chapter_unlocks` 행을 만들고 생성된 `unlock_id`를 얻는다.
12. 독자 debit: `apply_wallet_delta(reader, -price, 'chapter_unlock_debit', unlock_id::text, ...)`.
13. 작가 credit: `apply_wallet_delta(author, +author_credit, 'chapter_unlock_author_credit', unlock_id::text, ...)`.
14. `UNLOCKED`, 본문, 새 독자 잔액, 정산 스냅샷을 반환한다.

두 wallet을 일관된 순서로 먼저 잠그는 이유는 교차 구매에서의 deadlock을 줄이기 위해서다. 예를 들어 작가 A가 B의 글을 사는 동시에 B가 A의 글을 사면 각 트랜잭션이 “독자 먼저, 작가 나중”으로 잠글 경우 서로를 기다릴 수 있다. PostgreSQL 공식 문서는 여러 객체를 잠글 때 모든 트랜잭션이 일관된 순서로 잠그는 것을 deadlock의 최선 방어로 권고한다.

### Ledger reference design

| Entry | wallet | delta | `reference_type` | `reference_id` |
|---|---|---:|---|---|
| 독자 차감 | reader | `-price` | `chapter_unlock_debit` | `chapter_unlocks.id` |
| 작가 크레딧 | author | `+author_credit` | `chapter_unlock_author_credit` | `chapter_unlocks.id` |

작가 credit의 reference를 `chapter_id`만으로 두면 같은 작가 wallet에서 두 번째 독자의 같은 회차 구매가 기존 `unique(wallet_id, reference_type, reference_id)`와 충돌한다. **구매 행 ID**를 공통 reference로 써야 각 구매는 구분되고 동일 구매 재시도만 멱등 처리된다.

### Result contract

예외 문자열을 UI에서 파싱하지 말고 Server Action이 아래 discriminated union으로 정규화한다.

```ts
type UnlockResult =
  | { status: 'unlocked' | 'already_unlocked'; chapterId: string; content: string; remainingBalance: number }
  | { status: 'insufficient_balance'; chapterId: string; price: number; balance: number; shortfall: number }
  | { status: 'price_changed'; chapterId: string; price: number }
  | { status: 'auth_required' }
  | { status: 'not_available' | 'not_paid'; chapterId: string };
```

`remainingBalance`, `price`, `shortfall`은 PostgreSQL `bigint`에서 오므로 JS 안전 정수 범위를 확인해 `Number`로 변환하거나 문자열로 전달하는 경계를 한 곳에 둔다. 현재 티어 규모에서는 Number가 충분하지만 무검증 암시적 변환은 피한다.

---

## Paid Content Access Boundary

### Common behavior contract (A/B choice pending)

아래 동작은 A/B 어느 쪽을 택해도 동일해야 한다.

1. 단일 공개 회차 조회
   - 공개/비삭제 회차만 reader route에 반환한다.
   - 무료 회차, 소장한 독자, 작품 작가에게만 `content`를 반환한다.
   - 그 외에는 `content = null`, `locked = true`를 반환한다.
   - 로그인하지 않은 사용자의 유료 회차는 항상 잠김이다.
   - A는 `get_public_chapter(p_chapter_id)` RPC가, B는 `chapters` metadata + RLS가 적용된 `chapter_bodies` 관계 조회가 이 계약을 구현한다.

2. 공개 회차 목록
   - 본문 컬럼은 반환하지 않는다.
   - 각 항목의 `locked`를 `price_tier IS NOT NULL AND viewer is not author AND no unlock exists`로 계산한다.
   - 가격은 항상 포함해 D-02 CTA를 구성할 수 있게 한다.
   - A는 list RPC 또는 metadata+unlock 2-query, B는 동일한 metadata+unlock 조회를 사용할 수 있다. 목록에 body join은 필요 없다.

작가 본인의 유료 회차는 무료 열람을 허용하는 것을 권장한다. 자기 wallet 사이의 debit/credit이라는 무의미한 거래와 10% 손실을 만들지 않으며, Studio 소유권 모델과도 일치한다.

영구 소장권은 가격 변경·무료 전환·재유료화 이후에도 삭제하지 않는다. 회차가 일시적으로 미발행/삭제된 동안에는 공개 reader route에서 숨기되, 소장권 행은 유지하고 재발행 시 다시 무료로 접근시킨다. 콘텐츠 삭제/운영 차단보다 구매권이 우선해 삭제된 본문을 계속 노출하는 정책은 이번 phase에서 채택하지 않는다.

### Query performance

- 단일 viewer 조회는 `(reader_id, chapter_id)` UNIQUE 인덱스로 충분하다.
- 한 작품의 TOC는 chapter 목록과 viewer의 unlock을 한 RPC 또는 두 개의 일괄 query로 결합해 N+1을 피한다.
- `chapter_unlocks.chapter_id` 인덱스는 향후 회차별 구매 집계와 작가 측 감사에 유용하다.
- 공개 feed의 nested `chapters(view_count, ...)`는 `content`를 요청하지 않으므로 A의 column grant 변경 또는 B의 body 분리 후에도 유지 가능하다.

---

## Client and UX Architecture

### Shared unlock coordinator

세 진입점이 하나의 상태 머신과 하나의 확인 모달을 공유해야 한다.

- 현재 잠긴 viewer 본문 블록
- viewer 하단 잠긴 다음화 CTA와 TOC
- 작품 상세의 잠긴 회차 목록

권장 상태:

```text
closed
  -> checking_quote
  -> confirm | insufficient
  -> unlocking
  -> success
  -> closed
```

- `checking_quote`는 현재 wallet 잔액과 최신 가격을 서버에서 확인한다.
- `confirm`에서 표시한 가격을 `expectedPrice`로 unlock action에 전달한다.
- `unlocking` 동안 버튼을 disable하지만, 더블클릭 방어의 진실 원천은 DB UNIQUE/RPC다.
- `unlocked` 결과는 본문과 새 잔액을 함께 반환하므로 viewer는 `setState`로 즉시 본문을 렌더링한다. `router.refresh()`나 후속 fetch가 필요하지 않다(D-04).
- 작품 상세/TOC에서 성공하면 그때만 해당 viewer로 client navigation 한다(D-03).
- 이미 소장한 항목은 처음부터 일반 링크로 렌더링한다.

### CTA rules

- 현재/다음/TOC/회차 목록에서 잠긴 항목은 `다음화 (30 토큰)` 또는 `3화 제목 · 30 토큰`처럼 가격을 보인다.
- 잠긴 항목은 `<a>`의 navigation을 먼저 발생시키지 않는다. 실제 `<button type="button">`으로 모달을 열고 성공 후 이동한다.
- 무료/이미 소장 항목은 `Link`를 유지한다.
- 로그인하지 않은 사용자는 기존 reader precedent와 같은 `로그인이 필요해요.` 토스트 + `로그인하기` 액션을 사용하되, D-12에 따라 액션은 검증된 `next`를 포함한 `/login`으로 이동한다. OAuth/이메일 보완 완료 후 `unlock=<chapterId>`가 담긴 원래 화면으로 돌아와 확인 모달을 다시 연다.

### Insufficient balance and top-up resume

잔액 부족 상태는 `shortfall = price - balance`의 서버 계산값을 표시한다.

```text
10 토큰이 부족해요
[충전하기]
```

`충전하기`를 누를 때만 Phase 5 모달을 연다(D-05). 그 직전에 현재 URL에 `unlock=<chapterId>`를 `URL`/`URLSearchParams`로 병합한다. 이 값은 UI 복귀 힌트일 뿐 권한 증명이나 가격 진실 원천이 아니다.

Toss 복귀 후 흐름:

1. 공용 payment provider가 `?topup=<orderId>`를 감지하고 Phase 5 규칙대로 웹훅 credit 완료를 폴링한다.
2. 완료되면 balance를 갱신하고 `topup` marker만 제거한다.
3. unlock coordinator가 남아 있는 `unlock=<chapterId>`를 읽어 최신 quote를 다시 조회한다.
4. 잔액이 충분하면 원래 확인 모달을 자동으로 다시 연다. **자동 차감하지는 않는다.** D-06은 모달 복귀를 요구하고 D-01은 확인을 요구한다.
5. 언락 성공/명시적 취소 시 `unlock` marker만 제거한다.

작품 상세의 탭 상태도 전체 페이지 왕복에서 유지해야 한다. 현재 Tabs는 `defaultValue="intro"`라 복귀 시 회차 탭이 사라진다. `unlock` marker가 있으면 `chapters` 탭을 초기값으로 선택하거나 탭 상태를 URL에 함께 보존해야 D-03/D-06의 “목록 화면으로 복귀”가 실제로 성립한다.

### Balance synchronization

언락 action이 반환한 `remainingBalance`를 공용 wallet/payment provider에 반영해 AccountPanel과 modal이 동일 값을 보게 한다. 언락 직후 본문 표시를 위해 `router.refresh()`를 호출하지 않는다. Next.js 16.3.2 로컬 문서상 Server Action은 반환값과 재렌더 payload를 한 응답에 실을 수 있지만, D-04는 이미 필요한 본문과 잔액을 action 결과로 받을 수 있으므로 클라이언트 상태 갱신이 가장 직접적이다.

---

## Validation Architecture

### Database integration tests (필수)

신규 `tests/unlocks/paid-chapter-unlock.test.ts`에서 최소 다음을 검증한다.

1. 충분한 잔액: 독자 `-price`, 작가 `+90%`, fee snapshot `10%`, unlock 1행.
2. 잔액 부족: wallet/ledger/unlock 모두 변경 없음, 정확한 shortfall.
3. 동일 구매 순차 재시도: 두 번째 호출은 `already_unlocked`, 추가 ledger 없음.
4. 동일 구매 50~100개 동시 호출: unlock 1행, debit 1건, credit 1건.
5. 서로 다른 독자들의 같은 회차 동시 구매: 모든 구매가 개별 작가 credit으로 남음.
6. 교차 구매(A가 B 회차, B가 A 회차) 동시 실행: deadlock 없이 완료하거나 PostgreSQL deadlock 재시도 정책으로 최종 완료.
7. 잔액 경계: 정확히 가격과 같은 잔액은 0으로 성공, 1 부족은 실패.
8. 작가 본인: 차감/크레딧/unlock 없이 본문 접근.
9. 가격 변경 race: `expectedPrice` 불일치는 차감 없이 `price_changed`.
10. 비로그인/타인 ID 조작: 다른 reader를 대신해 구매 불가.
11. 미발행/삭제 회차: 구매 불가.
12. 구매 후 가격 변경/무료화/재유료화: 재차감 없이 소장 유지.

### Content-leak regression tests (필수)

현재 `tests/viewer/paid-lock.test.ts`는 `getPublicChapter()` 반환값만 확인한다. 다음 직접 Data API 테스트를 추가해야 한다.

- anon이 `chapters.select('content')`를 호출하면 유료 본문을 얻지 못한다.
- 로그인했지만 미구매인 사용자가 같은 호출을 해도 얻지 못한다.
- A의 제한된 read RPC 또는 B의 body relation 조회는 미구매자에게 본문을 반환하지 않는다.
- 구매자는 선택한 A/B 경로에서 본문을 얻는다.
- 작가는 자신의 본문을 얻는다.
- TOC/list 결과는 어떤 경우에도 `content` 필드를 포함하지 않는다.

### D-12 auth return-path tests (필수)

- `/login?next=...`가 Google/Kakao `redirectTo`의 callback query로 보존된다.
- callback 성공 시 검증된 내부 `next`로 이동한다.
- 이메일이 없는 사용자는 complete-email page/action을 거친 뒤에도 같은 `next`로 이동한다.
- 이메일 validation/API 오류 후에도 `next`가 보존된다.
- `//evil.example`, `/\evil.example`, `https://evil.example`, 제어문자, 과도하게 긴 값은 `/`로 대체된다.
- 로그인 복귀 후 확인 모달은 열리지만 unlock action은 사용자의 확인 전 호출되지 않는다.

### Component/state tests

- 각 잠긴 CTA가 가격을 표시하고 navigation 전에 모달을 연다.
- confirm 버튼 연타 시 pending 동안 disable된다.
- `insufficient_balance`가 정확한 부족 수량과 `충전하기`를 렌더링한다.
- 충전 완료 이벤트 후 원래 chapter confirm으로 돌아온다.
- `topup`, `unlock`, 기존 query string을 서로 덮어쓰지 않고 해당 marker만 제거한다.
- viewer 성공은 refresh 없이 content를 교체한다.
- work detail/TOC 성공은 unlock 뒤에만 viewer로 이동한다.

### Suggested commands

```bash
npx vitest run tests/unlocks/paid-chapter-unlock.test.ts
npx vitest run tests/viewer/paid-content-access.test.ts
npx vitest run tests/viewer/paid-lock.test.ts
npx vitest run tests/auth/return-path.test.ts
npx vitest run tests/auth/oauth-callback-return.test.ts
npx vitest run tests/wallet/ledger.concurrency.test.ts
npm test
npm run lint
npm run build
```

Supabase 통합 테스트는 로컬 DB가 떠 있어야 하며 현재 `tests/helpers/db.ts` 패턴을 재사용한다.

---

## Common Pitfalls

### 1. Two application RPC calls are not atomic

독자 차감과 작가 크레딧을 TypeScript에서 연속 호출하면 중간 실패가 남는다. 반드시 하나의 DB 함수 안에서 호출한다.

### 2. `chapter_id` alone is not a valid author-credit idempotency key

작가 wallet 하나에 같은 회차의 여러 구매가 들어온다. `reference_id=chapter_id`는 두 번째 구매부터 모두 충돌시킨다. `chapter_unlocks.id`를 사용한다.

### 3. UI masking is not access control

`content=null` 매핑이나 잠금 아이콘은 Supabase API 직접 호출을 막지 않는다. A의 column privilege+검사 RPC 또는 B의 body-table RLS가 필요하다.

### 4. Client-supplied price must never be charged directly

클라이언트 가격은 “사용자가 확인한 가격” 비교용일 뿐이다. 실제 차감액은 잠근 chapter row의 `price_tier`에서 읽는다.

### 5. Unique constraints do not replace transaction design

`(reader_id, chapter_id)` UNIQUE는 중복 구매를 막지만 debit/credit/unlock 세 작업의 원자성을 자동으로 만들지는 않는다.

### 6. Locking reader then author can deadlock

두 wallet을 항상 정렬된 동일 순서로 먼저 잠근다. 필요하면 SQLSTATE `40P01`에 한해 제한 재시도를 둔다.

### 7. Phase 5 marker ownership cannot be duplicated

AccountPanel hook과 viewer-local hook이 동시에 `?topup=`을 읽고 지우면 폴링/토스트/복귀가 race한다. marker consumer는 앱 전체에서 하나여야 한다.

### 8. Full-page payment return destroys React state

`useState({pendingChapterId})`만으로는 D-06을 구현할 수 없다. URL에 복귀 의도를 보존하고 서버에서 다시 검증한다.

### 9. Author self-purchase creates nonsensical settlement

자기 회차는 무료 접근으로 처리한다. 그렇지 않으면 같은 wallet에서 100% debit 후 90% credit되어 작가가 자기 글을 볼 때 10%를 잃는다.

### 10. Removing `content` SELECT affects Studio reads

A를 선택하면 보안 migration 후 기존 `app/studio/...`의 `select('... content ...')`는 실패한다. owner 전용 read RPC를 같은 plan에서 연결해야 한다. B를 선택하면 동일 경로를 `chapter_bodies` 관계 조회로 바꿔야 한다.

### 11. `next` without validation becomes an auth redirect hazard

현재 callback의 `${origin}${next}`를 신뢰하지 않는다. login/callback/complete-email이 하나의 validator를 공유하고, 각 신뢰 경계에서 다시 검사해야 한다.

---

## Recommended Project Structure

Phase 5 실행 후 실제 파일을 재확인하되, 현재 기준 권장 구조는 다음과 같다.

```text
supabase/migrations/
└── 0006_paid_chapter_unlock.sql       # 순번은 Phase 5 최종 migration 뒤로 조정

# B 선택 시 migration 안에 chapter_bodies + backfill + RLS 포함
# A 선택 시 migration 안에 column grants + reader/owner read RPC 포함

lib/auth/
└── return-path.ts                     # D-12 내부 경로 검증/정규화의 단일 진실 원천

lib/unlocks/
├── constants.ts                       # AUTHOR_CREDIT_BPS의 TS 표시가 필요할 때만; DB 값 복제 금지
├── actions.ts                         # quote/unlock action, auth+zod+typed result mapping
└── types.ts                           # client-safe DTO/discriminated union

components/payment/
├── payment-flow-provider.tsx          # Phase 5 hook/dialog의 단일 전역 owner
├── token-topup-dialog.tsx             # Phase 5 구현 재사용
└── use-topup-flow.ts                  # Phase 5 구현 재사용/확장

components/reader/
├── unlock-dialog.tsx                  # confirm/insufficient/unlocking
├── unlock-flow-provider.tsx           # page-local target/state coordinator
├── viewer-shell.tsx                   # locked body + next CTA 연결
└── toc-sheet.tsx                      # locked item interception

tests/unlocks/
└── paid-chapter-unlock.test.ts

tests/viewer/
└── paid-content-access.test.ts

tests/auth/
├── return-path.test.ts
└── oauth-callback-return.test.ts
```

`AUTHOR_CREDIT_BPS`의 경제 진실 원천은 DB 함수 한 곳이어야 한다. UI가 비율을 표시하지 않는 현재 범위에서는 TypeScript 상수를 별도로 만들 필요가 없다. 향후 UI 노출이 필요해지면 DB에서 설정을 읽거나 생성된 공유 설정을 사용하고 90을 두 군데 하드코딩하지 않는다.

---

## Planning Recommendations

권장 plan 분할:

1. **Access-boundary choice checkpoint** — 이 리서치의 A/B 비교를 사용자에게 제시하고 명시적 선택을 기록. 선택 전 migration 확정 금지.
2. **Schema + security boundary** — `chapter_unlocks`와 선택된 A(column grants + reader/owner RPC) 또는 B(`chapter_bodies` + RLS), 기존 reader/Studio read path 전환, content-leak 테스트.
3. **Atomic settlement** — `unlock_paid_chapter()`, 멱등 reference, 90/10 snapshot, insufficient/price-change/self-owner 처리, 동시성 테스트.
4. **Reusable unlock UI + D-12** — 모달 상태 머신, viewer/TOC/work-detail CTA, 가격 표시, login/callback/complete-email return-path, 즉시 본문 갱신.
5. **Phase 5 chaining** — payment provider 승격, URL resume marker, 탭 복원, top-up completion → confirm 복귀.
6. **End-to-end verification** — free/paid/owned/insufficient/login-return/top-up/double-click/direct API leak 전 흐름과 build 검증.

선택 checkpoint가 끝난 뒤 access boundary와 unlock schema를 같은 migration에 넣을 수 있지만 테스트 목적은 분리하는 편이 좋다. Atomic settlement와 기본 unlock UI는 Phase 5 없이도 fake balance로 대부분 검증할 수 있으나 top-up chaining/E2E는 Phase 5 구현 완료가 선행 조건이다.

### Decisions resolved by this research

| Context discretion | Recommendation |
|---|---|
| 독자 debit + 작가 credit 원자성 | 신규 `unlock_paid_chapter()` RPC 내부에서 기존 `apply_wallet_delta()` 두 번 호출 |
| 언락 추적 스키마 | UUID 구매 ID + `(reader_id, chapter_id)` UNIQUE + 가격/분배/작가 snapshot |
| 멱등성 reference | 두 ledger entry 모두 `chapter_unlocks.id`; type만 debit/author_credit로 구분 |
| 작가 본인 열람 | 무료 허용, settlement/unlock row 없음 |
| 비로그인 클릭 | D-12: 공용 내부 return-path 검증 + OAuth callback/이메일 보완 단계까지 `next` 보존 + `unlock` 확인 모달 복귀 |
| 플랫폼 10% | 별도 wallet 없이 unlock snapshot에 명시 기록 |
| 충전 후 복귀 | 단일 payment provider + `unlock=<chapterId>` URL intent + credit 후 quote 재조회/confirm 재오픈 |

---

## Sources

### Repository and installed framework docs

- `06-CONTEXT.md` — phase decisions and deferred scope.
- `supabase/migrations/0001_init.sql` — wallet/ledger and `apply_wallet_delta()`.
- `supabase/migrations/0002_studio.sql`, `0003_reader.sql` — chapters schema and public RLS.
- `lib/chapters/actions.ts` — current global paid lock calculation.
- `components/reader/viewer-shell.tsx`, `toc-sheet.tsx`, `app/works/[workId]/page.tsx` — three unlock entry surfaces.
- `.planning/phases/05-real-payment-integration/05-RESEARCH.md`, `05-UI-SPEC.md` — top-up return/polling contract.
- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` — Next.js 16.3.2 Server Action security, sequential dispatch, single-response mutation behavior.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/refresh.md` — `refresh()` is Server-Action-only; client top-up flow must use router refresh if needed.

### External primary sources (verified 2026-09-08)

- [PostgreSQL — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — row locks, deadlock detection, consistent lock ordering recommendation.
- [PostgreSQL — INSERT](https://www.postgresql.org/docs/current/sql-insert.html) — `ON CONFLICT`, unique-index conflict behavior under concurrency.
- [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions) — database functions, `SECURITY INVOKER`/`SECURITY DEFINER`, safe `search_path`, function execute privileges.
- [Supabase — Column Level Security](https://supabase.com/docs/guides/database/postgres/column-level-security) — table privilege 회수 후 필요한 column privilege만 부여하는 패턴과 `select *` 영향.
- [PostgreSQL — CREATE VIEW](https://www.postgresql.org/docs/current/sql-createview.html) — `security_invoker`가 base relation 권한을 view 호출자 기준으로 검사한다는 정의.
- [Supabase — Tables and Views](https://supabase.com/docs/guides/database/tables) — view의 기본 creator 권한 실행과 `security_invoker` 설정, 민감 컬럼을 제외한 view 사용법.
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — definer view의 기본 RLS 우회 경고, exposed table grant/RLS 테스트, 정책 인덱스 및 `(select auth.uid())` 성능 지침.
- [Supabase — Auth Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) — OAuth `redirectTo`와 allow-list 요구사항, production exact redirect URL 권고.

---

*Phase: 06-paid-chapter-unlock*  
*Research complete: 2026-09-08*

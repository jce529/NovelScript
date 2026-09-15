# 구매 및 열람 권한 구현

## 1. 기존 구조 분석과 적용 범위

- DB: Supabase PostgreSQL. `drizzle-orm`은 설치되어 있지만 실제 데이터 계층은 Supabase JS와 SQL RPC다.
- User: Supabase Auth의 `auth.users.id`와 동일한 `profiles.id`를 재사용한다. 계정의 `deleted_at`도 검사한다.
- Work / Episode: `works`와 `chapters.work_id`의 기존 1:N 관계, 메타데이터, 작가 편집·폴더 구조를 유지한다.
- 결제: 기존 `wallets` / `ledger_entries` 토큰 지갑을 재사용한다. 외부 PG나 실제 화폐 충전은 이번 범위가 아니다.
- 구조·컨벤션: `lib/<domain>/actions.ts`, SupabaseClient 주입, camelCase TypeScript / snake_case SQL, Zod 검증, `{ ok, error }` 반환, 한국어 UI를 따른다.
- migration: 기존 `supabase/migrations/0001..0004` 다음에 `0005_commerce.sql`을 추가한다.
- 테스트: 기존 Vitest를 사용한다. 새 패키지는 설치하지 않았다.

구현 순서: 추가 테이블·DB 권한 → 주문/결제 RPC → 열람 서비스 → 작가·뷰어 연결 → 테스트와 문서.
기존 가격이 회차별 `price_tier`이므로 현재 판매 UI는 **회차 영구 소장**이다. 복수 회차 주문 API와 작품 전체/기간제 권한 모델은 지원하되 작품 전체 판매 가격을 임의로 만들지 않았다.

## 2. 추가·수정 파일

| 파일 | 역할 |
| --- | --- |
| `supabase/migrations/0005_commerce.sql` | 주문·항목·권한 테이블, RLS, RPC, 본문 컬럼 권한 |
| `lib/commerce/actions.ts` | 주문 생성·결제 서비스, 입력 검증·오류 메시지 |
| `lib/access/actions.ts` | 세션 기반 canView, 보호된 본문 조회 |
| `lib/chapters/actions.ts` | 본문 RPC 및 목차 권한 일괄 조회 |
| `app/works/[workId]/chapters/[chapterId]/actions.ts` | 구매 Server Action, 읽기 진행 권한 재검증 |
| `app/works/[workId]/chapters/[chapterId]/page.tsx` | 작품·회차 URL 관계 검증 |
| `components/reader/viewer-shell.tsx` | 가격 표시, 구매 버튼, 중복 클릭 방지, 오류·재시도 |
| `app/studio/[workId]/chapters/[chapterId]/actions.ts` | 작가 본문 조회 RPC 전환 |
| `tests/commerce/actions.test.ts` | 서비스·권한 경계 단위 테스트 |
| `tests/commerce/database.test.ts` | 별도 스키마와 전체 롤백을 사용하는 PostgreSQL 통합 테스트 |
| `docs/commerce-entitlements.md` | 분석·설계·적용·검증 보고 |
| `graphify-out/*` | 코드 그래프 갱신 및 도구가 생성한 백업 |

## 3. DB 관계, PK / FK / Index

```text
auth.users ─ profiles ─┬─ orders ─< order_items
                      └─ entitlements >─ works ─< chapters
                              └─ order_item_id (구매 출처)
```

신규 테이블 PK는 모두 UUID `id`다. 코드의 orderId, entitlementId 등은 이 ID를 의미한다.

| 테이블 | 주요 필드·제약 |
| --- | --- |
| orders | user_id → profiles, status(PENDING/PAID/CANCELLED/REFUNDED), total_amount bigint, currency TOKEN, created_at, paid_at, idempotency_key |
| order_items | order_id → orders, work_id → works, nullable chapter_id, purchase_type, price bigint, conditions JSONB |
| entitlements | user_id → profiles, work_id → works, nullable chapter_id, entitlement_type, starts_at, expires_at, source_type, source_id, nullable order_item_id → order_items, revoked_at |

- `orders(user_id, idempotency_key)` UNIQUE: 같은 사용자의 요청 재시도 식별.
- `orders(user_id, created_at DESC)`: 사용자 주문 내역.
- `order_items(order_id)`: 주문의 여러 항목 조회.
- `order_items(order_id, chapter_id)` UNIQUE: 같은 회차의 주문 내 중복 방지.
- `chapters(id, work_id)` UNIQUE와 `(chapter_id, work_id)` 복합 FK: 다른 작품의 회차를 연결할 수 없다.
- `entitlements(user_id, work_id, chapter_id) WHERE revoked_at IS NULL`: 빈번한 권한 조회.
- `entitlements(order_item_id)` UNIQUE: 구매 항목마다 최대 한 번 발급.
- 영구 권한은 `expires_at = NULL`, 기간제는 `expires_at > starts_at` CHECK.
- `chapter_id = NULL`은 작품 전체 권한이며 이후 공개되는 회차에도 적용된다.
- 작품 생성 시 권한을 생성하는 트리거나 전체 사용자 조합 생성은 없다.
- 거래·권한 FK는 삭제 시 cascade하지 않는다. 기존 소프트 삭제 모델을 유지하고 거래 기록을 보존한다.

## 4. 구매 처리 흐름

1. Server Action에서 인증을 확인한다. DB는 `auth.uid()`로 다시 검증하며 caller userId를 신뢰하지 않는다.
2. `create_purchase_order(chapter_ids, idempotency_key)`가 1~100개 중복 없는 유료 공개 회차를 검증한다.
3. 현재 DB 가격과 제목·TOKEN 통화·회차 범위·영구 소장 조건을 각 OrderItem에 복사하고 PENDING 주문을 만든다.
4. `pay_purchase_order(order_id)`가 소유자·PENDING 상태·콘텐츠 공개 상태·기존 권한을 확인한다.
5. 저장된 주문 총액으로 지갑을 차감하고 PAID 및 paid_at을 기록한다.
6. 각 OrderItem에서 Entitlement를 발급하고 뷰어를 새로 고친다.

잔액 부족은 PENDING 주문을 남기며 재시도할 수 있다. 동일 키에 다른 항목을 보내면 거부한다.
같은 PAID 주문의 재호출은 추가 차감·발급을 하지 않는다. 서로 다른 주문으로 같은 회차를 재구매하는 경우도 지갑 잠금 아래 권한을 재검사하여 차단한다.

## 5. Entitlement 생성 및 검사

- 구매 발급은 결제 RPC 내부에서만 수행한다. source_type은 ORDER_ITEM, source_id와 order_item_id는 구매 항목 ID다.
- 읽기 정책은 Order나 OrderItem을 검색하지 않는다.
- `can_view(work_id, chapter_id?)`: 작품/회차 존재·공개 상태 → 기본 무료 여부 → 활성 사용자 → 범위가 맞는 권한 → revoked_at 없음 → starts_at <= now() → expires_at NULL 또는 > now().
- `canView`의 사용자 인수는 인증된 SupabaseClient 세션으로 대체한다. 다른 사용자 ID를 주입할 수 없다.
- 회차 없는 Work 검사에서는 작품 전체 권한만 확인한다. 기존 무료 정책은 회차별이므로 무료 회차 열람은 chapterId와 함께 검사한다.
- 기간 만료 경계는 DB 시각으로 판정하며 만료 시각과 같으면 거부한다.
- `read_chapter_content`는 같은 정책으로 본문을 반환한다. 활성 작가는 자기 작품의 초안과 유료 회차를 읽을 수 있다.
- `list_chapter_access`는 목차 전체의 권한을 한 번에 반환한다. 권한 결과를 장기 캐시하지 않는다.

## 6. DB 접근 보호와 기존 기능 유지

기존 `chapters_public_read`는 모든 공개 회차의 행을 노출했다. 앱에서 content를 null로 바꾸는 것만으로 직접 API 조회를 막을 수 없었다.

이번 변경은 anon/authenticated의 **본문 SELECT 권한**을 회수하고 기존 메타데이터 컬럼 SELECT를 유지한다. 공개 목록·검색·조회수 집계의 기존 쿼리는 유지된다. 본문은 권한 검사 RPC를 거치며 작가 편집 화면도 이 경로로 전환했다. 본문 UPDATE는 기존 작가 RLS를 그대로 사용한다.

신규 세 테이블은 RLS로 본인 기록만 읽을 수 있고 브라우저 역할의 쓰기는 금지한다. SECURITY DEFINER RPC는 고정 search_path와 auth.uid() 검사를 사용한다. 기존 `apply_wallet_delta`의 임의 잔액 조작을 막기 위해 anon/authenticated/PUBLIC 실행권을 회수하고 service_role만 유지했다. 서버의 기존 AI 지갑 처리는 유지된다.

## 7. 트랜잭션 경계

- migration 파일 자체는 BEGIN/COMMIT으로 원자적으로 적용된다.
- 주문 생성 RPC는 주문과 모든 항목을 한 트랜잭션에서 만든다.
- 결제 RPC는 **지갑/원장 차감 + PAID 변경 + 전체 권한 발급**을 한 트랜잭션에서 처리한다. 권한 INSERT가 실패하면 차감과 상태 변경도 롤백된다.
- 사용자 프로필 SHARE 잠금, 사용자 지갑 UPDATE 잠금, 주문 UPDATE 잠금과 콘텐츠 SHARE 잠금을 사용한다.
- 동일 사용자의 결제를 지갑 잠금으로 직렬화하여 서로 다른 주문을 통한 중복 소장을 막는다.
- 외부 결제망 호출은 없다. 이후 PG를 붙일 경우 인증된 결제 이벤트·금액 검증·event ID 멱등성과 outbox/재처리를 추가해야 한다.

## 8. 테스트 및 적용 상태

- 서비스 단위 테스트 11개 통과: 잘못된/중복/초과 항목, 서버 가격·사용자 경계, 재시도 ID, 잔액 부족, 내부 오류 비노출, 권한 검사 실패 처리, 빈 본문과 잠금 구분.
- TypeScript `npx tsc --noEmit` 통과.
- 변경 파일 ESLint와 `git diff --check` 통과.
- 기존 이메일 인증 경계·세션 갱신·AI 비용 계산 회귀 테스트를 포함한 실행 결과: **26개 통과, DB 테스트 10개 skip**.
- 프로덕션 빌드는 네트워크 허용 후 컴파일·TypeScript 검사까지 성공했다. Supabase 공개 URL/API 키가 없어 기존 `/login` 사전 렌더링에서 실패했다. 전체 빌드 성공으로 판정하지 않는다.
- DB 통합 테스트 10개 작성. SUPABASE_DB_URL이 없어 최초 실행은 연결 실패했고, 사용자 요청에 따라 **미실행으로 남겼다**. 현재 설정이 없으면 명시적으로 skip한다.
- DB 테스트 범위: sparse/free, 다항목 가격 snapshot, 멱등성, 권한 INSERT 실패 롤백, 잔액 부족, 타인 주문, 본문 직접 조회·권한 위조·지갑 조작 차단, 기간·회수·작품 권한, 작가 초안·탈퇴 계정, 경쟁 주문.
- PostgreSQL 잠금의 실제 동시 세션 경합은 아직 검증하지 않았다. 통합 테스트의 경쟁 주문 시나리오는 순차 처리 검증이다.
- 실제 DB에 migration을 적용하지 않았다. 외부 DB/API 기반 기존 통합 테스트와 브라우저 구매 E2E도 실행하지 않았다.
- `graphify update .` 완료. SQL 파서 `tree_sitter_sql`이 없어 SQL 파일은 그래프 추출에서 제외됐다.

적용 시 기존 0001~0004가 적용된 DB에 아래 명령으로 0005를 한 번 실행하고 앱 변경을 함께 배포한다. 본문 컬럼 권한 변경이 있으므로 구버전 앱과 혼용하지 않는다.

```powershell
node --env-file=.env.local scripts/apply-migration.mjs 0005_commerce.sql
npx vitest run tests/commerce
```

## 9. 확장 지점

- Subscription / Promotion / Wait-Free: 검증된 서버 발급 서비스에서 source_type/source_id와 유효 기간을 넣는다. can_view는 구매 방식과 무관하므로 수정 없이 시간·범위를 판정한다. 기존 work_subscriptions는 새 회차 알림 기능이며 유료 구독과 혼동하지 않는다.
- Rental: 상품 조건에 기간을 snapshot하고 결제 시 expires_at을 계산한다. 기간별 가격·중복/연장 정책은 별도 추가한다.
- Work 단위 판매: 작품 상품/가격을 추가하고 chapter_id NULL인 항목과 권한을 발급하도록 주문 RPC를 확장한다. 현재 판매 RPC는 회차 전용이다.
- Episode: 기존 chapters가 회차 엔티티다. 별도 Episode 테이블이나 변환은 필요 없다.
- Bundle: 기존 다항목 주문을 활용하고 bundle ID·가격 배분 조건을 snapshot한다.
- Refund: 별도 환불 서비스에서 원장 환급·REFUNDED 변경·해당 order_item_id 권한의 revoked_at 갱신을 원자적으로 처리한다. 다른 출처 권한을 삭제해서는 안 된다. 현재 환불/취소 API는 구현하지 않았다.

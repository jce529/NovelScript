---
phase: 10
slug: byok
status: in-review
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-30
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.11 (node environment) |
| **Config file** | `vitest.config.ts` (env 로드, `server-only` 스텁) |
| **Quick run command** | `npx vitest run tests/ai/provider-selection.test.ts tests/ai/byok-validation.test.ts tests/ai/byok-actions.test.ts tests/ai/provider-settings.test.ts` |
| **Full suite command** | `npm test` (`vitest run`) + `npx tsc --noEmit` + `npm run lint` |
| **Estimated runtime** | ~40 seconds (DB 테스트 포함) |

---

## Sampling Rate

- **After every task commit:** 해당 task의 `<automated>` 명령(대상 테스트 파일만)
- **After every plan wave:** `npm test` + `npx tsc --noEmit`
- **Before `/gsd:verify-work`:** 전체 스위트 green, `byok-db.test.ts` skipped 0, 브라우저 UAT(Plan 06 Task 2) 승인
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-00-01 | 00 | 0 | BYOK-01, BYOK-03 (D-01) | T-10-00-01/02 | 프로브는 ROLLBACK, 비밀·접속 문자열 미출력 | probe | `node --env-file=.env.local scripts/probe-vault.mjs && grep -c "^RESULT=" .planning/phases/10-byok/10-VAULT-PROBE.md` | ❌ W0 | ✅ green |
| 10-00-02 | 00 | 0 | BYOK-01~04, PROV-05 | T-10-00-03 | sentinel 키가 출력에 없음을 단언하는 RED 스위트 | unit (RED) | `npx vitest run tests/ai/provider-selection.test.ts tests/ai/byok-validation.test.ts tests/ai/byok-actions.test.ts` (resolve 오류로 실패가 정상) | ❌ W0 | ✅ green |
| 10-01-01 | 01 | 1 | BYOK-01, BYOK-03 (D-02, D-07) | T-10-01-01~05 | service_role 전용 함수, secret_id 컬럼 비노출, 컬럼 grant 갱신 | static | `grep -v '^--' supabase/migrations/0014_byok_keys.sql \| grep -c "security definer"` | ❌ W0 | ✅ green |
| 10-01-02 | 01 | 1 | BYOK-01, BYOK-03, BYOK-04 (D-01, D-02, D-07, D-09) | T-10-01-01~07 | 실 DB: 원자적 등록/삭제, ACL 거부, 제한 윈도우 | integration (live DB) | `node --env-file=.env.local scripts/apply-migration.mjs 0014_byok_keys.sql && npx vitest run tests/ai/byok-db.test.ts --reporter=verbose` | ❌ W0 | ✅ green |
| 10-01-03 | 01 | 1 | BYOK-01 | T-10-01-SC | DB 접속 불가 시에만 사람이 복구 (체크포인트) | manual | Plan 01 Task 2 명령 재실행 | n/a | ✅ n/a (원격 적용 2회·byok-db 13/13 통과) |
| 10-02-01 | 02 | 1 | PROV-05 (D-04, D-05, D-06, D-09) | T-10-02-02 | 정확 일치 교집합, legacy 2-part=service, 삭제 대체 규칙 | unit | `npx vitest run tests/ai/provider-selection.test.ts` | ❌ W0 | ✅ green |
| 10-02-02 | 02 | 1 | BYOK-02 (D-11, D-12) | T-10-02-01/03/04 | 무과금 models.list, 5분류, fail closed, 오류 누출 없음 | unit | `npx vitest run tests/ai/byok-validation.test.ts` | ❌ W0 | ✅ green |
| 10-03-01 | 03 | 2 | BYOK-01~04 (D-02, D-03, D-08, D-09, D-11) | T-10-03-01~06 | 검증 성공 후에만 저장, 평문 미반환·미로그, 재확인 throttled(claim_byok_validation)·상태 규칙 | unit (mocked rpc) | `npx vitest run tests/ai/byok-actions.test.ts` | ❌ W0 | ✅ green |
| 10-03-02 | 03 | 2 | PROV-05 (D-05, D-06, D-07) | T-10-03-07 | keySource 저장/복원, 무효 byok 기본값은 service로 다운그레이드, 3컬럼 update | unit | `npx vitest run tests/ai/provider-settings.test.ts && npx tsc --noEmit` | ✅ 확장 | ✅ green |
| 10-04-01 | 04 | 3 | BYOK-01~04 | T-10-04-01~03 | 액션 내 재인증·writer·zod, 정제된 반환 | unit | `npx vitest run tests/ai/byok-settings-actions.test.ts && npx tsc --noEmit` | ❌ (Plan 04 tdd) | ✅ green |
| 10-04-02 | 04 | 3 | BYOK-02, BYOK-03, BYOK-04 (D-03, D-08, D-13) | T-10-04-01/04/06 | 마스킹 정보만, 원인별 오류 role=alert, 삭제 다이얼로그 카피, 자동 재검증 없음 | unit (markup) | `npx vitest run tests/ai/byok-settings-ui.test.ts && npx eslint app/studio/settings/ai-providers` | ❌ (Plan 04 tdd) | ✅ green |
| 10-04-03 | 04 | 3 | BYOK-01, PROV-05 (D-06, D-07, D-10) | T-10-04-01 | 설정 페이지 통합, source-aware 기본값 셀렉트 | unit + typecheck | `npx tsc --noEmit && npx vitest run tests/ai/byok-settings-actions.test.ts tests/ai/byok-settings-ui.test.ts tests/ai/provider-settings.test.ts` | ✅ | ✅ green |
| 10-05-01 | 05 | 3 | PROV-05 (D-06) | T-10-05-01/03 | byok는 createPlatformProvider 이전 차단, legacy 입력은 service | unit | `npx vitest run tests/ai/chat-action.test.ts tests/ai/chat-request-lifecycle.test.ts` | ✅ 확장 | ✅ green |
| 10-05-02 | 05 | 3 | PROV-05 (D-04, D-05, D-06) | T-10-05-03/05 | 배지·항목 분리·검증 실패 항목 숨김·byok 전송 비활성 | unit (markup) | `npx tsc --noEmit && npx vitest run tests/ai/ai-panel-model.test.ts tests/ai/chat-action.test.ts` | ✅ 확장 | ✅ green |
| 10-06-01 | 06 | 4 | BYOK-01~04, PROV-05 | T-10-06-01/03/04 | 전체 게이트, 평문 누출 정적 검사, VALIDATION 확정 | full suite | `npx tsc --noEmit && npm run lint && npm test` | ✅ | ✅ green |
| 10-06-02 | 06 | 4 | BYOK-01~04, PROV-05 (D-01~D-13) | T-10-06-02/04 | 라이브 제공자 키 + 브라우저 UAT | manual (human-verify) | Plan 06 Task 2 how-to-verify | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### CONTEXT 결정 → 검증 매핑

| 결정 | 검증 위치 |
|------|-----------|
| D-01 Vault | 10-00-01, 10-01-02, UAT 9 |
| D-02 masked_hint + service_role 복호화 | 10-01-01/02, 10-03-01 |
| D-03 수동 재확인만 | 10-03-01, 10-04-02 (setInterval/setTimeout 무매치), UAT 5 |
| D-04 카탈로그 ∩ 응답 | 10-02-01, 10-02-02, 10-05-02 |
| D-05 항목 분리·배지·검증 실패 숨김·토글 없음 | 10-02-01, 10-05-02, UAT 7, 10 |
| D-06 선택 값 keySource 확장 | 10-02-01, 10-05-01/02 |
| D-07 기본값 저장 형태 + grant | 10-01-02 (authenticated UPDATE), 10-03-02 |
| D-08 삭제 영향 안내 | 10-04-02, UAT 8 |
| D-09 삭제 시 기본값 대체·고아 비밀 금지 | 10-01-02, 10-02-01, 10-03-01, UAT 8/9 |
| D-10 3개 제공자·설정 페이지 합류 | 10-04-02/03, UAT 2 |
| D-11 등록 한 번에 검증+저장, 평문 비노출 | 10-02-02, 10-03-01, UAT 3/4 |
| D-12 원인별 한국어 오류 | 10-02-02, 10-04-02, UAT 3 |
| D-13 카드 표시 정보 | 10-04-02, UAT 4 |

---

## Wave 0 Requirements

- [x] `scripts/probe-vault.mjs` + `10-VAULT-PROBE.md` — Vault 시그니처/권한 확정 (RESEARCH Open Question 1)
- [x] `tests/ai/provider-selection.test.ts` — PROV-05 (선택 코덱, 피커 항목, 삭제 대체)
- [x] `tests/ai/byok-validation.test.ts` — BYOK-02 (3개 lister, 오류 분류, 페이지 순회/fail closed, 문구)
- [x] `tests/ai/byok-db.test.ts` — BYOK-01/03/04 (실 DB Vault 원자성, ACL, grant, 기본값 대체)
- [x] `tests/ai/byok-actions.test.ts` — BYOK-01~04 (서비스 로직, 평문 비노출)
- 프레임워크 설치 없음: 기존 Vitest 재사용. Plan 04에서 tdd로 만드는 `byok-settings-actions.test.ts` / `byok-settings-ui.test.ts`는 각 task가 테스트를 먼저 작성한다.

---

## 실행 결과 (Plan 06 Task 1, 2026-09-30)

| 게이트 | 결과 |
|--------|------|
| `npx tsc --noEmit` | 통과 (exit 0) |
| `npm run lint` | 통과 — 0 errors (기존 warning 6건만). 테스트 3개 파일의 `no-explicit-any` 26건 수정 |
| `byok-db.test.ts` | 13 passed / failed 0 / skipped 0 |
| 평문 누출 정적 검사 | `console.`(byok*.ts, ai-providers), `getByokSecret`/`get_byok_secret`(app, components), `secret_id`(app, components) 모두 무매치 |
| `scripts/verify-byok-live.mjs` | 유효 키(플랫폼 서비스 키를 환경변수로 사용, 무과금 models.list): openai ok models=2, anthropic ok models=1, gemini ok models=1. 임의 키: 3개 제공자 모두 `invalid`. RESULT=PASS (UAT 1단계 완료) |
| `npm test` 전체 | 통과 (exit 0) — 96 files / 996 tests passed, skipped 0 (기본 병렬 실행) |

### 함께 정리한 Phase 10 밖의 기존 실패 4건

| 테스트 | 원인 → 수정 |
|--------|-------------|
| `tests/auth/writer-upgrade.test.ts` | 고정 필명이 원격 DB의 잔여 행과 충돌 → 실행마다 고유 필명 사용 |
| `tests/works/work-crud.test.ts` | Phase 15 BUG-03(0012)로 템플릿 카테고리 폴더 5개 추가 → 기대값 12→17 (폴더 12 + 파일 5) |
| `tests/studio/schema-smoke.test.ts` (2) | 자체 begin/commit 마이그레이션을 풀 연결로 실행해 `UNSAFE_TRANSACTION`, 이어서 deadlock → 예약(reserved) 연결에서 실행 |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 실제 제공자 키의 models-list 검증 성공/실패 분류 (무과금) | BYOK-02 | 실 키·벤더 응답 필요 | `node --env-file=.env.local scripts/verify-byok-live.mjs` (키는 환경변수, 출력에 키 없음) |
| 등록 -> 카드 -> 피커 배지 -> BYOK 전송 차단 -> 삭제 -> 기본값 대체 | BYOK-01~04, PROV-05 | 브라우저 UX·포커스·접근성, Phase 9 교훈(모킹은 grant/실계약 위반을 못 잡음) | Plan 06 Task 2의 12단계 |
| Vault에 삭제된 키 비밀이 남지 않음 | BYOK-04 (D-09) | 대시보드 관찰 | Plan 06 Task 2 단계 9 (+ 자동: byok-db가 `vault.secrets` 카운트 단언) |
| 서비스 키 모델 '실제 호출 가능' 범위 | PROV-05 | 서비스 키 계정 권한은 코드로 확인 불가 | **명시적 범위 결정**: 서비스 키 항목은 정적 카탈로그(Phase 9 운영 게이트: 09-VERIFICATION/STATE Blockers)를 따른다. 실시간 서비스 키 권한 검사는 이 phase에 포함하지 않는다. BYOK 항목만 키 응답으로 필터링(D-04) |
| 목록 성공이 곧 생성 가능 권한이라는 보장 없음 | BYOK-02 | 벤더 정책 | Phase 11이 호출 실패를 별도 분류한다 (RESEARCH A4, 근사치 사용 명시) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 45s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `byok-db.test.ts` skipped 0 (스킵은 검증이 아님)

**Approval:** pending — 자동 게이트 통과, 라이브 키·브라우저 UAT(Plan 06 Task 2) 승인 대기

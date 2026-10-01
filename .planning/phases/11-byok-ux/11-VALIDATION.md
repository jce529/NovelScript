---
phase: 11
slug: byok-ux
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-01
---

# Phase 11 — Validation Strategy

> 실행 중 피드백 샘플링을 위한 페이즈별 검증 계약. `11-RESEARCH.md`의 Validation Architecture를 기준으로 한다.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.11 + Supabase DB integration + browser UAT |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai/provider-errors.test.ts tests/ai/byok-generation.test.ts tests/ai/ai-usage.test.ts --no-file-parallelism` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | quick ~30초, full ~120초 |

---

## Sampling Rate

- **After every task commit:** 해당 task의 `<verify><automated>` 명령 실행
- **After every plan wave:** `npx vitest run tests/ai --no-file-parallelism`
- **Before `/gsd:verify-work`:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `graphify update .`가 모두 통과해야 함
- **Max feedback latency:** 60초. 60초를 넘는 DB/full gate는 plan 또는 wave 종료 시 별도 실행

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | COST-02 | T-11-01, T-11-02 | owner-only read, service-role-only write, prompt/response 컬럼 없음 | DB integration | `npx vitest run tests/ai/ai-usage-db.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 1 | BYOK-07, COST-02 | T-11-03 | KST `[start,end)` 집계, best-effort insert, 중복 1행 | unit | `npx vitest run tests/ai/ai-usage.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | COST-02 | T-11-01 | 원격 migration 적용 뒤 RLS/grant/RPC 검증에서 skipped 0 | DB integration | `npx vitest run tests/ai/ai-usage-db.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | BYOK-05 | T-11-04 | raw SDK error/message/key 비노출, allowlist 분류 | unit | `npx vitest run tests/ai/provider-errors.test.ts --no-file-parallelism` | ✅ extend | ⬜ pending |
| 11-02-02 | 02 | 1 | BYOK-05 | T-11-05 | OpenAI/Anthropic SDK 내부 자동 retry 0회 | unit | `npx vitest run tests/ai/provider-openai.test.ts tests/ai/provider-anthropic.test.ts tests/ai/provider-gemini.test.ts --no-file-parallelism` | ✅ extend | ⬜ pending |
| 11-03-01 | 03 | 2 | PROV-06, BYOK-06 | T-11-06, T-11-07 | 서버가 owner/provider/model/key 상태를 재도출하고 secret을 DTO/로그에 노출하지 않음 | lifecycle unit | `npx vitest run tests/ai/byok-generation.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 11-03-02 | 03 | 2 | BYOK-05 | T-11-08 | stale invalid-key 응답이 재등록된 새 key id를 failed 처리하지 않음 | DB/unit | `npx vitest run tests/ai/byok-generation.test.ts tests/ai/ai-usage-db.test.ts --no-file-parallelism` | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 3 | BYOK-06, BYOK-09 | T-11-06 | 잔액 0 BYOK 성공, wallet read/cap/debit/RPC 0회, BYOK 8192/서비스 2048 | lifecycle unit | `npx vitest run tests/ai/byok-generation.test.ts tests/ai/paid-generation.test.ts --no-file-parallelism` | ❌ W0 / ✅ extend | ⬜ pending |
| 11-04-02 | 04 | 3 | COST-02 | T-11-02, T-11-03 | 성공·보고된 거절만 기록하고 기록 실패는 생성을 막지 않음 | lifecycle unit | `npx vitest run tests/ai/ai-usage.test.ts tests/ai/paid-generation.test.ts --no-file-parallelism` | ❌ W0 / ✅ extend | ⬜ pending |
| 11-05-01 | 05 | 4 | PROV-06, BYOK-05, BYOK-06 | T-11-06, T-11-07 | chat action이 클라이언트 keySource를 신뢰하지 않고 unavailable BYOK는 provider 호출 전 중단 | action unit | `npx vitest run tests/ai/chat-action.test.ts tests/ai/byok-generation.test.ts --no-file-parallelism` | ✅ extend / ❌ W0 | ⬜ pending |
| 11-05-02 | 05 | 4 | COST-02, BYOK-09 | T-11-03 | chat/document plan/regeneration 모두 공통 route/preflight/settle과 usage refs 사용 | integration unit | `npx vitest run tests/ai/document-regenerate.test.ts tests/ai/paid-generation.test.ts tests/ai/ai-usage.test.ts --no-file-parallelism` | ✅ extend / ❌ W0 | ⬜ pending |
| 11-06-01 | 06 | 5 | BYOK-05, BYOK-08 | T-11-04 | 네 실패 문구가 정제된 kind에서만 생성되고 invalid만 설정 링크를 제공 | component/unit | `npx vitest run tests/ai/chat-request-lifecycle.test.ts tests/ai/ai-panel-notice.test.ts --no-file-parallelism` | ✅ extend | ⬜ pending |
| 11-06-02 | 06 | 5 | PROV-06, BYOK-08 | T-11-07 | 명시 동의 전 전송 없음, 동일 idempotency snapshot, 취소 초기 focus | component/unit | `npx vitest run tests/ai/ai-panel-model.test.ts tests/ai/ai-panel-notice.test.ts tests/ai/chat-action.test.ts --no-file-parallelism` | ✅ extend | ⬜ pending |
| 11-07-01 | 07 | 2 | BYOK-07 | T-11-01, T-11-09 | 서버 DAL이 owner-scoped 최소 DTO만 반환하고 조회 실패를 카드 오류 값으로 격리 | unit | `npx vitest run tests/ai/ai-usage.test.ts tests/ai/byok-settings-ui.test.ts --no-file-parallelism` | ❌ W0 / ✅ extend | ⬜ pending |
| 11-07-02 | 07 | 2 | BYOK-07 | T-11-09 | 등록·failed 카드에만 KST 합계/정렬 상세를 표시하고 금액은 렌더하지 않음 | component/unit | `npx vitest run tests/ai/byok-settings-ui.test.ts --no-file-parallelism` | ✅ extend | ⬜ pending |
| 11-08-01 | 08 | 6 | PROV-06, BYOK-05~09, COST-02 | T-11-01~T-11-09 | 전 요구사항 자동 회귀 및 비밀/원문 누출 정적 게이트 | full suite | `npm test && npx tsc --noEmit && npm run lint` | ✅ | ⬜ pending |
| 11-08-02 | 08 | 6 | PROV-06, BYOK-05~09, COST-02 | T-11-04, T-11-07, T-11-09 | 실제 브라우저에서 focus/alert/retry/동의/0잔액/mobile을 확인 | browser UAT | `npx vitest run tests/ai --no-file-parallelism` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/ai/byok-generation.test.ts` — PROV-06, BYOK-05, BYOK-06, BYOK-09 lifecycle 계약
- [ ] `tests/ai/ai-usage.test.ts` — COST-02 insert/idempotency/best-effort 및 BYOK-07 KST 집계 계약
- [ ] `tests/ai/ai-usage-db.test.ts` — schema/RLS/grant/unique/FK/index/comment/conditional RPC 계약
- [ ] 기존 `tests/ai/provider-errors.test.ts`, `tests/ai/chat-action.test.ts`, `tests/ai/paid-generation.test.ts`, `tests/ai/document-regenerate.test.ts`, `tests/ai/ai-panel-model.test.ts`, `tests/ai/ai-panel-notice.test.ts`, `tests/ai/byok-settings-ui.test.ts`에 Phase 11 회귀 케이스 추가

새 테스트 프레임워크나 패키지는 필요하지 않다. 각 구현 task가 `tdd="true"`로 해당 계약을 먼저 실패시키고 같은 task 안에서 green으로 만든다.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 대체 동의 카드의 정확한 문구, `role="alert"`, [취소] 초기 focus, 버튼 없이 전송 없음 | PROV-06 | 실제 브라우저 focus 이동과 Server Action 전송 유무 확인 필요 | 삭제/failed BYOK를 선택한 채 전송 → 카드 확인 → Enter/Space로 취소 → 다시 열어 명시 버튼으로만 서비스 키 전송 |
| 네 실패 카드의 버튼·focus·새로고침 후 피커 상태 | BYOK-05 | provider fixture와 브라우저 라우트 refresh 상호작용 | invalid/rate/credit/unavailable fixture별 전송 후 문구와 focus, invalid만 피커에서 사라지는지 확인 |
| 잔액 0 계정의 BYOK 실제 호출과 원장 0행 | BYOK-06 | 실제 DB 계정·벤더 키·원장 관측 필요 | 잔액 0 테스트 작가 + 유효 BYOK로 성공 호출 후 ledger_entries에 해당 idempotency 행이 없는지 조회 |
| 모델 선택 전환 시 비용 표시/안내와 8192 smoke | BYOK-08, BYOK-09 | 실제 picker/벤더 request shape 확인 | 서비스↔BYOK 전환 시 즉시 문구 교체, 세 provider smoke에서 max output 파라미터 확인 |
| 설정 카드 desktop/mobile, empty/error/failed 상태, keyboard toggle | BYOK-07 | 반응형 wrap·ARIA 토글·시각 계층 확인 | 3개 제공자 카드에서 합계/상세 정렬·빈 상태·오류 상태를 375px/desktop에서 확인 |
| 세 제공자 실제 error shape 보조 probe | BYOK-05 | credit/rate 상황은 안정적 재현이 어려움 | 비밀을 출력하지 않는 probe로 성공/401과 가능한 live shape를 확인하고, 재현 불가 항목은 structured fixture를 주 증거로 기록 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for task-level commands
- [ ] DB gate passes with skipped 0 after `supabase db push`
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

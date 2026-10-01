---
phase: 15
slug: jev-ai
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-23
updated: 2026-09-27
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai --no-file-parallelism` |
| **Full suite command** | `npx vitest run --no-file-parallelism && npx tsc --noEmit && npm run lint && npm run eval:jev` |
| **Actual runtime (2026-09-27)** | ~20s (tests/ai, 384 tests) / ~110s (full repo, 833 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ai --no-file-parallelism`
- **After every plan wave:** Run `npx vitest run --no-file-parallelism && npx tsc --noEmit && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green, and 오프라인 평가 정확도·보정 기준 충족 확인
- **Max feedback latency:** 60초

---

## Per-Task Verification Map

| Plan | Wave | Requirement | Test File | Status |
|------|------|-------------|-----------|--------|
| 15-01 | 1 | AIDOC-01, AIDOC-04 | tests/ai/jev-client.test.ts, tests/ai/decision-contract.test.ts | ✅ green |
| 15-02 | 2 | AIDOC-01 | tests/ai/jev-candidates.test.ts, tests/ai/jev-plan.test.ts | ✅ green |
| 15-03 | 1 | AIDOC-03 | tests/kb/folder-candidates.test.ts, tests/ai/mention-context.test.ts | ✅ green |
| 15-04 | 3 | AIDOC-01, AIDOC-02 | tests/ai/document-plan-generation.test.ts, tests/ai/chat-planning-mode.test.ts | ✅ green |
| 15-05 | 3 | AIDOC-04 | tests/ai/jev-golden-set.test.ts, tests/ai/jev-eval.test.ts | ✅ green |
| 15-06 | 4 | AIDOC-02, AIDOC-03 | tests/ai/save-validation.test.ts, tests/ai/regenerate-document.test.ts | ✅ green |
| 15-07 | 2 | AIDOC-03 | tests/ai/mention-search.test.ts, tests/ai/quick-add-folders.test.ts | ✅ green |
| 15-08 | 5 | AIDOC-04 | tests/ai/jev-shadow.test.ts, tests/ai/jev-shadow-wiring.test.ts | ✅ green |
| 15-10 | 1 | AIDOC-02 | tests/ai/paid-generation.test.ts, tests/ai/document-generation.test.ts | ✅ green |
| 15-11 | 2 | AIDOC-04 | tests/ai/jev-metrics.test.ts, tests/ai/jev-activation.test.ts | ✅ green |
| 15-09 | 6 | AIDOC-04 | tests/ai/jev-off-path.test.ts | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/ai/` 디렉터리 내 기존 테스트 파일 실제 목록 확인
- [x] Jev 결정 클라이언트 mock/fixture 작성 (`lib/ai/decision/fixture.ts`)
- [x] 정답셋(오프라인 평가용 154+40건) 데이터 파일/스크립트 구축 (`lib/ai/decision/eval/`)
- [x] 그림자 계획 로깅 테이블/저장소 구축 (`supabase/migrations/0011_ai_doc_planning.sql` — **로컬 파일만, 실제 Supabase 프로젝트에는 미적용**, STATE.md Blockers 참고)
- [x] 운영 관측 지표 수집 인프라 (`lib/ai/decision/metrics.ts` — computeShadowMetrics/computeDecisionMetrics/evaluateShadowGate)
- [x] Jev(TypeSafe AI) 벤더 온보딩 스파이크 — 계정 발급 완료, 공식 문서(`docs.typesafe.ai`) 확인, 실제 스파이크 호출 성공(HTTP 200, 2026-09-27). 고정 버전은 semver(`jev-1.13.0`)로 RESEARCH.md의 날짜형 가정과 달랐음 — `lib/ai/decision/jev.ts`를 실제 스키마(`questions`/`answers`)에 맞춰 재작성함

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 데이터 처리 정책 검토 완료 여부 | AIDOC-04 / D-08, D-09 | 외부 승인 프로세스(작가 본인 검토)로 자동화 불가 | STATE.md Blockers에서 검토 주체·완료일 확인. **현재 미완료 — Activation blocked 상태** |
| 저장 직전 확인 모달의 UX(추천 폴더·템플릿 표시, 변경, 확정 버튼) | AIDOC-02 / D-11 | 시각적 레이아웃·카피·재생성·race 시나리오는 자동 스냅샷만으로 완전 검증 어려움 | Plan 15-09 Task 2 — 브라우저 UAT 체크리스트, 사용자 확인 대기 중 |
| 그림자 계획 단계의 실사용자 영향 없음 확인 | AIDOC-04 / D-06 | Jev 판단이 기록만 되고 실제 Gemini 프롬프트에 반영되지 않는지는 서버 측 자동 테스트로 증명 완료 | `tests/ai/jev-off-path.test.ts`(off 경로 무호출), `tests/ai/jev-shadow-wiring.test.ts`(applied=false 강제, 응답 후 실행)로 자동 검증됨 — 더 이상 수동 검증 불필요 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s (quick run) — full repo suite ~110s, tracked separately
- [x] `nyquist_compliant: true` set in frontmatter

이 승인은 Phase 15의 코드·UI·평가·그림자 파이프라인 완성(Code complete)을 확인한 것이다. Jev 추천의 Production active 여부는 getAiDocPlanningMode()가 DB의 정책 승인·실제 벤더 holdout 평가 증거(JEV_ACTIVATION_THRESHOLDS)·그림자 표본을 모두 확인할 때만 성립하며, 현재는 Activation blocked 상태다.

**Approval:** approved 2026-09-27

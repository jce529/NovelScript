---
phase: 15
slug: jev-ai
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-23
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (기존 `npx vitest run tests/ai --no-file-parallelism` 관례, BUG-01 §검증에도 명시) |
| **Config file** | 기존 `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/ai --no-file-parallelism` |
| **Full suite command** | `npx vitest run --no-file-parallelism && npx tsc --noEmit && npm run lint` |
| **Estimated runtime** | ~30-60초 (quick) / ~3-5분 (full) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/ai --no-file-parallelism`
- **After every plan wave:** Run `npx vitest run --no-file-parallelism && npx tsc --noEmit && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green, and 오프라인 평가 정확도·보정 기준 충족 확인
- **Max feedback latency:** 60초

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-XX-XX | TBD | 0 | (Wave 0) | infra | `test -d tests/ai` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | TBD | AIDOC-01 | unit (mocked DecisionClient) | `npx vitest run tests/ai/jev-plan.test.ts` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | TBD | AIDOC-02 | unit + integration | `npx vitest run tests/ai/document-generation.test.ts` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | TBD | AIDOC-03 | unit | `npx vitest run tests/ai/save-validation.test.ts` | ❌ W0 | ⬜ pending |
| 15-XX-XX | TBD | TBD | AIDOC-04 | 평가 스크립트 + 수동 게이트 | `npm run eval:jev` (신설) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*정확한 Task ID·Plan·Wave 매핑은 gsd-planner가 PLAN.md 작성 시 확정한다. 이 표는 RESEARCH.md의 Phase Requirements → Test Map을 뼈대로 삼는다.*

---

## Wave 0 Requirements

- [ ] `tests/ai/` 디렉터리 내 기존 테스트 파일 실제 목록 확인 — RESEARCH.md는 표면적으로만 확인함, 계획 단계에서 재확인 필요
- [ ] Jev 결정 클라이언트 mock/fixture 작성 (`lib/ai/providers/fixture.ts` 패턴 재사용)
- [ ] 정답셋(오프라인 평가용 100~300건) 데이터 파일/스크립트 신규 구축 — 현재 전혀 없음
- [ ] 그림자 계획 로깅 테이블/저장소 신규 구축 — 스키마 마이그레이션 필요 가능성
- [ ] 운영 관측 지표 수집 인프라 (D-07: 수락률·변경률·clarify 비율·폴백률·P50/P95·비용·재생성률) — 기존 인프라 부재
- [ ] Jev(TypeSafe AI) 벤더 온보딩 스파이크 — 공식 인증 방식·요청/응답 스키마·rate limit·SLA·계정 발급 절차 미확인(RESEARCH.md Tertiary 소스만 존재). 계정 발급 + `docs.typesafe.ai` 원문 열람 + 실제 스파이크 호출로 1차 소스 확보 필요

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 데이터 처리 정책 검토 완료 여부 | AIDOC-04 / D-08, D-09 | 외부 승인 프로세스(법무/작가 본인 검토)로 자동화 불가, STATE.md Blockers로 추적하는 외부 대기열 | STATE.md Blockers에서 검토 주체·완료일 확인. 검토 완료 전에는 실사용자 트래픽에 대한 Jev 추천 활성화 스위치가 꺼져 있는지 코드·설정에서 확인 |
| 저장 직전 확인 모달의 UX(추천 폴더·템플릿 표시, 변경, 확정 버튼) | AIDOC-02 / D-11 | 시각적 레이아웃·카피는 UI-SPEC 단계 산출물이라 자동 스냅샷만으로 완전 검증 어려움 | 브라우저에서 "문서로 저장하기" 클릭 → 모달에 추천 폴더·템플릿 표시 확인 → 다른 폴더/템플릿으로 변경 → 확정 버튼 클릭 → 저장 성공 토스트 확인 |
| 그림자 계획 단계의 실사용자 영향 없음 확인 | AIDOC-04 / D-06 | Jev 판단이 기록만 되고 실제 Gemini 프롬프트에 반영되지 않는지는 운영 관측 지표로만 검증 가능 | 그림자 계획 활성 상태에서 실제 문서 생성 결과가 Jev 판단과 무관하게 기존 경로로 나오는지 로그·DB로 확인 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

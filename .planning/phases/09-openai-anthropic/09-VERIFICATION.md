---
phase: 09-openai-anthropic
verified: 2026-09-29T00:00:00Z
status: passed
score: 4/4 must-haves verified (코드 + 라이브 호출 + 브라우저 UAT)
re_verification:
  previous_status: human_needed
  resolved_by: "2026-09-29 라이브 키 호출, 0013 원격 적용, 브라우저 UAT"
residual:
  - item: "Gemini 라이브 호출"
    status: "429 RESOURCE_EXHAUSTED (키/쿼터 문제, Phase 9 코드 무관)"
    tracked_in: "Phase 4 라이브 GEMINI_API_KEY UAT (미완)"
---

# Phase 9 검증 보고서

**목표:** 작가가 플랫폼 키로 OpenAI·Anthropic을 골라 집필하고, 선택한 모델의 실제 단가로 계산된 비용 추정을 본다.
**상태:** passed (코드 갭 없음, 라이브 호출·원격 DB·브라우저 UAT 완료)

## 자동 검증
| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0 |
| `npx vitest run tests/ai` | 39 파일 / 429 테스트 모두 통과 |

## 라이브 검증 (2026-09-29)
플랫폼 키로 카탈로그 모델을 최소 프롬프트로 한 번씩 호출했다.

| 모델 | 결과 |
|---|---|
| OpenAI `gpt-4o-mini` | 성공 (토큰 28/4) |
| OpenAI `gpt-5.6-terra` | 최초 400 → `temperature` 제거 후 성공 (토큰 27/6). Organization Verification 없이 호출됨 |
| Anthropic `claude-haiku-4-5` | 성공 (토큰 32/11) |
| Anthropic `claude-sonnet-5` | 성공 (토큰 31/30) |
| Gemini `gemini-3.5-flash` | 429 RESOURCE_EXHAUSTED — 키/쿼터 문제. Phase 4 라이브 UAT 미완 항목으로 이관 |

## 브라우저 UAT (2026-09-29, 로컬 dev + 테스트 프로젝트)
| 단계 | 결과 |
|---|---|
| 설정 페이지 초기값 | Gemini 3.5 Flash (폴백) |
| Claude Sonnet 5 선택 후 저장 | "기본값을 저장했어요." + DB `anthropic / claude-sonnet-5` |
| AI 패널 진입 | 저장된 기본값으로 시작, "계정 기본값: Claude Sonnet 5" 표시, 제공자별 비용 추정 |
| 패널에서 GPT-4o mini로 전환 후 전송 | 실제 OpenAI 응답 수신, 원장 `ai_generation` −1 |
| 전송 후 | 패널이 Sonnet 5로 복귀, DB 기본값 불변 |

## Success Criteria
| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | OpenAI 모델 선택 후 기존 UI로 결과 유입 | VERIFIED | Responses API 어댑터, 라이브 호출 + 브라우저 전송 성공 |
| 2 | Anthropic 모델 선택 후 동일 | VERIFIED | Messages 어댑터, 라이브 호출 성공 (temperature 미전송) |
| 3 | 계정 기본값 설정 + 패널 1회 전환 | VERIFIED | 설정 저장 → 패널 반영 → 1회 전환 → 복귀까지 브라우저에서 확인 |
| 4 | 제공자별 실제 단가 | VERIFIED | 제공자별 `*/cost.ts`, `resolvePricing`과 AiPanel 비용 추정이 providerId로 표 선택 |

## 요구사항
PROV-02, PROV-03, PROV-04, PROV-07: 충족.

## 실행 후 발견·수정한 결함
모킹 테스트로는 잡히지 않고 라이브/브라우저 검증에서만 드러났다.
1. `gpt-5.6-terra`가 `temperature`에 400 반환 → 추론 모델(`gpt-5*`, o-시리즈)엔 미전송 (`2b9612b`).
2. `profiles` 컬럼 단위 UPDATE grant(0006)에 새 컬럼이 빠져 기본값 저장이 실패 → 0013에 grant 추가, 재실행 안전화 (`d245292`).
3. AI 패널 모델 선택기 트리거가 `provider:model` raw 값을 표시 → 표시 이름 렌더 (`d245292`).

## 경고 (비차단)
- 마이그레이션 번호는 0010 충돌로 `0013_ai_provider_defaults.sql`이며 원격 테스트 프로젝트에 적용 완료.
- 모델 ID와 단가는 리서치 시점(2026-09-22) 기준이다. 벤더 변경 시 재확인.
- UAT용 일회용 계정(`test-…@novelscript.test`)이 원격 테스트 프로젝트에 남아 있다 (원장 FK로 삭제 불가).

## 갭
없음.

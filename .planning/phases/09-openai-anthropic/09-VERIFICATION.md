---
phase: 09-openai-anthropic
verified: 2026-09-29T00:00:00Z
status: human_needed
score: 4/4 must-haves verified (코드 수준) — 실제 벤더 호출·원격 DB 적용은 사람 확인 필요
re_verification:
  previous_status: stale (실행 전 문서)
human_verification:
  - test: "OPENAI_API_KEY / ANTHROPIC_API_KEY로 실제 생성 1회씩 (gpt-4o-mini, claude-haiku-4-5)"
    expected: "본문이 기존 채팅/초안 UI로 들어오고 토큰이 실사용량 기준으로 차감됨"
    why_human: "단위 테스트는 SDK를 모킹함. 라이브 왕복 미검증. gpt-5.6-terra는 Org Verification 필요"
  - test: "원격 Supabase에 0013_ai_provider_defaults.sql 적용 후 /studio/settings/ai-providers에서 저장 -> AI 패널 새로고침"
    expected: "기본 제공자·모델이 저장되고 패널이 그 값으로 선택됨. 전환 후 전송하면 저장된 기본값으로 복귀"
    why_human: "마이그레이션이 원격 DB에 미적용. 미적용 상태에서는 조회는 gemini로 폴백하지만 저장은 실패함"
  - test: "OpenAI gpt-5.6-terra 호출에서 temperature 파라미터 수용 여부"
    expected: "400 없이 응답"
    why_human: "openai.ts가 temperature를 항상 전송함. 추론 모델이 거부하면 해당 모델만 실패할 수 있음"
---

# Phase 9 검증 보고서

**목표:** 작가가 플랫폼 키로 OpenAI·Anthropic을 골라 집필하고, 선택한 모델의 실제 단가로 계산된 비용 추정을 본다.
**상태:** human_needed (코드 갭 없음, 라이브 확인 필요)

## 자동 검증
| 명령 | 결과 |
|---|---|
| `npx tsc --noEmit` | 오류 0 |
| `npx vitest run tests/ai` | 39 파일 / 428 테스트 모두 통과 (Supabase 통합 테스트는 이 범위에 없어 네트워크 문제 없음) |

## Success Criteria
| # | 기준 | 상태 | 근거 |
|---|---|---|---|
| 1 | OpenAI 모델 선택 후 기존 UI로 결과 유입 | VERIFIED (코드) | `lib/ai/providers/openai.ts` Responses API 어댑터, refusal/content_filter/max_tokens를 공통 GenerateResult로 매핑. registry가 `OPENAI_API_KEY`로 연결, chatAction이 providerId+model을 zod로 검증(isKnownModel) 후 `createPlatformProvider(providerId)` 호출 |
| 2 | Anthropic 모델 선택 후 동일 | VERIFIED (코드) | `anthropic.ts` Messages 어댑터, `stop_reason==='refusal'` 매핑, temperature 미전송 |
| 3 | 계정 기본값 설정 + 패널 1회 전환 | VERIFIED (코드) | `app/studio/settings/ai-providers/page.tsx`, `lib/ai/providers/settings.ts` (검증 후 profiles 저장, 미설정/무효 시 gemini 폴백), `0013` 마이그레이션, chapter actions가 기본값을 로드해 AiPanel에 전달, 전송 성공 후 `setProviderId/setModel(default)`로 복귀 (AiPanel:191-192) |
| 4 | 제공자별 실제 단가 | VERIFIED | 제공자별 `*/cost.ts` 단가표 분리. `paid-generation.resolvePricing`이 providerId로 표를 선택하며 미등록 모델을 처리. AiPanel 예상 비용도 제공자별 표를 사용해 Gemini 단가 재사용 없음 |

## 아티팩트/연결
카탈로그(`catalog.ts`), 레지스트리, 3개 어댑터, 3개 단가표, 설정 페이지, 마이그레이션 모두 존재하고 실질 구현이며 소비 코드에 연결됨. `TODO/FIXME/TBD/XXX` 없음. 패키지 `openai`, `@anthropic-ai/sdk` 설치됨.

## 요구사항
PROV-02, PROV-03, PROV-04, PROV-07: 코드 수준 충족. 라이브 호출과 원격 DB는 위 사람 확인 항목 참조.

## 경고 (비차단)
- openai.ts는 모든 모델에 `temperature`를 전송한다. 일부 추론 모델(gpt-5.6-terra)은 거부할 수 있다. 라이브 확인 필요.
- 0013은 원격에 미적용(알려진 편차, 번호는 0010 충돌로 변경됨).
- 모델 ID와 단가는 리서치 시점(2026-09-22) 기준이다.

## 갭
없음.

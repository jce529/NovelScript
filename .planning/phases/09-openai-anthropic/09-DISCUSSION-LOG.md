# Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-22
**Phase:** 9-openai-anthropic
**Areas discussed:** 모델 카탈로그, 기본 제공자·모델 설정 UX, 제공자별 단가·비용 표시, 거절·에러 메시지 확장, (여담) 구독제 아이디어

---

## 모델 카탈로그

| Option | Description | Selected |
|--------|-------------|----------|
| gpt-4o-mini 단일 | 저렴하고 빠름. lite/pro 구분 없이 단일 모델로 시작 | |
| gpt-4o-mini(lite) + gpt-4o(pro) | 저가/고가 2단계 — 기존 ModelTier 개념 유지 | |
| 직접 지정 | 다른 특정 모델명 | ✓ (리서치 단계에서 결정) |

| Option | Description | Selected |
|--------|-------------|----------|
| claude-haiku 단일 | 저렴하고 빠름 | |
| claude-haiku(lite) + claude-sonnet(pro) | 저가/고가 2단계 | |
| 직접 지정 | 다른 특정 모델명 | ✓ (리서치 단계에서 결정) |

**사용자 선택:** 구체적 모델명은 리서치 단계에서 결정. 구조만 먼저 확정.
**후속 질문 — tier 구조:** 제공자당 lite/pro 2단계 유지(추천) / 제공자당 단일 모델 / 리서치에 맡김
**선택:** 제공자당 lite/pro 2단계 유지 (1차 결정, 이후 아래 "모델 단계 재논의"에서 번복됨)

---

## 기본 제공자·모델 설정 UX

| Option | Description | Selected |
|--------|-------------|----------|
| 새 `/studio/settings/ai-providers` 페이지 | Phase 10 BYOK와 같은 경로, 이번엔 기본값 선택만 | ✓ |
| 기존 계정 설정 페이지에 섹션 추가 | 새 라우트 없이 기존 페이지 확장 | |

**사용자 선택:** 새 `/studio/settings/ai-providers` 페이지

| Option | Description | Selected |
|--------|-------------|----------|
| 이번 전송만 | 다음 메시지는 계정 기본값으로 복귀 | ✓ |
| 세션 동안 유지 | 페이지 로드 동안은 선택 유지 |  |

**사용자 선택:** 이번 전송만 (PROV-04 문구 그대로)

---

## 제공자별 단가·비용 표시

| Option | Description | Selected |
|--------|-------------|----------|
| provider×tier 중첩 객체를 키로 | `PROVIDER_PRICING[provider][tier]` 구조 | |
| 파일 분리 (provider별 cost 파일) | `lib/ai/providers/<provider>/cost.ts` | ✓ |

**사용자 선택:** 파일 분리
**비용 단위:** 지갑 토큰(원)으로 통일 — 별도 질문 없이 기존 관례를 그대로 유지하는 것으로 확정(단일 옵션이라 질문 생략, 대화 중 확인).

---

## 거절·에러 메시지 확장

| Option | Description | Selected |
|--------|-------------|----------|
| 동일한 한국어 문구 재사용 | Phase 8 D-07~D-10 그대로, 내부적으로만 정규화 확장 | ✓ |
| 벤더명 명시 | 어느 AI가 거절했는지 노출 |  |

**사용자 선택:** 동일한 한국어 문구 재사용

---

## 모델 단계 재논의 (구독제 아이디어 이후)

사용자가 목업 확인 중 Claude Opus 등 누락 모델을 지적, "기존 lite/pro는 단순 AI 품질 단계가 아니라 구독제(Lite=무제한 읽기, Pro=무제한 읽기+AI 토큰 대납) 개념이었다"고 밝힘.

**Claude 대응:** 이는 PROJECT.md에 이미 Out of Scope로 명시된 구독제 인프라와 겹치는 별도 마일스톤급 기능이라고 설명하고 스코프 경계를 확인.

| Option | Description | Selected |
|--------|-------------|----------|
| 백로그로 남기고 Phase 9는 원래 범위로 | 구독제는 별도 마일스톤 후보로 기록, Phase 9는 호출당 모델 선택 경제 유지 | ✓ |
| 지금 로드맵에 반영 | Phase 9 설계를 멈추고 구독제 설계 재개 |  |

**사용자 선택:** 백로그로 남기고 Phase 9는 원래 범위로

그 다음, Phase 9 범위로 복귀해 모델 단계를 다시 확인:

| Option | Description | Selected |
|--------|-------------|----------|
| 2단계 (lite/pro) | 처음 결정 유지 | |
| 3단계 (lite/pro/최상위) | Opus 등 최상위 모델 포함 | |

**사용자 응답(자유 입력):** "제공자가 제공하는 만큼" — 고정 단계 수 자체를 버리자는 취지.

**Claude 확인 질문:** "제공자당 개수를 미리 제한하지 않는다" vs "최소한의 공통 단계(lite/pro/max)는 유지"
**사용자 선택:** 제공자당 개수를 미리 제한하지 않는다 (최종 결정 — D-01/D-02로 CONTEXT.md에 반영, 1차 결정이었던 "2단계 유지"를 대체)

---

## Claude's Discretion

- 제공자별 모델 목록의 저장 형태(코드 상수 vs config)
- 리서치 단계에서 확정되는 정확한 모델 ID·개수·단가
- 드롭다운 "· N개" 표시 등 세부 UI 카피
- provider별 finishReason/stop_reason 필드명 매핑 구현 위치

## Deferred Ideas

- 구독제(Lite=무제한 읽기 전용 / Pro=무제한 읽기+AI 토큰 대납) — PROJECT.md Out of Scope 항목과 겹침. 백로그로 이관.

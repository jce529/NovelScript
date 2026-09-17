# Phase 8: 프로바이더 어댑터 기반 · 멱등 차감 수정 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-17
**Phase:** 08-provider-adapter-idempotent-debit
**Areas discussed:** 같은 호출 판정 기준, 안전 거절 UX·과금, 실패 시 작가 안내
**Not selected:** 로컬 토큰 추정 성향 (Claude 재량)

---

## 같은 호출 판정 기준

**Q: 멱등 키는 언제 새로 만들까요?**

| Option | Description | Selected |
|--------|-------------|----------|
| 전송 1회당 1개 | 클라이언트가 전송 시 키 생성, 재전송은 같은 키. 커머스 패턴 | ✓ |
| 내용 해시로 판정 | 같은 프롬프트면 같은 호출 — 의도적 재생성도 막힘 | |
| 서버 내부 재시도만 | 서버가 요청마다 키 생성, 더블클릭은 못 막음 | |

**Q: 이미 처리된 키로 요청이 또 들어오면?**

| Option | Description | Selected |
|--------|-------------|----------|
| 제공자 호출 전에 차단 | 이중 원가 없음, "이미 처리된 요청" + 잔액 반환 | ✓ |
| 이전 결과 그대로 반환 | 응답 저장 필요 → 스키마 변경 | |
| 차감만 건너뜀 | 현재 RPC 동작, 플랫폼 이중 원가 | |

**Notes:** 동시 경합 처리는 플래너 재량, 실패(차감 없음) 키는 재사용 허용.

---

## 안전 거절 UX·과금

**Q: 거절 호출도 차감할까요?** — 사용자가 먼저 "정확히 안전 거절을 반환한 호출이 무엇인지" 설명을 요청함. A(입력 차단, `promptFeedback.blockReason`) / B(생성 중 차단, `finishReason: SAFETY` 등) / C(`STOP` + 말로 거절, 신호 없음) 세 유형으로 설명 후 재질문.

| Option | Description | Selected |
|--------|-------------|----------|
| A·B 모두 차감 안 함 | 플랫폼이 원가 부담 | |
| A 무료, B 실사용량 차감 | 절충 | |
| A·B 모두 실사용량 차감 | 원가 일치, 반복 악용 손실 없음 | ✓ |

**Q: 거절 안내 표시 방식**

| Option | Description | Selected |
|--------|-------------|----------|
| 기존 인라인 에러와 동일 | UI 변경 최소 | ✓ |
| 대화창에 구분된 시스템 말풍선 | 새 UI 상태 필요 | |

**Q: 제공자 거절 원문 처리** → "원문 접어서 보여주기" 선택. 후속 질문(B의 잘린 글 포함 여부):

| Option | Description | Selected |
|--------|-------------|----------|
| 거절 사유만 보여주기 | 사유 코드 + 한국어 설명, 콘텐츠 조각 비노출 | ✓ |
| 잘린 글도 포함 | 삽입/제안 불가 상태로 노출 | |

---

## 실패 시 작가 안내

**Q: 거절 안내에 차감 사실 표기**

| Option | Description | Selected |
|--------|-------------|----------|
| 사용 토큰과 잔액 표시 | 반복 재시도 억제 | ✓ |
| 잔액만 조용히 갱신 | | |

**Q: 제공자 호출 실패 문구**

| Option | Description | Selected |
|--------|-------------|----------|
| 원인별 2~3가지 | 429 / 일시 장애 / 설정 오류, Phase 11이 확장 | ✓ |
| 지금처럼 한 가지 | 동작 변화 0에 충실 | |

**Q: 서버 로그 범위**

| Option | Description | Selected |
|--------|-------------|----------|
| 정제된 요약만 | {provider, status, kind, idempotencyKey} | ✓ |
| 로그 없음 유지 | | |

---

## Claude's Discretion

- 로컬 토큰 추정 방식·보수성 (영역 미선택)
- 동시 같은 키 경합 처리, 사전 확인 구현
- ProviderClient 모양·파일 구성, 문구 최종 워딩, 대화 기록 처리

## Deferred Ideas

- C유형(말로 거절) 휴리스틱 감지
- 중복 요청에 이전 응답 재반환(응답 저장소)
- 자동 재시도(Phase 11)

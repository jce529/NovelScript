---
id: BUG-06
title: 같은 지갑의 유료 AI 생성이 동시에 진행되면 정산 실패로 응답이 사라지고 모델 비용만 발생한다
status: open
severity: medium
found: 2026-10-02
found_during: Codex(gpt-6-luna) 코드베이스 리스크 점검(risk-report.md) 후 코드 대조
origin_phase: 08 (멱등 차감 설계 08-01·08-03; 공통 로직은 9c4bb87 feat(15-10)에서 lib/ai/paid-generation.ts로 추출됨)
files:
  - lib/ai/paid-generation.ts
  - supabase/migrations/0001_init.sql
---

# BUG-06: 동시 유료 생성의 잔액 스냅샷 경합

## 증상
같은 작가가 AI 생성을 동시에 여러 번 보내면(여러 탭, 재생성 연타, 문서 계획 + 채팅 병행), 잔액이 넉넉하지 않을 때 일부 요청은 모델 호출이 끝난 뒤 정산에서 `insufficient balance`로 거절된다. 사용자는 응답을 받지 못하고(`settlement` 실패 안내), 플랫폼은 이미 모델 비용을 지불한다.

## 재현
1. 잔액을 한 요청 비용 정도로만 남긴다(예: 100).
2. 서로 다른 idempotency key로 `preflightPaidGeneration` → 생성 → `settlePaidGeneration`을 동시에 2회 실행한다.
3. 두 요청 모두 preflight에서 잔액 100을 읽고 통과한다. 먼저 정산된 요청이 잔액을 소진하면 두 번째의 `apply_wallet_delta`가 `insufficient balance`를 던져 `settlement` 실패가 된다.

## 기대 / 실제
- 기대: 동시에 보내도 잔액을 초과하는 생성은 시작되지 않거나(안내 후 거절), 시작된 생성은 반드시 정산된다.
- 실제: preflight(`readBalance`)와 정산(`apply_wallet_delta`) 사이에 잔액 예약이 없다. `debitAmount = min(스냅샷 잔액, 비용)`는 스냅샷 기준이라 다른 요청이 그 사이 차감한 사실을 모른다.

## 원인
- 08-01·08-03 설계가 "추정치로 `maxOutputTokens`만 정하고, 차감은 생성 후 실제 사용량으로" 하는 구조다(D-13). 같은 키의 마지막 잔액 경합은 08-06에서 검증됐지만(이중 차감 없음), **서로 다른 요청**의 동시 실행은 다루지 않았다.
- 이중 차감은 일어나지 않는다(원장 제약). 손실은 "정산되지 않은 모델 호출 비용"과 "응답 유실"이다.

## 수정 방향
**확정(2026-10-02, 사용자 선택 A): 지갑별 직렬화.**
- 같은 작가의 유료 생성은 한 번에 하나만 진행한다. 진행 중에 다른 유료 생성이 들어오면 새 호출을 시작하지 않고 "이미 생성 중이에요" 계열 안내를 반환한다.
- 구현 후보: 지갑 단위 락 행(예: `ai_generation_locks(wallet_id, idempotency_key, expires_at)`)을 preflight에서 원자적으로 획득하고 settle(성공·실패 모두)에서 해제, 비정상 종료 대비 만료 시각(예: 생성 타임아웃 + 여유)을 둔다. 기존 `findGenerationEntry` 멱등 경로와 충돌하지 않게 한다.
- 선차감/예약(B안)과 손실 허용(C안)은 채택하지 않았다.
- Phase 11(BYOK)은 지갑을 우회하므로 BYOK 호출에는 이 락을 적용하지 않는다. Phase 11 11-04/11-05 계획과 겹치는 파일(`lib/ai/paid-generation.ts`)이므로 **실행 순서를 조율**한다(Phase 11 이전에 먼저 고치거나, Phase 11 계획에 락 제외 조건을 명시).
- 새 마이그레이션이 필요하면 다음 빈 번호를 사용한다(번호 정리는 Phase 6 BUG-01 참고).

## 검증
- 독립 연결로 같은 지갑에 유료 생성 2건을 동시에 시작하는 테스트(fake provider)를 추가: 한 건만 진행되고 다른 건은 안내로 거절되며, 잔액이 음수가 되거나 정산 실패가 발생하지 않는지 확인(먼저 실패 확인).
- 락 해제 확인: 성공, 공급자 실패, 정산 실패, 타임아웃 후 재시도 각각에서 다음 생성이 가능한지.
- 서로 다른 작가의 동시 생성은 서로 막지 않는지.
- 기존 `tests/ai/*`(멱등·last-balance race) 회귀 통과.

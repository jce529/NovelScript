---
id: BUG-06
title: 전체 vitest를 병렬로 실행하면 원격 Supabase 타임아웃으로 다수 실패한다
status: open
severity: low
found: 2026-09-17
found_during: Phase 7 실행 검증 (직렬 실행 483/483 통과, 병렬 약 11건 실패 기록)
origin_phase: 07 (테스트 인프라; 영향은 전체 스위트)
files:
  - vitest.config.ts
  - package.json
---

# BUG-06: 병렬 테스트 타임아웃

## 증상
`npx vitest run` 기본(파일 병렬) 실행 시 원격 Supabase에 동시에 연결하는 DB 테스트에서 타임아웃/`Database error creating new user`가 발생해 약 11건이 실패한다. 직렬 실행(`--no-file-parallelism`)은 통과한다. 07-03 수정 기록에도 같은 현상이 언급됐다.

## 재현
`npx vitest run` (병렬) 후 `npx vitest run --no-file-parallelism`과 결과를 비교한다.

## 기대 / 실제
- 기대: 기본 `npm test`가 안정적으로 통과한다.
- 실제: 병렬 시 실DB 의존 테스트가 불안정하다. 최근 세션에서는 DB 테스트 위주 실행(`tests/commerce tests/payments`)이 통과했으나 전체 병렬 실행은 재측정하지 않았다.

## 원인
공유 원격 DB 연결 수·부하와 테스트별 사용자 생성이 동시에 몰린다. 테스트 타임아웃도 짧다.

## 수정 방향
- DB 의존 테스트 프로젝트(또는 파일 패턴)만 직렬 실행(`poolOptions`/`fileParallelism: false` 또는 vitest projects 분리)하고 타임아웃을 상향한다. CI를 구성하기 전에 정한다. 정책 결정 불필요.

## 검증
- 변경 후 `npm test`를 3회 연속 실행해 모두 통과하는지 확인하고 소요 시간 변화를 기록한다. 먼저 현재 실패 건수를 재측정해 이 문서의 수치를 갱신한다.

---
phase: 19-studio-workid-ui
plan: 01
requirements-completed: [WORKHOME-01, WORKHOME-02, WORKHOME-03, WORKHOME-05]
key-files:
  - lib/kb/setting-document.ts
  - lib/works/work-home.ts
  - tests/works/work-home.test.ts
status: blocked
---

# Phase 19 Plan 01 실행 요약

개정 2를 기준으로, 작품 홈에서 사용할 순수 상태 투영을 추가했다. `isSettingDocument`는 템플릿 파일과 폴더를 제외한 실제 설정 문서만 판정한다. `buildWorkHomeState`는 이미 소유권 확인을 거쳐 받은 회차·KB 결과만으로 전체·공개·미공개 회차 수, 설정 문서 수, 4단계 가이드 진행도와 현재 단계를 계산한다. 심사 단계나 심사 카드 없이 회차 목록·세계관 설정·타임라인·가지 치기 4개 바로가기만 상수로 제공한다.

## 검증 결과

- `npm test -- tests/works/work-home.test.ts`: 실패. Vitest가 테스트 실행 전 `vitest.config.ts` 번들 과정에서 Windows `spawn EPERM`을 반환했다. 동일 명령을 한 번 재시도했으나 같은 환경 오류가 반복되어, 테스트 본문은 실행되지 못했다.
- `npx tsc --noEmit`: 통과.
- `git diff --check -- lib/kb/setting-document.ts lib/works/work-home.ts tests/works/work-home.test.ts`: 통과.
- 스텁 검사: 대상 파일에서 빈 렌더 값, TODO/FIXME, placeholder 패턴을 찾지 못했다.

## 편차

계획의 자동 테스트는 코드 실패가 아닌 Vitest/Vite 프로세스 실행 권한 오류로 검증할 수 없었다. 새 데이터 조회, 엔드포인트, 인증 경로, 스키마 변경은 추가하지 않았다.

## 열린 항목

Windows 환경에서 Vite가 실경로 확인을 위해 자식 프로세스를 실행할 수 있도록 `spawn EPERM` 문제를 해소한 뒤, `npm test -- tests/works/work-home.test.ts`를 다시 실행해야 한다. 이 확인 전에는 계획을 완료 상태로 전환하지 않는다.

## Self-Check: PASSED

`lib/kb/setting-document.ts`, `lib/works/work-home.ts`, `tests/works/work-home.test.ts` 파일의 존재를 확인했다. 사용자 지시에 따라 Git add/commit 및 상태 문서 갱신은 수행하지 않았다.

## 오케스트레이터 재검증 (2026-11-01)

Codex 샌드박스의 Vite spawn EPERM은 환경 문제였다. 샌드박스 밖에서 `npm test -- tests/works/work-home.test.ts` 5개 통과, `npx tsc --noEmit` 오류 없음을 확인했다. 계획은 완료로 본다.

# Phase 07 — 발견된 버그

Phase 7(운영자 도구) 코드에서 원인이 발생한 버그를 모았다. 발견 자체는 08-09 체크포인트(2026-09-18)의 자동 게이트(`npm run build`)에서 이뤄졌지만, 코드 원인은 Phase 7에 있어 이 폴더로 옮겼다(`.planning/phases/08-provider-adapter-idempotent-debit/bugs/`에서 이동, 2026-09-22).

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-04](BUG-04-self-sanction-generic-message.md) | 관리자가 자기 자신을 제재하면 일반 검증 문구만 표시된다 (F-2) | low | 2026-09-17 | open (방향 확정) |
| [BUG-05](BUG-05-reader-db-tests-pollute-admin-queue.md) | 독자 DB 테스트가 공유 테스트 DB에 신고 잔여물을 남긴다 (F-3) | low | 2026-09-17 | open (방향 확정) |
| [BUG-06](BUG-06-vitest-parallel-timeouts.md) | 전체 vitest 병렬 실행 시 원격 Supabase 타임아웃 | low | 2026-09-17 | open (수정 계획 작성, 기준선 재측정 필요) |
| [BUG-07](BUG-07-legacy-lint-errors.md) | 기존 lint 오류 누적 — 2026-10-02 재측정: 오류 0건·경고 7건 (경고 0건 + 게이트 강화로 범위 축소) | low | 2026-09-17 | open (수정 계획 작성) |

BUG-03은 수정 완료돼 `.planning/fixed/07-03 admin 빌드 프리렌더 실패 수정.md`로 옮겨졌다.

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 필드: 상태·심각도·발견일·발생 phase / 재현 / 기대 / 실제 / 원인 / 수정 방향 / 검증 방법. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다 (CLAUDE.md "버그 문서화 규칙" 참고).

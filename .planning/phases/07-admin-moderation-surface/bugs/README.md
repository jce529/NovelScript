# Phase 07 — 발견된 버그

Phase 7(운영자 도구) 코드에서 원인이 발생한 버그를 모았다. 발견 자체는 08-09 체크포인트(2026-09-18)의 자동 게이트(`npm run build`)에서 이뤄졌지만, 코드 원인은 Phase 7에 있어 이 폴더로 옮겼다(`.planning/phases/08-provider-adapter-idempotent-debit/bugs/`에서 이동, 2026-09-22).

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-04](BUG-04-self-sanction-generic-message.md) | 관리자가 자기 자신을 제재하면 일반 검증 문구만 표시된다 (F-2) | low | 2026-09-17 | 구현 완료 — 브라우저 확인 대기 (커밋 e27f1d8) |
| [BUG-07](BUG-07-legacy-lint-errors.md) | 기존 lint 오류 누적 — 2026-10-02 재측정: 오류 0건·경고 7건 (경고 0건 + 게이트 강화로 범위 축소) | low | 2026-09-17 | 구현 완료 — 비로그인 /login 이동 브라우저 확인 대기 (커밋 08fc2fd) |

BUG-05·06은 수정 완료돼 [`07-05 신고 테스트 잔여물 정리.md`](../../../fixed/07-05%20%EC%8B%A0%EA%B3%A0%20%ED%85%8C%EC%8A%A4%ED%8A%B8%20%EC%9E%94%EC%97%AC%EB%AC%BC%20%EC%A0%95%EB%A6%AC.md), [`07-06 병렬 테스트 DB 직렬화.md`](../../../fixed/07-06%20%EB%B3%91%EB%A0%AC%20%ED%85%8C%EC%8A%A4%ED%8A%B8%20DB%20%EC%A7%81%EB%A0%AC%ED%99%94.md)로 옮겨졌다.
BUG-03은 수정 완료돼 `.planning/fixed/07-03 admin 빌드 프리렌더 실패 수정.md`로 옮겨졌다.

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 필드: 상태·심각도·발견일·발생 phase / 재현 / 기대 / 실제 / 원인 / 수정 방향 / 검증 방법. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다 (CLAUDE.md "버그 문서화 규칙" 참고).

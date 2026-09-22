# Phase 04 — 발견된 버그

Phase 4(AI Gateway) 코드에서 원인이 발생한 버그를 모았다. 발견 자체는 08-09 체크포인트(2026-09-18, Chrome + 실제 Gemini)에서 이뤄졌지만, 코드 원인은 Phase 4에 있어 이 폴더로 옮겼다(`.planning/phases/08-provider-adapter-idempotent-debit/bugs/`에서 이동, 2026-09-22).

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-01](BUG-01-proposal-save-nested-category-folder.md) | 하위 폴더가 있는 카테고리에서 AI 문서 제안 저장·빠른 추가 실패 | High | 2026-09-18 | open (작업 칩 생성됨) |
| [BUG-02](BUG-02-mention-enter-inserts-newline.md) | @멘션 자동완성에서 Enter가 선택 대신 줄바꿈 | Medium | 2026-09-18 | open (다른 디바이스 확인 대기) |

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 필드: 상태·심각도·발견일·발생 phase / 재현 / 기대 / 실제 / 원인 / 수정 방향 / 검증 방법. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다 (CLAUDE.md "버그 문서화 규칙" 참고).

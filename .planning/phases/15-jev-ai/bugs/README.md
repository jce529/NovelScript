# Phase 15 — 발견된 버그

Phase 15(Jev AI) 코드에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-02](BUG-02-save-modal-select-shows-uuid.md) | 저장 확인 모달의 폴더/템플릿 셀렉트가 이름 대신 UUID를 표시 | medium | 2026-09-29 | open |
| [BUG-03](BUG-03-template-list-not-filtered-by-category.md) | 템플릿 목록이 카테고리로 걸러지지 않아 다른 카테고리 선택 시 재생성 실패 (수정 방향 미확정) | medium | 2026-09-29 | open |
| [BUG-04](BUG-04-regenerate-changes-document-name.md) | 템플릿 재생성 시 문서 이름이 바뀌어 저장됨 (수정 방향 미확정) | medium | 2026-09-29 | open |

완전히 고쳐진 버그는 이 폴더에서 지우고 `.planning/fixed/`로 옮긴다 — 현재: [`15-01 회차 편집기 Turbopack fs 패닉 수정.md`](../../../fixed/15-01%20회차%20편집기%20Turbopack%20fs%20패닉%20수정.md) (BUG-01).

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.

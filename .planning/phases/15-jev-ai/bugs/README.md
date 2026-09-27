# Phase 15 — 발견된 버그

Phase 15(Jev AI) 코드에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-01](BUG-01-chapter-editor-client-bundle-fs-import.md) | 회차 편집기 열람 시 Turbopack 청킹 패닉 (node:fs/promises가 클라이언트 번들에 유입) | High | 2026-09-27 | Open |

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.

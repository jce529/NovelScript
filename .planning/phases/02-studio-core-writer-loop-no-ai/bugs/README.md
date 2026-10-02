# Phase 02 — 발견된 버그

Phase 2(스튜디오 코어) 코드에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-01](BUG-01-chapter-order-index-race.md) | 회차 동시 생성 시 order_index 중복으로 한 요청이 실패한다 | medium | 2026-10-02 | open (방향 확정) |

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.

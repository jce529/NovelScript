# Phase 10 — 발견된 버그

BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지 코드에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-01](BUG-01-byok-models-loader-wipes-all-on-failed-key.md) | `loadConnectedByokModels`가 failed 키 하나로 모든 BYOK 모델을 숨김 | medium | 2026-10-12 | open |

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.

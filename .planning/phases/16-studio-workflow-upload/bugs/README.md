# Phase 16 — 발견된 버그

Phase 16(스튜디오 작업 흐름 확장 · 파일 업로드) 코드에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-01](BUG-01-upload-dialog-input.md) | 업로드 다이얼로그 파일 입력 기본 문구 노출 + 저장 폴더 Select 비제어 경고(G2/G3) | low | 2026-10-23 (16-UAT) | 코드 수정·자동 검증 완료 (fixed-pending-device-check), 실기기 시각 확인은 17-06 |
| [BUG-02](BUG-02-retry-selection.md) | 다시 시도가 모델 변경을 반영하지 않음(G4) — 실패 종류별 새 키 정책 | low | 2026-10-02 (16-UAT) | 코드 수정·자동 검증 완료 (fixed-pending-device-check) |
| [BUG-03](BUG-03-ai-panel-overflow.md) | AI 패널 카드가 고정 높이인데 내용이 넘쳐 입력창이 카드 밖으로 튀어나옴 | low | 2026-10-25 (Phase 17 UAT) | 코드 수정·자동 검증 완료 (fixed-pending-device-check) |
| [BUG-04](BUG-04-mobile-shell-bottom-overlap.md) | 모바일·태블릿 하단 탭 바가 화면 밖으로 밀리거나 긴 화면 내용과 겹침 | low | 2026-10-25 (Phase 17 UAT) | 코드 수정·자동 검증 완료 (fixed-pending-device-check) |
| [BUG-05](BUG-05-narrow-width-controls.md) | 375px에서 AI 설정 모델 select 글자 잘림, 업로드 다이얼로그 모드 버튼 2+1 줄바꿈 | low | 2026-10-25 (Phase 17 UI 점검) | 코드 수정·자동 검증 완료 (fixed-pending-device-check) |

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.

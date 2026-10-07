# Phase 09 — 발견된 버그

Phase 9(OpenAI·Anthropic 어댑터) 코드/절차에서 원인이 발생한 버그를 모은다.

| ID | 제목 | 심각도 | 발견 | 상태 |
|---|---|---|---|---|
| [BUG-03](BUG-03-service-key-missing-models-listed.md) | 서버에 서비스 키(환경변수)가 없는 제공자의 모델이 드롭다운에 노출됨 | low | 2026-10-07 | open (논의 필요, 수정 방향 미정 — BUG-02와 함께 결정) |
| [BUG-02](BUG-02-default-model-silent-fallback.md) | 계정 기본 모델을 쓸 수 없을 때 이유 설명 없이 조용히 대체됨 | medium | 2026-10-07 | open (서버·UI 수정 완료 2026-10-07, 남은 항목은 Phase 11 연결 후 — 문서 "사용자 결정 및 적용 내용" 참조) |

완전히 고쳐진 버그는 이 폴더에서 지우고 `.planning/fixed/`로 옮긴다 — 현재: [`09-01 UAT 계정 정리 CLI.md`](../../../fixed/09-01%20UAT%20%EA%B3%84%EC%A0%95%20%EC%A0%95%EB%A6%AC%20CLI.md) (BUG-01)

## 템플릿

새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.

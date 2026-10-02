---
phase: 16-studio-workflow-upload
verified: 2026-10-02
status: gaps_found
score: static checks only (tsc/eslint clean, 4 new unit tests pass); runtime/browser unverified
gaps:
  - truth: "Jev가 업로드 파일을 분류해 트리로 제안하고, 승인한 배치대로 저장된다"
    status: unverified
    reason: "실제 Jev 연결·DB 없이 구현만 됨"
    missing:
      - "실제 Jev 호출로 분류 제안이 오는지 / 미분류 처리"
      - "승인 후 실제 폴더 저장, 폴더 변경 시 실패 보고"
  - truth: "트리에서 드래그앤드롭으로 배치를 수정할 수 있다"
    status: unverified
    reason: "브라우저 UAT 미실시 (데스크탑 마우스, 모바일 터치 핸들)"
    missing:
      - "브라우저 UAT"
  - truth: "설정 문서에서 AI 대화·초안 삽입·문서 제안 저장이 회차와 동일하게 동작한다"
    status: unverified
    missing:
      - "브라우저 UAT, 과금 reason kb:<nodeId> 원장 확인"
  - truth: "모바일 세로 화면에서 스튜디오가 사용 가능하다"
    status: unverified
    missing:
      - "실제 모바일 기기/에뮬레이터 확인"
baseline-note: "전체 tests에서 36개 파일 실패. tests/ai는 변경 전에도 동일하게 4개 파일 실패(supabaseUrl 환경변수). 나머지 폴더의 실패 원인은 미확인."
---

# Phase 16 Verification

위 gaps가 해소되기 전까지 Phase 16은 `Complete (verification pending)`로 둔다.

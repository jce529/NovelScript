# BUG-01 Toss 테스트 헬퍼 lint 경고
- 증상: `tests/helpers/toss.ts` 68(x2)·136, `tests/payments/payment-flow.integration.test.ts:75`의 `_` 접두 미사용 인자 경고 (eslint 설정이 `_` 무시 패턴 없음).
- 방향: 인자 제거. fetch mock은 `vi.fn<(url, init?) => Promise<Response>>`로 시그니처를 유지해 `mock.calls` 타입 보존.
- 상태: 수정 완료 (d357b2f), fixed로 이관.

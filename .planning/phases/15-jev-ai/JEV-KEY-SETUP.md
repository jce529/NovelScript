# Jev(TypeSafe AI) 키 발급 가이드

Phase 15의 `15-01-PLAN.md` Task 2(`<how-to-verify>`)에서 가져온 절차입니다. 계정 발급·공식 문서 열람은 Claude가 대신할 수 없어 사람이 직접 해야 합니다. 지금은 "계정 발급 없이 blocked 상태로 진행"하기로 했으므로, 아래는 나중에 실제 활성화할 때 밟을 절차입니다.

## 1. 계정 발급
1. https://typesafe.ai 에서 Jev(System 1) API 계정을 발급받는다.
2. 승인 대기가 있을 수 있으니 이메일을 확인한다.

## 2. 공식 문서에서 확인할 항목
https://docs.typesafe.ai 를 열람해 아래를 확인하고 기록해 둔다 (나중에 `15-01-SUMMARY.md`의 `## Live Verification (Spike)` 섹션에 채울 내용):

| 항목 | 확인할 것 |
|---|---|
| 인증 헤더 형식 | 예: `Authorization: Bearer <key>` 맞는지 |
| 요청 바디 필드명 | `state`, `candidates`, `model` 이름이 실제와 같은지 |
| 응답 필드명 | `key`, `confidence`, `probabilities` 이름이 실제와 같은지 |
| rate limit | 분당/일당 요청 제한 |
| 에러 코드 체계 | HTTP status + 에러 바디 포맷 |
| SLA | 응답 지연 보장 수치 |
| 고정 버전 태그 | `jev-latest` 같은 별칭이 아니라 `jev-2026-XX-XX` 류의 고정 태그가 있는지 — **없으면 진행을 멈추고 알려야 함** |

## 3. 환경변수 설정
`.env.local`에 추가:
```
TYPESAFE_API_KEY=<발급받은 키>
JEV_MODEL_VERSION=<위에서 확인한 고정 버전 태그>
```
(`.env.example`에는 이미 15-01 구현에서 키 이름만 플레이스홀더로 추가되어 있음 — 실제 값은 커밋하지 않는다.)

## 4. 스파이크 호출로 검증
curl 또는 임시 스크립트로 **합성 데이터만** 담은 state/candidates를 보내 200 응답을 받는다. 예시:
```bash
curl -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "'"$JEV_MODEL_VERSION"'",
    "state": { "example": "synthetic test context" },
    "candidates": [{ "key": "candidate-a" }, { "key": "candidate-b" }]
  }'
```
(실제 base URL·필드명은 2단계에서 확인한 문서 기준으로 조정한다. 위 URL은 `lib/ai/decision/jev.ts`에 구현된 기본값 가정이며 미검증 상태다.)

## 5. 실제 스키마가 코드 가정과 다르면
`lib/ai/decision/jev.ts`의 `JevResponseSchema` (key/confidence/probabilities)와 요청 바디(`model`/`state`/`candidates`)가 실제 문서와 다르면, 그 차이를 적어서 알려주면 필드명만 맞추는 작업을 진행할 수 있습니다.

## 완료 후
"live verified: <인증 헤더>, <요청 스키마>, <응답 스키마>, <고정 버전 태그>" 형식으로 알려주면 `15-01-SUMMARY.md`의 blocked 상태를 verified로 갱신하고, `.planning/STATE.md` Blockers 항목을 해제합니다.

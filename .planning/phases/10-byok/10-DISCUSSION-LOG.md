# Phase 10: BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-29
**Phase:** 10-BYOK 키 등록 · 검증 · 관리 + 모델 피커 배지
**Areas discussed:** 키 보관 방식, 피커 모델 목록 규칙, 키 삭제·대체 동작, 키 등록 화면 UX

---

## 키 보관 방식

| Option | Description | Selected |
|--------|-------------|----------|
| Supabase Vault (Recommended) | 암호문은 Vault, 테이블엔 secret_id + 평문 마스크. 마스터 키는 Supabase 관리 | ✓ |
| 앱 레벨 AES-256-GCM | Node에서 암호화해 컬럼에 저장. 이식성↑, KEK 관리 직접 책임 | |
| Claude가 결정 | 플래너가 Vault 기본으로 결정 | |

**User's choice:** Supabase Vault
**Notes:** 테스트 프로젝트에 supabase_vault 0.3.1 활성화 확인 후 질문.

### 재검증
| Option | Description | Selected |
|--------|-------------|----------|
| 수동 재검증 버튼 (Recommended) | 카드의 [다시 확인]으로 models-list 재호출 | ✓ |
| 재검증 없음 | 상태 갱신은 Phase 11 호출 실패에서만 | |
| 설정 화면 열 때 자동 재검증 | 진입마다 호출, 느리고 레이트리밋 소모 | |

**User's choice:** 수동 재검증 버튼

---

## 피커 모델 목록 규칙

| Option | Description | Selected |
|--------|-------------|----------|
| 카탈로그 ∩ 키 응답 (Recommended) | 검증된 카탈로그 모델 중 키로 접근 가능한 것만 | ✓ |
| 키 응답 전체 (채팅 모델) | 신모델 즉시 사용, 단가 미상 모델은 금액 표시 불가 | |

**User's choice:** 카탈로그 ∩ 키 응답

### 배지 표시
| Option | Description | Selected |
|--------|-------------|----------|
| 항목을 둘로 분리 (Recommended) | 같은 모델을 [BYOK]/[서비스 키] 두 줄로 | ✓ |
| 키 있으면 BYOK로 자동 전환 | BYOK 한 줄만, 서비스 키 경로 숨김 | |

**User's choice:** 항목을 둘로 분리
**Notes:** 이로 인해 선택 값에 keySource가 포함돼야 함(CONTEXT D-06).

---

## 키 삭제·대체 동작

| Option | Description | Selected |
|--------|-------------|----------|
| 같은 모델의 서비스 키 (Recommended) | 기본값을 동일 모델 [서비스 키]로, 없으면 Gemini | ✓ |
| Gemini 기본값으로 초기화 | 항상 Gemini 3.5 Flash로 | |

**User's choice:** 같은 모델의 서비스 키

### 삭제 확인
| Option | Description | Selected |
|--------|-------------|----------|
| 영향 안내 다이얼로그 (Recommended) | 영향 안내 + [삭제]/[취소] | ✓ |
| 다이얼로그 + 제공자명 입력 | 직접 입력해야 삭제 활성화 | |
| 즉시 삭제 + 토스트 | 확인 없음 | |

**User's choice:** 영향 안내 다이얼로그

---

## 키 등록 화면 UX

| Option | Description | Selected |
|--------|-------------|----------|
| OpenAI·Anthropic·Gemini 전부 (Recommended) | 3개 제공자 모두 BYOK 대상 | ✓ |
| OpenAI·Anthropic만 | Gemini는 서비스 키 전용 | |

**User's choice:** 3개 제공자 전부

### 등록 흐름
| Option | Description | Selected |
|--------|-------------|----------|
| [등록] 한 번에 검증+저장 (Recommended) | 검증 성공 시에만 Vault 저장 | ✓ |
| [연결 테스트] 후 [저장] 2단계 | 결과 확인 후 저장, 평문 보유 시간↑ | |

**User's choice:** [등록] 한 번에 검증+저장

### 실패 사유
| Option | Description | Selected |
|--------|-------------|----------|
| 원인별 한국어 문구 (Recommended) | 형식/401/403/장애/429 구분 | ✓ |
| 한 문구로 통일 | "키를 확인해 주세요" | |

**User's choice:** 원인별 한국어 문구

---

## Claude's Discretion

- byok_keys 스키마 세부, Vault 함수 시그니처, 제공자별 models-list 구현, 모델 ID 매칭 규칙
- 피커 정렬·배지 디자인·다이얼로그 카피 (UI-SPEC에서 확정)
- 키 삭제와 진행 중 요청의 레이스 처리, 선택 값 인코딩 세부

## Deferred Ideas

- BYOK 호출 경로·차감 우회·비용 게이지·출력 상한 (Phase 11)
- 호출 실패 시 자동 `검증 실패` 전환, 사용량 화면 (Phase 11)
- 자동 재검증, 키 제자리 교체, 카탈로그 밖 모델 자동 노출

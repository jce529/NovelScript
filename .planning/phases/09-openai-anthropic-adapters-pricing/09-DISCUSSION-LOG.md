# Phase 9: OpenAI · Anthropic 어댑터 + 제공자별 단가 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-18 ~ 2026-09-19
**Phase:** 09-openai-anthropic-adapters-pricing
**Areas discussed:** 모델 라인업·표기, 비용 추정 표시 방식, 기본값·호출별 전환 동작, 사고 토큰 과금(BUG-04)

---

## 모델 라인업·표기

| Option | Description | Selected |
|--------|-------------|----------|
| 제공자별 그룹 + 실제 모델명 | Google/OpenAI/Anthropic 그룹 아래 실제 모델명 | ✓ |
| 제공자 × 라이트/프로 | 기존 티어 이름 유지 | |
| 2단 선택(제공자 → 모델) | 드롭다운 2개 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 제공자당 2개: 저가 + 고성능 | 총 6개 | ✓ |
| 제공자당 1개 | 가장 단순 | |
| 제공자당 3개 이상 | 선택지 넓음, 검증 부담 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 키 없는 제공자는 목록에서 숨김 | PROV-05 방향과 일치 | ✓ |
| 비활성 표시 | 회색 + "준비 중" | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gemini 고성능 슬롯을 실제 Pro로 교체 | 결제 활성화는 외부 선행 조건 | ✓ |
| Gemini는 Flash 1개만 | | |
| 키 상태로 자동 결정 | Phase 10 영역과 겹침 | |

## 비용 추정 표시 방식

| Option | Description | Selected |
|--------|-------------|----------|
| 모델별 단가 + 이번 호출 최대치 | 표시 전용 입력 추정 필요 | |
| 모델별 단가만 | 호출별 예측 없음 | ✓ |
| 이번 호출 예상 범위 | 추정 오차 설명 필요 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 지갑 토큰만 | P4 D-12와 일치 | ✓ |
| 지갑 토큰 + 원화 병기 | 환율 임시값 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 글자 수 기준 토큰 | "출력 1,000자당 약 N토큰" | ✓ |
| 상대 등급(₩/₩₩/₩₩₩) | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 입력·출력 둘 다 표시 | | ✓ |
| 출력 단가만 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 드롭다운 항목 + 선택 후 패널 한 줄 | | |
| 드롭다운 항목에만 | | ✓ |

## 기본값·호출별 전환 동작

| Option | Description | Selected |
|--------|-------------|----------|
| /account에 "AI 기본 모델" 섹션 | Phase 10 BYOK도 같은 자리 | ✓ |
| 스튜디오 전용 설정 페이지 신설 | | |
| AI 패널에서 "기본으로 설정" | 성공 기준과 어긋남 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 패널이 열려 있는 동안 유지 | 현재 동작과 동일 | ✓ |
| 전송 1회만 | | |
| localStorage 기억 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 시스템 기본 모델로 대체 + 패널 안내 | PROV-06 취지 | ✓ |
| 조용히 대체 | | |

## 사고 토큰 과금 (BUG-04)

실제 서비스 비교 후 결정(Sudowrite, Novelcrafter, AI Dungeon 문서 조사).

| Option | Description | Selected |
|--------|-------------|----------|
| A. 실사용 그대로 포함(출력 단가) | Sudowrite·Novelcrafter 방식 | ✓ |
| B. 플랫폼 흡수(환율 조정) | | |
| C. 호출당 고정가 | AI Dungeon 방식 | |
| D. 포함하되 할인 | 절충안 | |

| Option | Description | Selected |
|--------|-------------|----------|
| A. 끔/최소 고정 | Novelcrafter 기본 꺼짐 | ✓ (이번 페이즈) |
| B. 제공자 기본값 | | |
| C. 고성능만 사고 허용 | | |
| D. 작가 조절 | Novelcrafter 강도 설정 | 이후 별도 페이즈(슬라이더) |
| E. 용도별 자동 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| A. Phase 9에 포함 | | |
| B. Phase 9 전에 /gsd:quick으로 먼저 수정 | | ✓ |
| C. Phase 9 이후 | | |

**User's choice:** "사고 토큰 과금은 a안, 사고 기능 설정은 이번 페이즈에선 a안이지만 나중에 D로 작가가 슬라이더 형식으로 조절 가능하게 다른 페이즈에서 제작, 버그는 b로"

## Claude's Discretion

- provider×model 레코드 구조·파일 위치, ModelTier 대체, registry 선택 방식, SDK 사용 여부
- 드롭다운 레이아웃·문구, 모델 전환 시 history 처리, fixture 확장

## Deferred Ideas

- 작가 사고 강도 슬라이더(별도 페이즈)
- 용도별 자동 사고 설정
- 이번 호출 예상 비용 표시
- 원화 병기
- PROV-08 모델 힌트

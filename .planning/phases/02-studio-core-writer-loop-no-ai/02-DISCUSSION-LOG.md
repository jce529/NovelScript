# Phase 2: Studio Core (Writer Loop, No AI) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-25
**Phase:** 02-studio-core-writer-loop-no-ai
**Areas discussed:** 작품(Work) 구조, KB 문서 구조, 회차 에디터 & 발행, 스튜디오 네비게이션

---

## 작품(Work) 구조

| Option | Description | Selected |
|--------|-------------|----------|
| 계정당 1개 | MVP 단순화, 작품 관리 UI 불필요 | |
| 여러 개 가능 | docs/5-2의 "진행 중인 작품 리스트"와 일치, 작품 생성/전환/목록 UI 필요 | ✓ |

**User's choice:** 여러 개 가능
**Notes:** docs/5-2가 다중 작품을 암시했지만 REQUIREMENTS.md에는 명시가 없어 확인 필요했음.

| Option | Description | Selected |
|--------|-------------|----------|
| 자동 생성 | 작가 전환 시 빈 작품 자동 생성 | |
| 명시적 생성 플로우 | 별도 "새 작품 만들기" | ✓ |

**User's choice:** 명시적 생성 플로우

**필수 메타데이터 (multiSelect):** 제목(필수) / 시놉시스 / 커버 이미지 / 장르·태그
**User's choice:** 제목, 커버 이미지, 장르/태그 (시놉시스 제외됨 — 아래 follow-up 참고)

**Follow-up — 시놉시스 처리 (READ-01과의 충돌 플래그):**
| Option | Description | Selected |
|--------|-------------|----------|
| 선택적 필드 | 미입력 시 Phase 3에서 빈 문자열/기본값 | ✓ |
| 필수로 변경 | 디스커버리 품질 보장, 생성 마찰 증가 | |

**User's choice:** 선택적 필드

| Option | Description | Selected |
|--------|-------------|----------|
| 작품별 독립 | 세계관이 작품마다 다를 수 있어 자연스러움 | ✓ |
| 계정 전체 공유 | 오사용 위험 | |

**User's choice:** 작품별 독립

**추가 논의 (사용자 요청):**
- 작품 전환: 드롭다운 vs **작품 목록 페이지(✓)**
- 장르/태그: 자유 텍스트 vs **고정 장르 리스트(✓)**
- 작품 자체 발행 상태: 보유함 vs **회차 단위만(✓)**

---

## KB 문서 구조

**초기 확인 질문 — 템플릿(양식) vs 문서(인스턴스) 구조:** 사용자가 "맞음"으로 확인.

**커스텀 템플릿 범위:**
| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2에 포함 | 범위 확장이지만 유연성 확보 | ✓ (사용자가 "둘 다 병렬적으로" 자유 응답으로 구체화) |
| 이번엔 5개 고정, 커스텀은 연기 (Recommended) | KB-01 문구 그대로 | |

**User's free-text answer:** "둘 다 병렬적으로, 작가가 원하는 방식을 선택. 작품 폴더 내외부에 템플릿 폴더가 존재하고, 수정하는 템플릿의 위치에 따라서 수정범위를 정함" → 계정 레벨 + 작품 레벨 2단 템플릿 구조로 구체화 (D-09).

**템플릿 필드 정의 — 발견 전환점:** 사용자가 `docs/Template/*.md` 실제 원본 파일 경로를 지목. Claude가 5개 파일을 읽고 제안을 전면 수정.

| Option | Description | Selected |
|--------|-------------|----------|
| 그대로 사용 | 발견된 원본 파일을 시드 콘텐츠로 | ✓ |
| 수정해서 사용 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 단일 마크다운 텍스트에어리어 | 프론트매터 포함 전체 편집, 구현 단순 | ✓ |
| 프론트매터 분리 입력폼 | UI 정교하지만 템플릿마다 다른 폼 스키마 필요 | |
| 프론트매터 제거, 본문만 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 단순 텍스트로 방치 | [[위키링크]] 비활성 텍스트, v2에서 실제 링크화 | ✓ |
| 로우 슬라이드에서 [[...]] 제거 | | |

**템플릿 계정/플랫폼 범위:**
| Option | Description | Selected |
|--------|-------------|----------|
| 본인 계정에만 | 안전, 관리 부담 적음 | ✓ |
| 플랫폼 전체에 반영 | 위험 | |

**필드 구성 제안 및 채택:**
| Option | Description | Selected |
|--------|-------------|----------|
| 좋음, 이대로 (Recommended) | | |
| 수정 필요 | 사용자가 대신 `docs/Template` 경로를 제시 — 실제 원본 채택으로 대체 | (경로 지목으로 대체됨) |

**필드 타입:**
| Option | Description | Selected |
|--------|-------------|----------|
| 모두 마크다운 텍스트 | | ✓ |
| 필드별 타입 구분 | | |

---

## 스튜디오 네비게이션 (파일트리)

**최초 배치 질문:**
| Option | Description | Selected |
|--------|-------------|----------|
| 탭 전환 (Recommended) | | |
| 별도 페이지 | | |

**User's free-text answer:** "IDE 환경처럼 폴더/파일 형태로 파일시스템 형태로 관리. docs폴더 안에 template, 인물, 사건, 장소, 아이템, 세력 폴더 등으로 관리. 가장 최상위 폴더는 각 작품폴더와 공유 template폴더, 폴더와 파일 생성은 자유로움." → 탭 대신 파일트리 구조로 완전히 대체됨.

**⚠ 범위 충돌 플래그 (Claude가 명시적으로 제기):** 이 요청은 KB-02("flat, filterable list")와 REQUIREMENTS.md Out-of-Scope의 "3패널 풀 IDE(드래그앤드롭 파일트리)" 명시와 충돌.

| Option | Description | Selected |
|--------|-------------|----------|
| 폴더 트리로 진행 (REQUIREMENTS 수정) | | ✓ |
| 평면 리스트 유지, 타입 필터만 (Recommended) | | |
| 단순화된 고정 폴더 구조 (절충안) | | |

**User's choice:** 폴더 트리로 진행 — REQUIREMENTS.md 함께 수정하기로 결정. → REQUIREMENTS.md의 KB-02 및 Out-of-Scope 표 항목을 이 세션에서 직접 수정함 (CONTEXT.md canonical_refs 참고).

**폴더 트리 구체 범위:**
| Option | Description | Selected |
|--------|-------------|----------|
| 고정 6개 폴더, 하위폴더 자유 생성 (Recommended) | | (사용자가 실제 계층 구조를 직접 서술) |
| 완전 자유 트리 | | |

**User's free-text answer:** "최상위 폴더는 template, 각 작품 폴더. 작품폴더 하위의 docs폴더와 회차폴더가 존재하고 docs 폴더 내부에 template(작품 전용), 인물/장소/세력/사건/아이템 폴더가 존재함." → 이 구조가 D-14로 확정, 이후 Claude가 재확인 질문으로 명시적 컨펌 받음("맞음").

**드래그앤드롭 이동:**
| Option | Description | Selected |
|--------|-------------|----------|
| 미포함 (Recommended) | | ✓ |
| 포함 | REQUIREMENTS Out-of-Scope와 직접 충돌 | |

**회차의 파일트리 내 위치:**
| Option | Description | Selected |
|--------|-------------|----------|
| 별도 탭/리스트 (Recommended) | | |
| 파일트리에 포함 | | ✓ |

**User's choice:** 회차도 파일트리에 포함 (`{작품}/회차/` 폴더)

**중첩 하위폴더 허용 범위 (KB 타입 폴더 내부):**
| Option | Description | Selected |
|--------|-------------|----------|
| 자유롭게 가능 (Recommended) | | ✓ |
| 1단계만 허용 | | |

**서브도메인 여부:**
| Option | Description | Selected |
|--------|-------------|----------|
| 같은 도메인 내 라우트 (Recommended) | docs/5-2의 "별도 서브도메인" 명시와 다름 — MVP 단순화 | ✓ |
| 실제 서브도메인으로 분리 | docs 기획 그대로, 배포 복잡도 증가 | |

---

## 회차 에디터 & 발행

| Option | Description | Selected |
|--------|-------------|----------|
| 플레인 텍스트 에디터 (Recommended) | Phase 4 AI 패널 추가 고려 시 단순함이 유리 | ✓ |
| 마크다운 에디터 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 자동 순번 (Recommended) | | |
| 드래그 재정렬 지원 | | ✓ |

**User's choice:** 드래그 재정렬 지원 (자동 순번 대신)

| Option | Description | Selected |
|--------|-------------|----------|
| 토글 + 자유 가격 입력 (Recommended) | | |
| 고정 가격대 선택 | | ✓ |

**User's choice:** 고정 가격대 선택 (자유 입력 대신)

**Follow-up — 구체 가격대 값:**
| Option | Description | Selected |
|--------|-------------|----------|
| Claude 제안을 planning에서 결정 (Recommended) | | ✓ |
| 직접 지정 | | |

| Option | Description | Selected |
|--------|-------------|----------|
| 바로 수정 반영 (Recommended) | 웹소설 관습과 일치 | ✓ |
| unpublish 후 수정 | | |

---

## Claude's Discretion

- 계정 레벨 vs 작품 레벨 템플릿 폴더의 시각적 구분 방식
- 폴더/파일 생성·이름변경·삭제 시 확인 다이얼로그, 파일명 충돌 검증
- 고정 가격대의 구체 토큰 값
- 고정 장르 리스트의 구체 항목
- 6개 구조 폴더의 삭제/이름변경 방지 UI 처리 방식

## Deferred Ideas

- 드래그앤드롭 파일/폴더 이동 — v2
- 위키링크 실제 연결/그래프 뷰 — v2 (EDIT-06)
- 작품 자체의 발행/비발행 상태 — 필요성 재확인 전까지 보류
- 스튜디오 서브도메인 분리 — 인프라 필요성 생길 때 재검토
- 3패널 AI 협업 캔버스, 고스트 텍스트, 토큰/비용 게이지, AI 채팅 — Phase 4
- 통계 인스펙터(완독률 그래프), Studio Home 경제 관리(충전/환전/BYOK) 메뉴 — v1 범위 전체 밖

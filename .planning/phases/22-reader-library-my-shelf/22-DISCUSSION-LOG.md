# Phase 22: 독자용 내서재 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-18
**Phase:** 22-reader-library-my-shelf
**Areas discussed:** 작가 알림, 알림 끄기, 새 회차 배지, 소장함 범위, 진도 바, 기록 삭제, 목록 형태, 비로그인

---

## 작가 알림
| Option | Description | Selected |
|---|---|---|
| 넣는다, 28 이후 실행 | 작품+작가 두 묶음, 22 실행은 28 병합 후 | ✓ |
| 작품 알림만, 작가는 후속 | 22를 28과 독립 실행 | |

## 알림 끄기
| Option | Description | Selected |
|---|---|---|
| notify 플래그로 행 유지 | work_subscriptions 컬럼 추가, 상세 버튼도 같은 플래그 | ✓ |
| 끄면 목록에서 사라짐 | 스키마 변경 없음, 목업과 다름 | |

## 새 회차 배지
| Option | Description | Selected |
|---|---|---|
| 안 읽은 새 회차가 있을 때 | 마지막 읽은 회차 이후 공개분 / 미독 작품은 추가 시각 이후 | ✓ |
| 최근 N일 안에 업데이트 | 읽음 여부 무관 | |

## 소장함 범위
| Option | Description | Selected |
|---|---|---|
| 전체·소장중만, 대여는 33 | 상태 함수는 4상태 미리 | ✓ |
| 필터 4개 모두 노출 | 대여 필터는 빈 상태 | |

## 진도 바
| Option | Description | Selected |
|---|---|---|
| 작품 전체 진도 | 읽은 회차 순번 / 공개 회차 수 | ✓ |
| 현재 회차 스크롤 진도 | max_scroll_ratio | |
| 둘 다 | | |

## 기록 삭제
| Option | Description | Selected |
|---|---|---|
| 목록에서만 숨김 | hidden_at, 다시 읽으면 복귀 | ✓ |
| 이어보기 위치까지 삭제 | 행 삭제 | |

## 목록 형태
| Option | Description | Selected |
|---|---|---|
| 목업대로 가로형 행 + 더보기 | 내서재 전용 행 컴포넌트, 24개씩 | ✓ |
| 21의 카드 그리드 재사용 | SeriesCard 슬롯 | |

## 비로그인
| Option | Description | Selected |
|---|---|---|
| 화면 안 로그인 안내 | 자동 이동 없음 | ✓ |
| 로그인 화면으로 바로 이동 | | |

## Claude's Discretion
경로 형태·기본 탭, 홈 최근 읽은 작품의 숨김 반영, 알림 꺼진 항목 완전 제거 미제공, 완결 작품 메타 문구, 빈 상태 문구, 마이그레이션 번호(총괄 확인).

## Deferred Ideas
대여 필터·팝업(Phase 33), 알림 전달 채널, 알림 항목 완전 제거.

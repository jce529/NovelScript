# Phase 12: MCP OAuth 기반 · 연결/해제 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-23
**Phase:** 12-MCP OAuth 기반 · 연결/해제
**Areas discussed:** 스파이크 범위·실패 시 대안, 동의 화면과 권한 범위, 해제 즉시 차단 방식, 연결 관리 UI

---

## 스파이크 범위·실패 시 대안
| Option | Selected |
|---|---|
| 일회용 Supabase + 터널 | ✓ |
| Vercel 프리뷰 + 공유 Supabase 설정만 | |
| 가짜 AS로 프로토콜만 확인 | |

합격선: 실제 Claude 왕복 + 해제 실증 ✓ (대안: 토큰 교환+인증 호출까지)
실패 시: 멈추고 재논의 ✓ (대안: WorkOS 자동 전환 / 직접 AS 구현)

## 동의 화면과 권한 범위
동의 화면: 앱 내 /oauth/consent ✓ (대안: Supabase 기본 화면). 독자 전용 계정: 활성화 안내 후 거절 ✓.
Scope: 사용자가 '읽기 전용 MCP가 왜 필요한가', '본문 직접 수정 불가가 무슨 뜻인가'를 질문 → 설명(Phase 13→14 순서, MCP-05 제안+수락 정책). 본문 정책은 제안 초안+작가 수락 유지 ✓, scope는 나눠서 기록 ✓.
동의 문구: 클라이언트명+접근 범위, 해제 방법 안내 선택 ('본문 직접 수정 불가' 문구는 미선택).

## 해제 즉시 차단 방식
매 호출 살아있는 grant 조회 ✓ (대안: 짧은 토큰+refresh). 조회 실패: fail closed ✓.

## 연결 관리 UI
스튜디오 설정 > AI 커넥터 ✓. 항목: 클라이언트명·연결일·마지막 사용 ✓. 해제: 확인 대화상자+'다음 호출부터 차단' ✓. 최소 도구: whoami류 1개 ✓.

## Claude's Discretion
토큰 수명 값, 터널 도구, grant 스키마 세부, 동의 화면 레이아웃.

## Deferred Ideas
승인 scope/호출 로그 표시, 자동 수락 옵션.

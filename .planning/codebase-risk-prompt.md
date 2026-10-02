당신은 코드베이스 리스크 리뷰어다. 작업 디렉터리: D:\MyProject\NovelScript (읽기 전용, 파일 수정·커밋 금지).

목표: 전체 코드베이스를 조사해 (1) 버그가 생길 만한 지점, (2) 의도가 이해되지 않거나 모순되어 보이는 부분을 찾아 보고한다.

먼저 읽을 것(경로만 지정):
- CLAUDE.md, AGENTS.md (AGENTS.md: 이 Next.js는 학습 데이터와 다르다 — node_modules/next/dist/docs/ 확인)
- .planning/PROJECT.md, .planning/ROADMAP.md, .planning/STATE.md
- .planning/phases/17-bugfix-consolidation/17-CONTEXT.md (이미 알려진 버그는 제외하고 보고)
- .planning/phases/*/bugs/ 와 .planning/fixed/ (이미 문서화된 버그와 중복 보고 금지)

중점 점검:
- 토큰/잔액 차감·원장(lib/ai/*, paid-generation 등)의 경쟁 조건, 이중 차감, 환불 누락, 예외 시 부분 커밋
- Server Action/Route의 인증·권한·소유권 검증 누락, Supabase RLS와 코드 간 불일치
- 동시 편집/이동/삭제 race, 낙관적 업데이트 불일치
- 에러 삼킴, 비동기 누락(await), 타입 단언(as any) 남용, null 처리
- 환경변수 의존, 테스트가 실제 동작을 보장하지 못하는 부분
- 문서(.planning)와 실제 코드가 어긋난 곳, 죽은 코드, 이름과 동작이 다른 함수

출력 형식(한국어, 마크다운): 항목마다 `심각도(high/medium/low) | file:line | 무슨 문제 | 어떤 입력/상황에서 깨지는지 | 확신도(확실/추정)`. "이해 안 되는 부분"은 별도 섹션으로 질문 형태로 적는다. 추측은 추정으로 표시하고, 근거 코드를 직접 확인한 것만 '확실'로 쓴다. 최대 30개, 심각도순.

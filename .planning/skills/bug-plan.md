# /bug-plan

버그를 발견했을 때 실행한다. 코드를 고치지 않는다 — **문서화 + 원인 분석 + 수정 방향 결정까지만** 한다.

## 입력

- 증상 설명(자연어), 또는 기존 `BUG-NN` ID(이미 있는 버그를 다시 조사/갱신할 때).

## 절차

1. **origin phase 판단**: 버그를 일으키는 코드가 어느 phase에서 만들어졌는지 확인한다(`git blame`, `git log -S`, 또는 `.planning/ROADMAP.md`의 phase별 파일 대응). 애매하면 사용자에게 묻는다. **버그를 "발견한" phase가 아니라 "원인이 있는" phase**에 문서를 둔다.
2. **폴더 확인**: `.planning/phases/{padded_phase}-{slug}/bugs/`가 없으면 만든다. `bugs/README.md`가 없으면 아래 템플릿으로 만든다.

   ```markdown
   # Phase {NN} — 발견된 버그

   {phase 이름} 코드에서 원인이 발생한 버그를 모은다.

   | ID | 제목 | 심각도 | 발견 | 상태 |
   |---|---|---|---|---|

   ## 템플릿

   새 버그는 `BUG-NN-짧은-슬러그.md`로 추가하고 위 표에 한 줄 넣는다. 완전히 고쳐지면 이 폴더에서 삭제하고 `.planning/fixed/{phase}-{번호} 간단한 정리.md`로 옮긴다.
   ```

3. **번호 부여**: 그 phase 폴더 안에서만 유효한 번호다(전역 번호 아님) — 기존 `BUG-NN-*.md` 중 가장 큰 NN 다음 번호. 폴더가 비어 있으면 `BUG-01`.
4. **조사**: 재현 시도, 관련 코드 읽기(`Read`/`Grep`), 필요하면 테스트를 먼저 작성해 증상을 재현한다. 원인을 코드 수준까지 좁힌다.
5. **문서 작성**: `.planning/phases/{phase}/bugs/BUG-NN-슬러그.md`를 아래 프런트매터 + 섹션으로 쓴다.

   ```markdown
   ---
   id: BUG-NN
   title: <한 줄 제목>
   status: open
   severity: high|medium|low
   found: <YYYY-MM-DD>
   found_during: <어떤 세션/체크포인트에서 발견했는지>
   origin_phase: <NN (근거 커밋/plan)>
   files:
     - <관련 파일 경로>
   ---

   # BUG-NN: <제목>

   ## 증상
   ## 재현
   ## 기대 / 실제
   ## 원인
   ## 수정 방향
   ## 검증
   ```

   - **수정 방향**이 정책/트레이드오프 결정을 필요로 하면(예: 과금 정책, 품질 vs 비용) 여러 옵션을 A/B/C로 나열만 하고 **사용자에게 물어서 확정한 뒤** 적는다 — 이 스킬이 단독으로 정책을 결정하지 않는다.
6. **README 갱신**: 해당 phase `bugs/README.md` 표에 새 행 추가.
7. **보고**: 사용자에게 증상·원인·수정 방향 요약을 보여주고, 바로 `/bug-execute`로 이어갈지 확인한다.

---
id: BUG-05
title: 재생성 링크 가드가 KB에 실제로 있는 문서 링크까지 거부해 기본 인물 템플릿 재생성이 실패한다
status: open (수정 방향 확정 — 3안)
severity: medium
found: 2026-10-02
found_during: Phase 15 BUG-03/04 브라우저 UAT (임시 진단 로그로 거부 사유 확인)
origin_phase: 15 (744045c fix(15): BUG-04 validate wikilinks on template regeneration)
files:
  - lib/ai/document-regenerate.ts
  - tests/ai/regenerate-document.test.ts
---

# BUG-05: 링크 가드가 실제 존재하는 문서 링크까지 거부

## 증상
링크 없는 인물 제안(예: 서하준)을 저장 모달에서 "기본 인물 템플릿"으로 바꿔 "다시 생성하기"하면 "문서를 다시 생성하지 못했어요. 다시 시도해주세요."가 뜨고 저장되지 않는다. 같은 모델 호출이 성공 응답을 줬는데도 매번 거부된다.

## 재현
1. 작품에 `채아`, `강진욱` 인물 문서 등이 있는 상태에서 "새 인물 ○○에 대한 인물 설정 문서를 만들어줘"로 링크 없는 제안을 만든다.
2. 저장 모달 → 템플릿 변경 → "기본 인물 템플릿" → "다시 생성하기".
3. 서버 로그(임시 진단): `validateDocumentAgainstPlan` 통과, 본문 제목 `# 👤 서하준` 통과, 링크 단계에서 `originalLinks=[]`, `regeneratedLinks=["세현그룹","채아","강진욱"]` → `REGENERATION_FAILED`.

## 기대 / 실제
- 기대: 템플릿 칸("연관된 세력", "주요 인물 관계")을 이 작품 KB에 실제 있는 문서 링크로 채운 재생성은 통과한다. KB에 없는 문서를 지어낸 링크만 막는다.
- 실제: 원본에 없던 링크는 존재 여부와 무관하게 전부 거부된다. 링크 칸이 있는 템플릿은 링크 없는 원본에서 사실상 항상 실패한다(Phase 15 BUG-03 UAT 2-3 "모든 항목 재생성"이 이 때문에 실패).

## 원인
`document-regenerate.ts`의 링크 가드가 "재생성 링크 대상 ⊆ 원본 링크 대상"만 검사한다(`originalLinks.includes(target)`). BUG-04 수정에서 "원본에 없는 사실을 새로 확정하지 않는다"를 링크로 근사했는데, 템플릿 구조상 링크를 채우는 것 자체는 정상이고 KB에 있는 문서 링크는 지어낸 사실이 아니다. 이름 유지·제목 검증과 달리 이 검사는 KB를 조회하지 않는다.

## 수정 방향
확정 — 사용자 결정(2026-10-02): **3안, 새 링크 대상이 KB에 실제 존재하는 문서면 허용**.

1. `document-regenerate.ts`: 재생성 본문의 링크 대상 중 원본에 없던 대상(`newTargets`)만 모아 KB를 한 번 조회한다.
   - 범위: 호출자 본인(`owner_id`)의 `node_type = 'file'`, `deleted_at is null` 노드 중 (a) 이 작품 `scope = 'work'` + `work_id = input.workId`, (b) 본인 계정 공유 `scope = 'account_template'`. 다른 작품·다른 사용자 문서는 포함하지 않는다(D-10 단방향 규칙과 같은 범위, `lib/ai/mentions.ts`의 `searchMentionNodes` 쿼리 조건 참고).
   - 이름 비교는 정확 일치(대소문자·공백 trim). `newTargets`가 비어 있으면 조회하지 않는다.
   - `newTargets` 중 하나라도 위 범위에 없으면 `REGENERATION_FAILED`(지어낸 링크 차단은 유지).
2. 유지: 원본의 자기 이름 링크 보존 규칙(원본 `[[이름]]`이 재생성에도 남아야 함), 이름 강제·본문 제목 검증은 그대로 둔다.
3. 조회 실패(DB 오류)는 허용으로 넘기지 않고 `REGENERATION_FAILED`로 처리한다(fail closed). 결제 처리 순서는 바꾸지 않는다.
4. 결정이 필요 없는 세부: `[[이름|표시문구]]`·`[[이름#섹션]]` 형태는 현재 정규식이 전체를 대상으로 잡는다. 이 버그에서는 건드리지 않고, 실행 단계에서 모델이 그런 형태를 내는지 로그로 확인해 필요하면 별도 BUG로 올린다.

### 범위 밖 — 사용자 확인 필요(이 버그에 포함하지 않음)
가드가 거부한 뒤 같은 템플릿으로 다시 누르면 같은 idempotency 키가 재사용돼 "같은 요청이 두 번 전송돼…"가 먼저 뜬다(`SaveDocumentPlanModal.tsx`의 `regenKeyRef`는 `already_processed`에서만 초기화). 거부된 유료 생성의 재시도를 새로 과금할지가 과금 정책이라 별도 결정이 필요하다. 3안으로 거부가 크게 줄어드는 점을 확인한 뒤 다룬다.

## 검증
- 단위 테스트(먼저 실패 확인): KB에 있는 새 링크만 있는 재생성 통과 / KB에 없는 링크가 하나라도 있으면 `REGENERATION_FAILED` / 다른 작품·삭제된 문서 이름은 거부 / 조회 오류는 `REGENERATION_FAILED` / 새 링크가 없으면 KB를 조회하지 않음. 기존 `tests/ai/regenerate-document.test.ts`는 `db`가 빈 객체 목이므로 KB 조회 목을 추가해야 한다.
- 기존 이름 유지·제목 검증·원본 링크 보존 회귀 통과.
- 브라우저 UAT: 링크 없는 제안을 "기본 인물 템플릿"으로 재생성 → 저장 성공. 본문 링크가 모두 KB 문서인지 확인. 이후 Phase 15 UAT-CHECKLIST 2-3 "모든 항목 재생성"과 BUG-04 4번(링크 있는 원본) 재확인.

## 실제 적용 내용 (bug-execute, 2026-10-02)
- `lib/ai/document-regenerate.ts`: `findExistingLinkTargets` 추가(작품 file 노드는 5개 카테고리+`custom`, 계정 공유 `account_template` file 노드는 전체, 모두 `owner_id` 일치·`deleted_at is null`). 원본에 없던 새 링크 대상(중복 제거·trim)이 있을 때만 조회하고, 하나라도 없거나 조회 오류면 `REGENERATION_FAILED`(fail closed). 원본 자기 이름 링크 보존·이름 강제·본문 제목 검증은 그대로.
- `tests/ai/regenerate-document.test.ts`: KB 있는 링크 통과 / 없는 링크 거부 / 다른 작품·다른 소유자·삭제·폴더·템플릿 스텁 거부 / 조회 오류 거부 / 새 링크 없으면 조회 안 함 / 자기 링크 보존 6건 추가.
- 검증: `tests/ai tests/kb tests/studio` 62파일 641 통과, `tsc --noEmit`·`npm run lint` 통과.
- 실제 DB 확인: 같은 필터로 서비스 롤 조회 시 `강진욱`·`박도현`·`왕국연대기`(계정 공유)·`인물`은 찾고 `한채아`·`태강그룹`은 찾지 못함.
- **브라우저 UAT — 성공 경로 미확인**: 링크 없는 제안(서하준)과 `강진욱·박도현`만 링크한 제안(윤서진)을 "기본 인물 템플릿"으로 재생성했을 때 모델이 KB에 문서가 없는 `세현그룹`·`채아`·`태강그룹`·`한채아`를 새로 링크해 가드가 거부했다(임시 진단 로그: `newTargets=["태강그룹","한채아"]`, `existing=[]`). 3안의 의도대로 거부된 것이지만, "KB에 있는 링크만 새로 추가돼 통과"하는 경우는 모델이 그렇게 응답하지 않아 브라우저에서 재현하지 못했다. 통과 경로는 단위 테스트와 DB 쿼리 확인으로 대신했다. **남은 UX 문제**: 이 작품처럼 본문에만 있고 KB 문서가 없는 이름(채아·세현그룹 등)을 모델이 링크하면 기본 인물 템플릿 재생성은 여전히 자주 거부된다. 모델에 "KB에 있는 문서만 링크"를 알려 주는 프롬프트 보강이나 새 링크 제거 후 통과(2안)가 후속 후보다 — 사용자 결정 필요.

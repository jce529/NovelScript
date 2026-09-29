---
id: BUG-03
title: 저장 모달의 템플릿 목록이 카테고리로 걸러지지 않아 다른 카테고리 템플릿 선택 시 재생성이 실패한다
status: open (수정 방향 확정)
severity: medium
found: 2026-09-29
found_during: Phase 15 HUMAN-UAT Item 2 재시도 (브라우저 UAT, localhost:3000)
origin_phase: 15 (7674e20 feat(15-06) 모달 + lib/kb/actions.ts listTemplateOptions)
files:
  - lib/kb/actions.ts
  - lib/ai/document-regenerate.ts
  - app/studio/[workId]/chapters/[chapterId]/ai-panel/SaveDocumentPlanModal.tsx
---

# BUG-03: 저장 모달의 템플릿 목록이 카테고리로 걸러지지 않는다

## 증상
"인물" 문서의 저장 모달 "템플릿 변경" 목록에 인물 외에 장소·사건·세력·아이템 템플릿이 그대로 나온다. 같은 이름이 두 번씩 보이기도 한다(작품 템플릿 폴더 + 계정 템플릿 폴더에 같은 이름이 있음). 인물 문서에 "장소" 템플릿을 고르고 "다시 생성하기"를 누르면 약 2.5초 뒤 "문서를 다시 생성하지 못했어요. 다시 시도해주세요."가 뜨고 템플릿이 추천값으로 되돌아간다.

## 재현
1. 인물 문서 생성 → 저장 모달 → "템플릿 변경"에서 "장소" 선택 → "이 위치에 저장하기" → "다시 생성하기".
2. 실패 배너 표시. 서버 로그에는 provider 실패(`[ai] provider call failed`)가 없고 `regenerateDocumentWithTemplateAction`이 2.5초 만에 정상 반환한다.
3. 같은 흐름에서 "기본 인물 템플릿"을 고르면 재생성·저장이 성공한다.

## 기대 / 실제
- 기대: 목록에는 해당 문서 카테고리에 쓸 수 있는 템플릿만 나오고, 고를 수 있는 항목은 재생성이 성공한다.
- 실제: 카테고리와 무관한 템플릿이 노출되고, 선택하면 재생성 결과가 검증에서 탈락해 실패한다.

## 원인
`listTemplateOptions`(`lib/kb/actions.ts:89-129`)의 `category` 인자는 기본값 판정(`o.name === category`)과 캐노니컬 템플릿 이름(`기본 ${category} 템플릿`)에만 쓰이고, 작품/계정 템플릿 폴더의 파일 목록은 카테고리 필터 없이 전부 추가한다. 재생성 쪽(`lib/ai/document-regenerate.ts:88-91`)은 모델 출력이 문서 카테고리·템플릿 구조와 맞는지 `validateDocumentAgainstPlan`으로 검증하므로, 맞지 않는 템플릿(장소)으로 다시 만든 결과는 `REGENERATION_FAILED`로 걸러진다. 즉 검증은 정상이고 목록이 너무 넓은 것이 원인이다. (템플릿 노드에 카테고리 필드가 있는지, 이름 규칙만 있는지는 수정 시 확인 필요.)

## 조사 결과 (코드 확인, 2026-09-29)
- 템플릿 파일 노드는 전부 `kb_nodes.category = 'template'`이다(`0002_studio.sql`의 check 제약, `seedTemplateFiles`도 동일). 즉 "이 템플릿이 어느 문서 카테고리용인지"를 담는 필드가 **현재 스키마에 없고**, 이름(`name = '인물'` 등)이 유일한 단서다. B안은 새 컬럼이 필요하다.
- `listTemplateOptions`는 D-10 설계상 파일명과 무관하게 전부 나열한다(주석과 `tests/kb/template-options.test.ts`가 "커스텀 이름 `내캐릭터양식`도 목록에 나와야 한다"고 단언). 카테고리 필터를 넣으면 이 테스트 기대값이 바뀐다.
- 같은 함수를 `lib/ai/decision/plan.ts`(AI 템플릿 추천)와 `validateTargetTemplate`(재생성/저장 재검증)도 쓴다. 필터는 이 공통 함수에 넣어야 목록·추천·검증이 어긋나지 않는다.

## 추가 조사 (폴더 구조안 검토, 2026-09-29)
- **템플릿 파일을 만드는 UI가 지금 없다**: `kb-node-dialogs.tsx:34`가 `category === 'template'` 폴더에는 "하위 문서 추가"를 숨긴다. 존재하는 템플릿 파일은 `seedTemplateFiles`가 시드한 이름=카테고리 파일(`인물` 등)뿐이고, 임의 이름 파일은 테스트/직접 삽입으로만 생긴다. 실사용 데이터에 커스텀 이름 템플릿이 있을 가능성은 낮지만 배포 DB에서 확인이 필요하다.
- **이동 기능이 없다**: KB 트리에 이동/드래그가 없고 `lib/kb/actions.ts`에도 `moveNode`가 없다. 폴더로 카테고리를 표현하려면 "카테고리 폴더로 이동" 최소 기능이 필요하다.
- **`ancestor_ids`/`depth`는 쓰이지 않는다**(트리는 `parent_id`로만 구성, `tree.ts:43` 주석). 이동은 `parent_id` 갱신만으로 된다.
- **`category = 'template'` 폴더를 `.maybeSingle()`로 찾는 곳이 5곳이다**(`actions.ts:55,63,96,106`, `works/actions.ts:50`). 템플릿 하위에 `category='template'` 폴더가 여러 개 생기면 다중 행 오류가 나므로 모두 `parent_id is null`(루트) 조건을 추가해야 한다. (하위 폴더의 category는 `createFolder`가 부모에서 물려받아 `template`이 되며, 문서 카테고리명으로 바꾸면 `listCategoryFolderCandidates`가 템플릿 폴더를 문서 폴더로 오인하므로 `template`을 유지한다.)
- 형제 이름 유니크(`kb_nodes_sibling_name_unique`)는 부모 단위라 `template/인물/인물` 같은 구조가 충돌하지 않는다. 루트 유니크 인덱스(`0010`)는 `parent_id is null`만 대상이라 하위 폴더에 영향이 없다.

## 수정 방향 (확정 — 사용자 결정: 폴더 구조 + 카테고리 지정 UI 포함)
컬럼(`template_category`) 대신 **폴더 위치가 카테고리**다. 앞선 B안(메타데이터)은 폴더 구조로 대체한다.

1. **구조**: 작품과 계정 각각의 `template` 루트 아래에 카테고리 폴더 5개(`인물`/`장소`/`사건`/`세력`/`아이템`)를 둔다. 계정 영역과 작품 영역이 각자 이 구조를 가지므로 "영역 분리"가 저장 구조와 목록 그룹 양쪽에서 성립한다.
   ```
   [작품] template/ 인물/ 장소/ 사건/ 세력/ 아이템/
   [계정] template/ 인물/ 장소/ 사건/ 세력/ 아이템/
   ```
   - 카테고리 폴더는 잠금(`is_locked=true`, 이름 변경·삭제 불가), `category='template'` 유지.
   - 템플릿 파일의 카테고리 = 부모가 이 5개 폴더 중 무엇이냐. 카테고리 폴더 안에서는 파일명이 자유다(D-10 유지).
   - 카테고리 폴더 아래에 하위 폴더는 만들지 않는다(템플릿 트리에서 "새 폴더 만들기" 숨김 + `createFolder` 서버 거부). 템플릿 트리를 평평하게 둬서 카테고리 판정을 단순하게 한다.
2. **생성 경로**: `create_work`/`ensure_account_template_root`(SQL)와 `seedTemplateFiles`가 카테고리 폴더를 만들고, 시드 파일(`name = category`, 기본 템플릿)을 각 폴더 안에 넣는다.
3. **마이그레이션**(새 SQL, 기존 데이터): 모든 작품/계정 루트에 카테고리 폴더를 만들고, 루트 바로 아래의 이름=카테고리 파일은 해당 폴더로 `parent_id`를 옮긴다. 이름이 카테고리와 다른 파일·폴더는 **루트에 그대로 두되** 목록에서는 제외하고, 트리에서 "카테고리 폴더로 이동" 대상으로 노출한다. 데이터 유실 없이 재실행 가능(idempotent)해야 한다.
4. **`listTemplateOptions`**: 카테고리 폴더(작품/계정 각각)의 직속 파일만 반환한다. 캐노니컬(`기본 ${category} 템플릿`)은 항상 포함한다. 기본값 우선순위(작품 > 계정 > 캐노니컬, 파일명 = 카테고리)는 유지. `resolveTemplateOverride`도 같은 카테고리 폴더에서 찾도록 바꾼다. 루트 조회 5곳에 `parent_id is null`을 추가한다.
5. **영역 분리 표시**: 저장 모달과 `CreateNodeDialog`의 템플릿 셀렉트를 `작품 템플릿` / `계정 템플릿` / `기본 템플릿` 그룹으로 나눈다(같은 이름이 두 영역에 있어도 각각 표시).
6. **카테고리 지정 UI(이번 버그에 포함)**:
   - 카테고리 폴더 행에서 "하위 문서 추가"를 열어 그 폴더 안에 템플릿 파일을 만든다. 이때 내용은 해당 카테고리의 캐노니컬 템플릿 원문(제목 치환 없음, `seedTemplateFiles`와 동일)으로 채운다. 기존 `createNode`는 `category==='template'`이면 내용을 비우므로 이 경로를 보강한다.
   - 템플릿 파일 행에 "카테고리 폴더로 이동"(5개 중 선택) 액션을 추가한다. 서버는 `moveTemplateFile`(템플릿 트리 내부, 같은 영역, 대상이 카테고리 폴더인 경우만 허용, 이름 충돌 시 친절한 오류)로 `parent_id`만 갱신한다. 루트에 남은 미분류 파일이 이 액션으로 편입된다.
   - 템플릿 루트 직속에 새 파일은 만들 수 없게 유지한다.
7. `validateDocumentAgainstPlan`은 방어선으로 그대로 둔다.

### 범위/위험 메모
- 이 버그 중 가장 큰 수정이다: SQL 마이그레이션 1개(+`create_work`/`ensure_account_template_root` 갱신), `lib/kb`(actions/templates/works), 서버 액션, KB 트리 UI, 모달 UI, 테스트 여러 개. 실행 시 SQL/조회 정합 → 서버 로직 → UI 순서의 단계별 커밋을 권장한다.
- 영향받는 기존 테스트: `template-options`, `locked-folder-guard`, `custom-folder-create`, `tree-query`, `template-substitution`, `document-crud`.
- AI 템플릿 추천(`plan.ts`)은 `listTemplateOptions`를 그대로 쓰므로 후보가 카테고리별로 좁혀진다. 후보가 캐노니컬 하나뿐일 때의 fallback 동작을 구현 중 확인한다.

## 검증
- `tests/kb/template-options.test.ts` 갱신: 카테고리 폴더 직속 파일만 나오는지, 다른 카테고리 폴더 파일은 안 나오는지, 커스텀 이름 파일도 카테고리 폴더 안이면 나오는지, 작품/계정 영역이 각각 반환되는지(같은 이름이 양쪽에 있어도).
- 생성 경로: `create_work`/`ensure_account_template_root`/`seedTemplateFiles` 후 카테고리 폴더 5개와 시드 파일 위치가 맞는지, 재실행해도 중복이 없는지.
- 마이그레이션: 기존 평면 구조 데이터에서 이름=카테고리 파일이 이동되고, 커스텀 이름 파일은 루트에 남아 목록에서 제외되는지, 재실행이 안전한지.
- `moveTemplateFile`: 카테고리 폴더로만 이동 가능, 영역/소유 위반·충돌 거부, 이동 후 목록 반영.
- 템플릿 트리에서 폴더 생성 거부, 루트 직속 파일 생성 거부, 카테고리 폴더 안 파일 생성 시 캐노니컬 내용 시드.
- 회귀: 인물 문서에서 목록의 모든 선택 가능 항목에 대해 재생성이 성공하는지(모델은 픽스처/모킹).
- 브라우저 UAT: 저장 모달의 템플릿 목록이 영역별 그룹·해당 카테고리 항목만 보이는지, KB 트리에서 카테고리 폴더 안에 템플릿 생성·이동이 되는지.

-- Phase 02 Reopen D-10 (2026-10-12): 기본 템플릿 5종(인물·장소·사건·세력·아이템)은 읽기 전용이다.
-- 이 마이그레이션은 데이터를 보존하면서 기본 파일을 원본으로 되돌리고 잠근다.
--
-- 순서:
--   1. kb_nodes 를 EXCLUSIVE 잠금 → 이관 중 동시 편집으로 부분 이관이 생기지 않는다.
--   2. kb_template_seed_catalog (private): docs/Template 원문(BOM 포함, 개행은 LF)을 그대로 담는다.
--      인증 사용자·anon 은 읽기·쓰기 모두 불가하다. 0023 의 guard 가 이 catalog 로 seed 를 검증한다.
--   3. kb_template_backfill_copies (private provenance): 원본 id ↔ 사본 id, 둘 다 unique.
--      같은 원본을 두 번 복사하지 않는다 → 재실행 안전.
--   4. 활성 카테고리 폴더 안에서 name = 폴더 이름(=카테고리)인 기본 후보만 대상이다.
--      내용이 원본과 다르면(CR·선두 BOM 차이는 무시) 같은 폴더에 잠금 없는 "{카테고리} 사본"으로
--      byte-for-byte 보존한 뒤 원본으로 복원·잠금한다. 이름 충돌은 " 2", " 3" … 번호 접미사.
--   5. 이름이 바뀌었거나 다른 폴더로 옮겨진 기존 파일의 과거 정체는 추측하지 않는다(사용자 템플릿으로 남김).
--      대신 기본 파일이 없는 카테고리 폴더에 원본 기본 파일을 잠금 상태로 새로 채운다.
--   6. 삭제된 행·일반 문서·사용자 폴더·회차는 건드리지 않는다.
-- 템플릿 영역 이름 유일성과 DB 우회 차단은 0023_template_policy_guards.sql 이 맡는다.
begin;

lock table kb_nodes in exclusive mode;

create table if not exists kb_template_seed_catalog (
  name text primary key check (name in ('인물','장소','사건','세력','아이템')),
  content text not null,
  updated_at timestamptz not null default now()
);
alter table kb_template_seed_catalog enable row level security;
revoke all on table kb_template_seed_catalog from public, anon, authenticated;

create table if not exists kb_template_backfill_copies (
  original_id uuid primary key references kb_nodes(id),
  copy_id uuid not null unique references kb_nodes(id),
  migrated_at timestamptz not null default now()
);
alter table kb_template_backfill_copies enable row level security;
revoke all on table kb_template_backfill_copies from public, anon, authenticated;

-- canonical raw seed: docs/Template/{카테고리} 템플릿.md 원문. 선두 U+FEFF(BOM)는 chr(65279)로 붙이고,
-- 작업 트리의 CRLF 변환(core.autocrlf)에 흔들리지 않도록 CR 을 제거한다(저장소 원본은 LF).
insert into kb_template_seed_catalog (name, content) values
  ('인물', replace(chr(65279) || $seed_person$---
aliases: []
tags:
  - 인물
배역:
나이:
---
# 👤 <% tp.file.title %>

## 📌 기본 정보
- **이름**: <% tp.file.title %>
- **외양/특징**: (여기에 눈동자 색, 흉터, 체격, 버릇 등을 적으세요)
- **목표/동기**: (이 캐릭터가 궁극적으로 원하는 것)
- **소지 아이템**: (예: [[엑스칼리버]], 낡은 회중시계 등)

## 🧠 성격 및 배경
- **성격**: 
- **과거 배경**: (이 인물이 살아온 삶의 요약)

## 🤝 인물 및 세력 관계도
- **연관된 세력**: (예: [[원탁의 기사단]] 소속, [[색슨족]]과 적대)
- **주요 인물 관계**:
  - [[인물A]]: (관계 설명 - 예: 맹세한 주군)
  - [[인물B]]: (관계 설명 - 예: 과거에 배신당함)

## 📜 연관된 사건 (타임라인)
- [[사건 링크]] - (등장 회차 혹은 시점 설명)
  - 예: [[드래곤 토벌전]] - 15화~18화
  - 예: [[부모님 사망]] - 프롤로그 (과거)$seed_person$, chr(13), '')),
  ('장소', replace(chr(65279) || $seed_place$---
aliases: []
tags:
  - 장소
통치세력: 
---
# 🗺️ <% tp.file.title %>

## 📌 기본 정보
- **위치**: (대륙, 국가, 혹은 인접한 주요 랜드마크와의 거리)
- **통치 세력 / 지배자**: (이곳을 다스리거나 점거 중인 세력 - 예: [[원탁의 기사단]], 무법지대)
- **장소의 특성**: (기후, 문화, 위험 요소 - 예: 1년 내내 안개가 낌, 독 늪지대)

## 👁️ 외형 및 묘사
- **전체적인 풍경**: (이 장소에 처음 진입했을 때 눈에 들어오는 첫인상과 분위기)
- **주요 랜드마크**: (장소 내의 상징적인 지형이나 건축물 - 예: 거대한 세계수 뿌리, 무너진 종탑)

## 📦 획득 가능한 아이템 (특산물)
- [[아이템A]]: (획득 위치 및 방법 - 예: 무너진 종탑 지하에 숨겨져 있음)
- (기타: 특수한 약초나 광물 등 서사에 쓰일 자원)

## 얽힌 서사 (스토리)
- **장소와 연관된 인물**:
  - **거주자/토착민**: [[인물A]], [[인물B]]
  - **방문자 (거쳐가는 인물)**: [[주인공 일행]] (방문 목적 - 예: 성검 획득을 위해)
- **장소에서 일어나는 사건**:
  - [[사건 링크]]: (이 장소에서 벌어지는 주요 사건 타임라인)$seed_place$, chr(13), '')),
  ('사건', replace(chr(65279) || $seed_event$---
aliases: []
tags:
  - 사건
발생회차: 
---
## 📌 사건 개요
- **배경 (장소 및 시점)**: (예: [[검은 숲]] / 15화~18화)
- **발생 원인 (발단)**: (이 사건이 일어나게 된 결정적 이유나 계기)

## 👥 얽힌 인물 및 사물
- **참여 인물**:
  - **주역**: [[인물A]] (목적이나 역할 - 예: 생존을 위해 싸움)
  - **조연**: [[인물B]] (영향이나 역할 - 예: 주역을 돕다 부상을 입음)
- **핵심 아이템 및 단서**: [[아이템A]] (예: 사건을 해결하거나 원인이 된 물건)

## ⏳ 전개 타임라인
> 사건의 흐름을 시간 순서대로 기록하세요. 글을 쓰면서 하나씩 체크하면 좋습니다.
- [ ] **도입**: (예: 인물A가 단서를 쫓아 검은 숲에 진입함)
- [ ] **전개**: (예: 매복해 있던 적대 세력과 조우하여 전투 발생)
- [ ] **위기/절정**: (예: 수세에 몰렸을 때 핵심 아이템 각성)
- [ ] **결말**: (예: 적을 물리치고 다음 목적지에 대한 지도를 습득함)

## 🦋 사건의 여파 (나비효과)
- **인물의 변화**:
  - [[인물A]]: (가치관, 지위, 관계 등의 변화 - 예: 전투의 트라우마가 생김)
- **다음 사건으로의 연결**:
  - (이 사건의 결과로 인해 파생될 다음 사건이나 새로운 목표 기입)
  - 예: 획득한 지도를 바탕으로 [[왕도 잠입 사건]]으로 이어짐$seed_event$, chr(13), '')),
  ('세력', replace(chr(65279) || $seed_faction$---
aliases: []
tags:
  - 세력
지도자: 
---
# 🛡️ <% tp.file.title %>

## 📌 기본 정보
- **설립 목적 및 이념**: (이 세력이 궁극적으로 추구하는 바)
- **세력 규모 및 특징**: (예: 대륙 절반을 장악한 거대 제국, 소수 정예 암살단, 자금력이 막강함 등)
- **지도자**: [[인물A]] (초대 지도자 또는 현재 지도자)

## 🗺️ 영토 및 자산
- **통치 지역 (거점)**:
  - [[장소A]]: (수도 또는 메인 본부)
  - [[장소B]]: (주요 관리 지역)
- **보유 아이템 (아티팩트)**: 
  - [[아이템A]]: (세력의 상징이거나 비밀리에 보관 중인 물건)

## 🤝 관계도 및 소속 인물
- **내부 인물 구성**:
  - **핵심 간부**: [[인물B]], [[인물C]]
  - **소속 인물**: (기타 조연 및 소속원들)
- **외부 세력 관계**:
  - **우호/동맹**: [[우호 세력]] (협력하는 이유)
  - **적대/대립**: [[적대 세력]] (갈등의 원인 - 예: 영토 분쟁)

## 📜 연관된 사건 (세력의 역사)
> 이 세력이 개입했거나 겪은 주요 사건들을 타임라인 순으로 기록해.
- [ ] [[과거 사건 링크]]: (예: 10년 전 대륙 전쟁에서 승리하여 현재의 영토 구축)
- [ ] [[현재 사건 링크]]: (예: 주인공 일행과 마찰이 생기는 사건)
- [ ] [[미래/예정 사건 링크]]: (이 세력이 앞으로 일으킬 계획이나 몰락 등)$seed_faction$, chr(13), '')),
  ('아이템', replace(chr(65279) || $seed_item$---
aliases: []
tags:
  - 아이템
현재소유자: 
---
# ⚔️ <% tp.file.title %>

## 📌 기본 정보
- **기원과 가치**: (누가, 언제, 왜 만들었는지 / 세계관 내에서의 희귀도나 취급)
- **외형 및 상태 묘사**:
  - **평상시**: (평소의 외형, 질감, 색상 등)
  - **개방/발동 시**: (능력을 사용할 때 생기는 시각적, 청각적 변화)

## ✨ 능력과 한계
- **주요 능력**: (이 아이템이 가진 특별한 힘이나 기능)
- **제약 및 페널티 (리스크)**: (사용 조건, 쿨타임, 사용자에게 미치는 악영향, 치명적인 약점 등)

## 📜 소유자 및 서사 타임라인
> 💡 아이템이 누구의 손을 거쳐 어떻게 변화했는지 시간순으로 기록해. 
> 소유자가 바뀔 때마다 아래 양식을 복사해서 추가하면 돼.

- [ ] **1대 (최초) 소유자**: [[인물A]]
  - **획득 상황**: (어디서, 어떻게, 누구에게서 얻었는가?)
  - **연관 사건**: [[사건 링크]] (이 아이템이 활약하거나 문제가 된 핵심 사건)
  - **변화 시점**: (이 시기에 아이템이 겪은 형태적 파손, 능력의 각성 등)

- [ ] **2대 소유자**: [[인물B]]
  - **획득 상황**: (이전 소유자에게서 어떻게 넘어왔는가? - 예: 유품, 도난, 전리품)
  - **연관 사건**: [[사건 링크]]
  - **변화 시점**: (봉인, 강화 등 새로운 변화 기입)$seed_item$, chr(13), ''))
on conflict (name) do update set content = excluded.content, updated_at = now()
  where kb_template_seed_catalog.content is distinct from excluded.content;

do $$
declare
  r record;
  v_norm text;
  v_base text;
  v_name text;
  v_n integer;
  v_copy_id uuid;
begin
  for r in
    select file.id, file.owner_id, file.work_id, file.scope, file.parent_id, file.name,
           file.content, file.is_locked, seed.content as canonical
    from kb_nodes file
    join kb_nodes folder on folder.id = file.parent_id
    join kb_nodes root on root.id = folder.parent_id
    join kb_template_seed_catalog seed on seed.name = folder.name
    where file.node_type = 'file' and file.category = 'template' and file.deleted_at is null
      and file.name = folder.name
      and folder.node_type = 'folder' and folder.category = 'template' and folder.deleted_at is null
      and root.node_type = 'folder' and root.category = 'template' and root.parent_id is null
      and root.deleted_at is null
      and folder.owner_id = file.owner_id and root.owner_id = file.owner_id
      and folder.scope = file.scope and root.scope = file.scope
      and folder.work_id is not distinct from file.work_id
      and root.work_id is not distinct from file.work_id
      and (not file.is_locked or file.content is distinct from seed.content)
    order by file.created_at, file.id
  loop
    v_norm := ltrim(replace(coalesce(r.content, ''), chr(13), ''), chr(65279));
    if v_norm <> ltrim(r.canonical, chr(65279)) and btrim(v_norm) <> '' then
      if exists (select 1 from kb_template_backfill_copies where original_id = r.id) then
        -- 이미 한 번 보존·복원한 기본 파일이 다시 달라졌다: 조용히 덮어쓰지 않고 사람이 정리하게 한다.
        raise exception 'template_backfill_conflict: % was already preserved and differs again', r.id;
      end if;

      v_base := r.name || ' 사본';
      v_name := v_base;
      v_n := 1;
      while exists (
        select 1 from kb_nodes o
        where o.deleted_at is null and o.owner_id = r.owner_id
          and o.work_id is not distinct from r.work_id
          and ((o.node_type = 'file' and o.category = 'template' and btrim(o.name) = v_name)
               or (o.parent_id = r.parent_id and o.name = v_name))
      ) loop
        v_n := v_n + 1;
        v_name := v_base || ' ' || v_n;
      end loop;

      insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
      values (r.owner_id, r.work_id, r.scope, r.parent_id, 'file', 'template', false, v_name, r.content)
      returning id into v_copy_id;

      insert into kb_template_backfill_copies (original_id, copy_id) values (r.id, v_copy_id);
    end if;

    update kb_nodes set content = r.canonical, is_locked = true, updated_at = now() where id = r.id;
  end loop;
end $$;

-- 기본 파일이 없는 활성 카테고리 폴더에 원본 기본 파일을 잠금 상태로 채운다.
insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name, content)
select folder.owner_id, folder.work_id, folder.scope, folder.id, 'file', 'template', true, folder.name, seed.content
from kb_nodes folder
join kb_nodes root on root.id = folder.parent_id
join kb_template_seed_catalog seed on seed.name = folder.name
where folder.node_type = 'folder' and folder.category = 'template' and folder.deleted_at is null
  and root.node_type = 'folder' and root.category = 'template' and root.parent_id is null
  and root.deleted_at is null
  and root.owner_id = folder.owner_id and root.scope = folder.scope
  and root.work_id is not distinct from folder.work_id
  and not exists (
    select 1 from kb_nodes existing
    where existing.parent_id = folder.id and existing.name = folder.name and existing.deleted_at is null
  );

commit;

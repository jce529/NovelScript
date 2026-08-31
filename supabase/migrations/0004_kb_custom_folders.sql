-- 1. Widen category CHECK to accept the new 회차 folder and arbitrary custom folders.
alter table kb_nodes drop constraint if exists kb_nodes_category_check;
alter table kb_nodes add constraint kb_nodes_category_check
  check (category in ('template','인물','장소','사건','세력','아이템','회차','custom'));

-- 2. Fix Phase 2's shipped lock regression: 0002_studio.sql's trailing "unlock"
-- statement force-unlocked 인물/장소/사건/세력/아이템 for every existing work.
-- D-03 requires all 7 structural folders locked — re-lock them here.
update kb_nodes set is_locked = true
where category in ('인물','장소','사건','세력','아이템')
  and node_type = 'folder' and parent_id is null and deleted_at is null;

-- 3. create_work(): add 회차 as a 7th structural folder, lock all 7 unconditionally
-- (the loop only ever iterates the 7 fixed categories, so is_locked = true for every
-- row it inserts — no more per-category branching).
create or replace function create_work(
  p_owner_id uuid, p_title text, p_synopsis text, p_cover_image_url text, p_genre text
) returns uuid
language plpgsql as $$
declare
  v_work_id uuid;
  v_category text;
begin
  insert into works (owner_id, title, synopsis, cover_image_url, genre)
  values (p_owner_id, p_title, p_synopsis, p_cover_image_url, p_genre)
  returning id into v_work_id;

  foreach v_category in array array['회차','template','인물','장소','사건','세력','아이템'] loop
    insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
    values (p_owner_id, v_work_id, 'work', null, 'folder', v_category, true, v_category);
  end loop;

  return v_work_id;
end;
$$;

-- 4. Backfill: every existing, non-deleted work that has no 회차 folder yet gets one
-- (D-06 — no writer should see missing/orphaned chapters after this ships).
insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
select w.owner_id, w.id, 'work', null, 'folder', '회차', true, '회차'
from works w
where w.deleted_at is null
  and not exists (
    select 1 from kb_nodes k
    where k.work_id = w.id and k.category = '회차' and k.node_type = 'folder'
      and k.parent_id is null and k.deleted_at is null
  );

-- 5. Chapter/folder grouping (D-05): a nullable FK on chapters, not a join table —
-- folder_id IS NULL means "directly at 회차 root", which is always a valid state and
-- requires zero per-chapter data migration (every existing chapter already satisfies it).
alter table chapters add column if not exists folder_id uuid references kb_nodes(id);
create index if not exists chapters_folder_idx on chapters (folder_id) where deleted_at is null;

-- 6. Guard: 회차 is chapter-content-only (D-04) — reject generic KB *file* nodes
-- created directly under any category='회차' folder. Folders (sub-folders for
-- organizing episodes) are NOT blocked, only files.
create or replace function guard_chapter_folder_no_kb_files() returns trigger
language plpgsql as $$
declare v_parent_category text;
begin
  if NEW.node_type = 'file' and NEW.parent_id is not null then
    select category into v_parent_category from kb_nodes where id = NEW.parent_id;
    if v_parent_category = '회차' then
      raise exception 'chapter_folder_no_kb_files';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists kb_nodes_guard_chapter_folder on kb_nodes;
create trigger kb_nodes_guard_chapter_folder before insert or update on kb_nodes
  for each row execute function guard_chapter_folder_no_kb_files();

-- 7. Cascade-safety: deleting a 회차 sub-folder must not orphan chapters that
-- reference it — null out folder_id (never delete/hide the chapters themselves)
-- as part of the same security-definer RPC, before the kb_nodes soft-delete.
create or replace function soft_delete_kb_node(p_node_id uuid, p_owner_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update chapters set folder_id = null where folder_id = p_node_id;

  update kb_nodes set deleted_at = now()
  where id = p_node_id and owner_id = p_owner_id and deleted_at is null
  returning id into v_id;
  return v_id;
end;
$$;

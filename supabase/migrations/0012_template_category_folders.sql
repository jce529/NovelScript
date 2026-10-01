-- BUG-03 step 1: template category is represented by the direct parent folder.
-- Re-running this migration preserves existing folders and file locations.
begin;
-- Free the sibling name before creating its folder, then restore it after moving.
create temporary table bug03_flat_seed_files (id uuid primary key, original_name text) on commit drop;
insert into bug03_flat_seed_files (id, original_name)
select file.id, file.name from kb_nodes file
join kb_nodes root on root.id = file.parent_id
where file.node_type = 'file' and file.category = 'template' and file.deleted_at is null
  and file.name in ('인물','장소','사건','세력','아이템')
  and root.category = 'template' and root.node_type = 'folder'
  and root.parent_id is null and root.deleted_at is null;
update kb_nodes file set name = '__bug03_' || file.id::text
from bug03_flat_seed_files old where file.id = old.id;

insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
select root.owner_id, root.work_id, root.scope, root.id, 'folder', 'template', true, categories.name
from kb_nodes root
cross join (values ('인물'), ('장소'), ('사건'), ('세력'), ('아이템')) as categories(name)
where root.category = 'template' and root.node_type = 'folder'
  and root.parent_id is null and root.deleted_at is null
  and not exists (
    select 1 from kb_nodes child
    where child.parent_id = root.id and child.name = categories.name and child.deleted_at is null
  );

-- An existing folder with a category name is the category folder; lock it too.
update kb_nodes child set category = 'template', is_locked = true
from kb_nodes root
where child.parent_id = root.id and child.node_type = 'folder'
  and child.name in ('인물','장소','사건','세력','아이템')
  and child.deleted_at is null and root.category = 'template'
  and root.node_type = 'folder' and root.parent_id is null and root.deleted_at is null;

update kb_nodes file set parent_id = folder.id, name = old.original_name
from bug03_flat_seed_files old
join kb_nodes folder on folder.name = old.original_name
  and folder.node_type = 'folder' and folder.category = 'template' and folder.deleted_at is null
where file.id = old.id and folder.parent_id = file.parent_id;
drop table bug03_flat_seed_files;

create or replace function create_work(
  p_owner_id uuid, p_title text, p_synopsis text, p_cover_image_url text, p_genre text
) returns uuid
language plpgsql as $$
declare
  v_work_id uuid;
  v_category text;
  v_child_category text;
  v_template_root_id uuid;
begin
  insert into works (owner_id, title, synopsis, cover_image_url, genre)
  values (p_owner_id, p_title, p_synopsis, p_cover_image_url, p_genre)
  returning id into v_work_id;

  foreach v_category in array array['회차','template','인물','장소','사건','세력','아이템'] loop
    insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
    values (p_owner_id, v_work_id, 'work', null, 'folder', v_category, true, v_category)
    returning id into v_template_root_id;
    if v_category = 'template' then
      foreach v_child_category in array array['인물','장소','사건','세력','아이템'] loop
        insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
        values (p_owner_id, v_work_id, 'work', v_template_root_id, 'folder', 'template', true, v_child_category);
      end loop;
    end if;
  end loop;
  return v_work_id;
end;
$$;

create or replace function ensure_account_template_root(p_owner_id uuid) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_category text;
begin
  select id into v_id from kb_nodes
  where owner_id = p_owner_id and scope = 'account_template' and category = 'template'
    and node_type = 'folder' and parent_id is null and deleted_at is null;
  if v_id is null then
    insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
    values (p_owner_id, null, 'account_template', null, 'folder', 'template', true, 'template')
    returning id into v_id;
  end if;
  foreach v_category in array array['인물','장소','사건','세력','아이템'] loop
    insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
    select p_owner_id, null, 'account_template', v_id, 'folder', 'template', true, v_category
    where not exists (select 1 from kb_nodes where parent_id = v_id and name = v_category and deleted_at is null);
  end loop;
  return v_id;
end;
$$;
commit;

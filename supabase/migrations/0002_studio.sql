create table if not exists works (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  title text not null check (char_length(trim(title)) > 0),
  synopsis text,
  cover_image_url text,
  genre text check (genre is null or genre in ('로맨스','로맨스판타지','판타지','현대판타지','무협','미스터리/스릴러','라이트노벨','기타')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists works_owner_idx on works (owner_id) where deleted_at is null;

alter table works enable row level security;
drop policy if exists "works_owner_all" on works;
create policy "works_owner_all" on works for all
  using (owner_id = auth.uid() and deleted_at is null)
  with check (owner_id = auth.uid());

create table if not exists kb_nodes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  work_id uuid references works(id),
  scope text not null check (scope in ('account_template','work')),
  parent_id uuid references kb_nodes(id),
  node_type text not null check (node_type in ('folder','file')),
  category text not null check (category in ('template','인물','장소','사건','세력','아이템')),
  is_locked boolean not null default false,
  name text not null check (char_length(trim(name)) > 0),
  content text,
  ancestor_ids uuid[] not null default '{}',
  depth integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint kb_nodes_scope_work_check check (
    (scope = 'account_template' and work_id is null) or
    (scope = 'work' and work_id is not null)
  )
);

create unique index if not exists kb_nodes_sibling_name_unique
  on kb_nodes (owner_id, coalesce(work_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
  where deleted_at is null;
create index if not exists kb_nodes_work_category_idx on kb_nodes (work_id, category) where deleted_at is null;
create index if not exists kb_nodes_parent_idx on kb_nodes (parent_id) where deleted_at is null;
create index if not exists kb_nodes_owner_scope_idx on kb_nodes (owner_id, scope) where deleted_at is null;

alter table kb_nodes enable row level security;
drop policy if exists "kb_nodes_owner_all" on kb_nodes;
create policy "kb_nodes_owner_all" on kb_nodes for all
  using (owner_id = auth.uid() and deleted_at is null)
  with check (owner_id = auth.uid());

create or replace function guard_locked_kb_node() returns trigger
language plpgsql as $$
begin
  if OLD.is_locked and (NEW.name is distinct from OLD.name or NEW.deleted_at is not null) then
    raise exception 'locked_node_immutable';
  end if;
  return NEW;
end;
$$;

drop trigger if exists kb_nodes_guard_locked on kb_nodes;
create trigger kb_nodes_guard_locked before update on kb_nodes
  for each row execute function guard_locked_kb_node();

create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works(id),
  title text not null check (char_length(trim(title)) > 0),
  content text not null default '',
  order_index integer not null,
  is_published boolean not null default false,
  price_tier integer check (price_tier is null or price_tier in (10, 30, 50, 100)),
  published_at timestamptz,
  unpublished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table chapters drop constraint if exists chapters_work_order_uniq;
alter table chapters add constraint chapters_work_order_uniq unique (work_id, order_index) deferrable initially deferred;

alter table chapters enable row level security;
drop policy if exists "chapters_owner_all" on chapters;
create policy "chapters_owner_all" on chapters for all
  using (work_id in (select id from works where owner_id = auth.uid() and deleted_at is null))
  with check (work_id in (select id from works where owner_id = auth.uid()));

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

  foreach v_category in array array['template','인물','장소','사건','세력','아이템'] loop
    insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
    values (p_owner_id, v_work_id, 'work', null, 'folder', v_category, true, v_category);
  end loop;

  return v_work_id;
end;
$$;

create or replace function ensure_account_template_root(p_owner_id uuid) returns uuid
language plpgsql as $$
declare
  v_id uuid;
begin
  select id into v_id from kb_nodes
   where owner_id = p_owner_id and scope = 'account_template' and category = 'template'
     and parent_id is null and deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;
  insert into kb_nodes (owner_id, work_id, scope, parent_id, node_type, category, is_locked, name)
  values (p_owner_id, null, 'account_template', null, 'folder', 'template', true, 'template')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function reorder_chapters(p_work_id uuid, p_ordered_ids uuid[]) returns void
language plpgsql as $$
begin
  update chapters c set order_index = v.idx
  from (select id, (row_number() over () - 1) as idx from unnest(p_ordered_ids) as id) v
  where c.id = v.id and c.work_id = p_work_id;
end;
$$;

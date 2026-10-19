begin;

-- Phase 18 (18-14): WORLD-TREE rule 22/23 branching eligibility + shared reader-visibility helper.
-- Apply after 0032_world_tree_schema.sql (works.is_branch_draft) and before 0034 (branch RPCs).
--
-- Contents (and nothing else):
--   1. world_work_reader_visible(uuid): the ONE definition of "a reader can see this work".
--      Consumed by eligibility here, by 18-02 (0034) begin/confirm through the assert below and by
--      18-04 (0036) reader projection / guards. Only this plan defines its body and grants.
--   2. Generated policy block (lib/world-tree/eligibility.ts renderEligibilityPolicySql, 18-13).
--      Thresholds live there only; tests/world-tree/eligibility-source.test.ts checks drift.
--   3. world_tree_evaluate_branch_eligibility(uuid, boolean): the single internal evaluator.
--   4. get_world_branch_eligibility(uuid): owner-only lookup (BranchEligibilitySummary JSON).
--   5. world_tree_assert_branch_eligible(uuid): internal guard for 18-02 begin / first confirm.
--
-- Facts checked before writing (2026-10-19):
--   * Publication = >= 1 live published chapter (lib/discovery/actions.ts, 0032 note). No new flag.
--   * Work-wide admin blind is works.admin_blinded (0006/0009); discovery hides blinded works.
--     Chapter-level blinds and paid/free/entitlement state concern chapter BODY rights, not the
--     work's metadata visibility, so they are not part of the helper.
--   * The helper reads base columns directly. It must not call can_view / read RPCs or rely on
--     works_public_read RLS: 0036 redefines those on top of this helper (recursion otherwise).
--   * Default templates: kb_template_seed_catalog (0022) keyed by category name holds the raw seed;
--     untouched raw or title-substituted copies do not count (generated helper below).
--   * Supabase grants EXECUTE on new public functions to anon/authenticated/service_role by
--     default, so every grant/revoke below is explicit.
--
-- Lock / transaction contract: in lock mode the evaluator takes FOR SHARE locks in the fixed
-- order source work -> chapters -> KB rows. 18-02 locks the root first, then calls the assert,
-- and keeps the same transaction (SERIALIZABLE + retry for phantom inserts) until confirm.
-- The lookup takes no locks and is a point-in-time view only.

-- ---------------------------------------------------------------------------
-- 1. Shared reader-visibility helper (self state only; no owner/admin/parent exceptions)
-- ---------------------------------------------------------------------------
create or replace function world_work_reader_visible(p_work_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select w.deleted_at is null
       and not w.is_branch_draft
       and not w.admin_blinded
       and exists (
         select 1 from chapters c
          where c.work_id = w.id and c.is_published and c.deleted_at is null
       )
      from works w
     where w.id = p_work_id
  ), false);
$$;
revoke all on function world_work_reader_visible(uuid) from public;
grant execute on function world_work_reader_visible(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Generated policy (do not edit inside the markers; regenerate from lib/world-tree/eligibility.ts)
-- ---------------------------------------------------------------------------
-- BEGIN GENERATED world-tree eligibility policy (lib/world-tree/eligibility.ts renderEligibilityPolicySql) — do not edit by hand
create or replace function world_tree_eligibility_thresholds()
returns table (
  min_published_chapters integer,
  min_document_body_chars integer,
  min_setting_documents integer,
  category_minimums jsonb,
  counted_categories text[]
)
language sql immutable parallel safe
set search_path = pg_catalog
as $$
  select 50::integer as min_published_chapters,
         200::integer as min_document_body_chars,
         20::integer as min_setting_documents,
         jsonb_build_object('인물', 5, '장소', 3, '사건', 3) as category_minimums,
         array['인물', '장소', '사건', '세력', '아이템']::text[] as counted_categories;
$$;
revoke all on function world_tree_eligibility_thresholds() from public, anon, authenticated;

create or replace function world_tree_eligibility_body(p_content text)
returns text
language sql immutable parallel safe
set search_path = pg_catalog
as $$
  select btrim(replace(coalesce(p_content, ''), chr(13), ''), chr(32) || chr(9) || chr(10) || chr(11) || chr(12) || chr(160) || chr(12288) || chr(65279));
$$;
revoke all on function world_tree_eligibility_body(text) from public, anon, authenticated;

create or replace function world_tree_eligibility_is_untouched_seed(p_content text, p_name text, p_seed text)
returns boolean
language sql immutable parallel safe
set search_path = pg_catalog
as $$
  select coalesce(p_seed is not null and (
    public.world_tree_eligibility_body(p_content) = public.world_tree_eligibility_body(p_seed)
    or public.world_tree_eligibility_body(p_content) = public.world_tree_eligibility_body(
      regexp_replace(p_seed, '<%[[:space:]]*tp\.file\.title[[:space:]]*%>', coalesce(replace(p_name, '\', '\\'), ''), 'g'))
  ), false);
$$;
revoke all on function world_tree_eligibility_is_untouched_seed(text, text, text) from public, anon, authenticated;
-- END GENERATED world-tree eligibility policy

-- The generated block revokes the API roles; service_role is closed here as well (internal only).
revoke all on function world_tree_eligibility_thresholds() from service_role;
revoke all on function world_tree_eligibility_body(text) from service_role;
revoke all on function world_tree_eligibility_is_untouched_seed(text, text, text) from service_role;

-- ---------------------------------------------------------------------------
-- 3. Single internal evaluator (lookup and assert both call this)
-- ---------------------------------------------------------------------------
-- Order: auth -> active writer -> ownership -> reader visibility -> counts.
-- Auth / ownership failures raise; they are never turned into an "ineligible" summary.
-- A missing work and someone else's work raise the same code (no existence leak).
-- readerVisible=false short-circuits: eligible=false, unmetReasons=[parent_not_visible], counts 0
-- meaning "not aggregated"; no chapter/KB count query runs. isPublished keeps the real fact, so a
-- blinded published parent reports isPublished=true. The summary never carries bodies, document
-- names, node ids/source refs or admin blind reasons. Owner/admin full view never bypasses it.
create or replace function world_tree_evaluate_branch_eligibility(p_source_work_id uuid, p_lock boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_policy record;
  v_thresholds jsonb;
  v_is_published boolean;
  v_chapters integer;
  v_total integer;
  v_person integer;
  v_place integer;
  v_event integer;
  v_reasons text[] := array[]::text[];
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if not exists (select 1 from profiles p
                  where p.id = v_uid and p.role = 'writer' and p.deleted_at is null) then
    raise exception 'writer_required';
  end if;
  if p_lock and not user_can_write(v_uid) then
    raise exception 'write_access_denied';
  end if;

  if p_lock then
    select w.owner_id into v_owner from works w where w.id = p_source_work_id for share of w;
  else
    select w.owner_id into v_owner from works w where w.id = p_source_work_id;
  end if;
  if v_owner is null or v_owner <> v_uid then
    raise exception 'world_tree_forbidden';
  end if;

  select * into v_policy from world_tree_eligibility_thresholds();
  v_thresholds := jsonb_build_object(
    'minPublishedChapters', v_policy.min_published_chapters,
    'minDocumentChars', v_policy.min_document_body_chars,
    'minQualifyingDocuments', v_policy.min_setting_documents,
    'minCategoryDocuments', jsonb_build_object(
      '인물', (v_policy.category_minimums ->> '인물')::integer,
      '장소', (v_policy.category_minimums ->> '장소')::integer,
      '사건', (v_policy.category_minimums ->> '사건')::integer));

  v_is_published := exists (select 1 from chapters c
                             where c.work_id = p_source_work_id and c.is_published and c.deleted_at is null);

  if not world_work_reader_visible(p_source_work_id) then
    return jsonb_build_object(
      'eligible', false,
      'isPublished', v_is_published,
      'readerVisible', false,
      'publishedChapterCount', 0,
      'qualifyingDocumentCount', 0,
      'categoryCounts', jsonb_build_object('인물', 0, '장소', 0, '사건', 0),
      'thresholds', v_thresholds,
      'unmetReasons', jsonb_build_array('parent_not_visible'));
  end if;

  if p_lock then
    perform 1 from chapters c
      where c.work_id = p_source_work_id and c.deleted_at is null
      order by c.id for share;
    perform 1 from kb_nodes n
      where n.work_id = p_source_work_id and n.scope = 'work' and n.deleted_at is null
      order by n.id for share;
  end if;

  select count(*)::integer into v_chapters
    from chapters c
   where c.work_id = p_source_work_id and c.is_published and c.deleted_at is null;

  select count(*)::integer,
         (count(*) filter (where n.category = '인물'))::integer,
         (count(*) filter (where n.category = '장소'))::integer,
         (count(*) filter (where n.category = '사건'))::integer
    into v_total, v_person, v_place, v_event
    from kb_nodes n
    left join kb_template_seed_catalog s on s.name = n.category
   where n.scope = 'work'
     and n.work_id = p_source_work_id
     and n.node_type = 'file'
     and n.deleted_at is null
     and n.category = any(v_policy.counted_categories)
     and char_length(world_tree_eligibility_body(n.content)) >= v_policy.min_document_body_chars
     and not world_tree_eligibility_is_untouched_seed(n.content, n.name, s.content);

  if v_chapters < v_policy.min_published_chapters then
    v_reasons := v_reasons || 'published_chapters_insufficient'::text;
  end if;
  if v_total < v_policy.min_setting_documents then
    v_reasons := v_reasons || 'qualifying_documents_insufficient'::text;
  end if;
  if v_person < (v_policy.category_minimums ->> '인물')::integer then
    v_reasons := v_reasons || 'character_documents_insufficient'::text;
  end if;
  if v_place < (v_policy.category_minimums ->> '장소')::integer then
    v_reasons := v_reasons || 'place_documents_insufficient'::text;
  end if;
  if v_event < (v_policy.category_minimums ->> '사건')::integer then
    v_reasons := v_reasons || 'event_documents_insufficient'::text;
  end if;

  return jsonb_build_object(
    'eligible', cardinality(v_reasons) = 0,
    'isPublished', v_is_published,
    'readerVisible', true,
    'publishedChapterCount', v_chapters,
    'qualifyingDocumentCount', v_total,
    'categoryCounts', jsonb_build_object('인물', v_person, '장소', v_place, '사건', v_event),
    'thresholds', v_thresholds,
    'unmetReasons', to_jsonb(v_reasons));
end;
$$;
revoke all on function world_tree_evaluate_branch_eligibility(uuid, boolean) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Owner-only lookup (point-in-time; no locks kept)
-- ---------------------------------------------------------------------------
create or replace function get_world_branch_eligibility(p_source_work_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return world_tree_evaluate_branch_eligibility(p_source_work_id, false);
end;
$$;
revoke all on function get_world_branch_eligibility(uuid) from public, anon, service_role;
grant execute on function get_world_branch_eligibility(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Internal assert for 18-02 (SECURITY DEFINER begin / first confirm call it in-transaction)
-- ---------------------------------------------------------------------------
create or replace function world_tree_assert_branch_eligible(p_source_work_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_summary jsonb;
begin
  v_summary := world_tree_evaluate_branch_eligibility(p_source_work_id, true);
  if not (v_summary ->> 'eligible')::boolean then
    raise exception 'branch_ineligible'
      using detail = jsonb_build_object('unmetReasons', v_summary -> 'unmetReasons')::text;
  end if;
end;
$$;
revoke all on function world_tree_assert_branch_eligible(uuid) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

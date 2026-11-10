begin;

-- Phase 14 (14-13, user label "14-10" patch format): edit proposals carry only the changed spans.
-- mcp_propose_chapter_draft / mcp_propose_kb_edit now take (p_base_hash text, p_edits jsonb) instead
-- of the full text. Inside the same transaction that locks the original row (FOR UPDATE) they:
--   1) compare sha256(raw coalesce(content, '')) with p_base_hash first; a mismatch (or a missing /
--      malformed hash) is mcp_patch_stale with the latest raw hash and nothing else;
--   2) validate the edits (shape, op, counts and lengths: SQL re-checks what the MCP tool checks);
--   3) match every anchor literally (strpos, overlapping occurrences counted, never a regex) on the
--      LF copy of the original (CRLF/CR -> LF, no NFC), with all coordinates on that original copy,
--      in ascending, non-overlapping order; replaceAll is allowed only alone;
--   4) normalize the result with the existing mcp_proposal_normalize policy, refuse an unchanged
--      result (mcp_no_change, compared with the raw original as before), dedupe on the final
--      content_hash, check the 0043 caps and insert the full proposal (content = LF proposal,
--      base_content / base_hash = raw original).
-- Patch failures raise an allowlisted message with a JSON DETAIL (lib/mcp/tool-runtime.ts parses
-- only these exact message + SQLSTATE pairs):
--   mcp_patch_stale     P0001 {"code":"stale","latestHash":hex64}
--   mcp_patch_no_match  P0001 {"code":"no_match","editIndex":n,"reason":"find|start_text|end_text"}
--   mcp_patch_ambiguous P0001 {"code":"ambiguous","editIndex":n,"reason":...,"candidates":[{position,before,after}] x2..3}
--   mcp_patch_overlap   P0001 {"code":"overlap","editIndex":n,"reason":"range_reversed|overlap|not_ascending"}
--   mcp_patch_limit     22023 {"code":"limit","editIndex"?:n,"reason":"edit_count|anchor_length|replace_length|delete_length|result_length"}
--   mcp_patch_invalid   22023 {"code":"invalid","editIndex"?:n,"reason":"replace_all_mixed|unknown_op|malformed"}
-- Positions are 1-based code points of the LF copy; context is at most 20 code points each side.
-- Existing errors (live grant, scope, suspension, writer role, mcp_not_found) are checked first, so
-- another writer's target never reveals a hash. Originals are never written; 0042 accept / revert
-- and the paragraph merge keep working on the stored full proposal. No anchor_meta column (out of
-- scope). Re-runnable: create or replace / drop ... if exists. Helpers are unexecutable for every
-- API role; the two new signatures are bearer-only (authenticated).

-- 1) Raise helper: one place builds the allowlisted error.
create or replace function public.mcp_patch_fail(p_message text, p_errcode text, p_detail jsonb)
returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using message = p_message, errcode = p_errcode, detail = p_detail::text;
end;
$$;

-- 2) CRLF/CR -> LF (the matching copy; also applied to anchors and replacements).
create or replace function public.mcp_patch_lf(p_text text)
returns text
language sql immutable set search_path = '' as $$
  select pg_catalog.replace(pg_catalog.replace(p_text, E'\r\n', E'\n'), E'\r', E'\n');
$$;

-- 3) Literal occurrences (1-based code points), overlapping ones included, at most p_limit.
create or replace function public.mcp_patch_positions(p_text text, p_needle text, p_limit int)
returns int[]
language plpgsql immutable set search_path = '' as $$
declare
  v_positions int[] := '{}';
  v_offset int := 0;
  v_found int;
begin
  loop
    v_found := pg_catalog.strpos(pg_catalog.substr(p_text, v_offset + 1), p_needle);
    exit when v_found = 0;
    v_offset := v_offset + v_found;
    v_positions := pg_catalog.array_append(v_positions, v_offset);
    exit when pg_catalog.cardinality(v_positions) >= p_limit;
  end loop;
  return v_positions;
end;
$$;

-- 4) Unique literal match or a structured no_match / ambiguous failure.
create or replace function public.mcp_patch_locate(p_text text, p_needle text, p_index int, p_reason text)
returns int
language plpgsql set search_path = '' as $$
declare
  v_positions int[];
  v_candidates jsonb;
begin
  v_positions := public.mcp_patch_positions(p_text, p_needle, 3);
  if pg_catalog.cardinality(v_positions) = 0 then
    perform public.mcp_patch_fail('mcp_patch_no_match', 'P0001', pg_catalog.jsonb_build_object(
      'code', 'no_match', 'editIndex', p_index, 'reason', p_reason));
  end if;
  if pg_catalog.cardinality(v_positions) > 1 then
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'position', u.pos,
             'before', pg_catalog.substr(p_text, greatest(1, u.pos - 20), u.pos - greatest(1, u.pos - 20)),
             'after', pg_catalog.substr(p_text, u.pos + pg_catalog.length(p_needle), 20))
           order by u.ord)
      into v_candidates
      from pg_catalog.unnest(v_positions) with ordinality as u(pos, ord)
     where u.pos <= 1000000;
    perform public.mcp_patch_fail('mcp_patch_ambiguous', 'P0001', pg_catalog.jsonb_build_object(
      'code', 'ambiguous', 'editIndex', p_index, 'reason', p_reason,
      'candidates', coalesce(v_candidates, '[]'::jsonb)));
  end if;
  return v_positions[1];
end;
$$;

-- 5) Preview side: up to 2 non-blank lines next to the change (the nearest one may be the partial
--    line at the seam), control characters stripped like mcp_proposal_normalize, each line capped
--    at 240 code points (the end nearest to the change is kept) with a truncated flag.
create or replace function public.mcp_patch_preview_side(p_piece text, p_before boolean)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_lines text[];
  v_total int;
  v_i int;
  v_line text;
  v_taken int := 0;
  v_out jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  v_lines := pg_catalog.string_to_array(p_piece, E'\n');
  v_total := coalesce(pg_catalog.array_length(v_lines, 1), 0);
  for v_i in 1 .. v_total loop
    v_line := pg_catalog.regexp_replace(
      v_lines[case when p_before then v_total - v_i + 1 else v_i end],
      '[\u0001-\u0008\u000B-\u001F\u007F-\u009F﻿‪-‮⁦-⁩]', '', 'g');
    continue when v_line ~ '^[[:space:]]*$';
    v_item := pg_catalog.jsonb_build_object(
      'text', case
        when pg_catalog.length(v_line) <= 240 then v_line
        when p_before then pg_catalog.substr(v_line, pg_catalog.length(v_line) - 239)
        else pg_catalog.substr(v_line, 1, 240) end,
      'truncated', pg_catalog.length(v_line) > 240);
    v_out := case when p_before then pg_catalog.jsonb_build_array(v_item) || v_out
                  else v_out || pg_catalog.jsonb_build_array(v_item) end;
    v_taken := v_taken + 1;
    exit when v_taken = 2;
  end loop;
  return v_out;
end;
$$;

-- 6) Validate and apply the edits to the original. Returns {content, preview}; content is the LF
--    result (normalization happens in the caller), preview is null for replaceAll.
create or replace function public.mcp_patch_apply(p_base text, p_edits jsonb, p_max int)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_count int;
  v_i int;
  v_edit jsonb;
  v_op text;
  v_allowed text[];
  v_lf text;
  v_start text;
  v_end text;
  v_s int;
  v_e int;
  v_end_at int;
  v_prev_s int := 0;
  v_prev_e int := 0;
  v_starts int[] := '{}';
  v_ends int[] := '{}';
  v_reps text[] := '{}';
  v_result text := '';
  v_cursor int := 1;
  v_rstarts int[] := '{}';
  v_rends int[] := '{}';
  v_preview jsonb := '[]'::jsonb;
begin
  if p_edits is null or pg_catalog.jsonb_typeof(p_edits) <> 'array' or pg_catalog.jsonb_array_length(p_edits) = 0 then
    perform public.mcp_patch_fail('mcp_patch_invalid', '22023',
      pg_catalog.jsonb_build_object('code', 'invalid', 'reason', 'malformed'));
  end if;
  v_count := pg_catalog.jsonb_array_length(p_edits);
  if v_count > 20 then
    perform public.mcp_patch_fail('mcp_patch_limit', '22023',
      pg_catalog.jsonb_build_object('code', 'limit', 'reason', 'edit_count'));
  end if;

  -- Pass 1: shape and per-edit limits for every edit before any matching.
  for v_i in 0 .. v_count - 1 loop
    v_edit := p_edits -> v_i;
    if pg_catalog.jsonb_typeof(v_edit) is distinct from 'object'
       or pg_catalog.jsonb_typeof(v_edit -> 'op') is distinct from 'string' then
      perform public.mcp_patch_fail('mcp_patch_invalid', '22023',
        pg_catalog.jsonb_build_object('code', 'invalid', 'editIndex', v_i, 'reason', 'malformed'));
    end if;
    v_op := v_edit ->> 'op';
    v_allowed := case v_op
      when 'replace' then array['op', 'find', 'replace', 'hint_para']
      when 'replace_range' then array['op', 'start_text', 'end_text', 'replace', 'hint_para']
      when 'replaceAll' then array['op', 'content']
    end;
    if v_allowed is null then
      perform public.mcp_patch_fail('mcp_patch_invalid', '22023',
        pg_catalog.jsonb_build_object('code', 'invalid', 'editIndex', v_i, 'reason', 'unknown_op'));
    end if;
    if v_op = 'replaceAll' and v_count > 1 then
      perform public.mcp_patch_fail('mcp_patch_invalid', '22023',
        pg_catalog.jsonb_build_object('code', 'invalid', 'editIndex', v_i, 'reason', 'replace_all_mixed'));
    end if;
    -- hint_para is accepted and ignored (never a position source).
    if exists (select 1 from pg_catalog.jsonb_object_keys(v_edit) as k(key) where k.key <> all (v_allowed))
       or (v_op = 'replace' and (pg_catalog.jsonb_typeof(v_edit -> 'find') is distinct from 'string'
             or pg_catalog.jsonb_typeof(v_edit -> 'replace') is distinct from 'string'))
       or (v_op = 'replace_range' and (pg_catalog.jsonb_typeof(v_edit -> 'start_text') is distinct from 'string'
             or pg_catalog.jsonb_typeof(v_edit -> 'end_text') is distinct from 'string'
             or pg_catalog.jsonb_typeof(v_edit -> 'replace') is distinct from 'string'))
       or (v_op = 'replaceAll' and pg_catalog.jsonb_typeof(v_edit -> 'content') is distinct from 'string') then
      perform public.mcp_patch_fail('mcp_patch_invalid', '22023',
        pg_catalog.jsonb_build_object('code', 'invalid', 'editIndex', v_i, 'reason', 'malformed'));
    end if;
    if (v_op = 'replace' and pg_catalog.length(v_edit ->> 'find') not between 1 and 500)
       or (v_op = 'replace_range' and (pg_catalog.length(v_edit ->> 'start_text') not between 1 and 500
             or pg_catalog.length(v_edit ->> 'end_text') not between 1 and 500)) then
      perform public.mcp_patch_fail('mcp_patch_limit', '22023',
        pg_catalog.jsonb_build_object('code', 'limit', 'editIndex', v_i, 'reason', 'anchor_length'));
    end if;
    if v_op in ('replace', 'replace_range') and pg_catalog.length(v_edit ->> 'replace') > 10000 then
      perform public.mcp_patch_fail('mcp_patch_limit', '22023',
        pg_catalog.jsonb_build_object('code', 'limit', 'editIndex', v_i, 'reason', 'replace_length'));
    end if;
  end loop;

  -- replaceAll keeps the old full-text behaviour: the caller's normalize checks length / blank.
  if v_op = 'replaceAll' then
    return pg_catalog.jsonb_build_object('content', p_edits -> 0 ->> 'content', 'preview', null);
  end if;

  -- Pass 2: locate every span on the original LF copy (original coordinates for all edits).
  v_lf := public.mcp_patch_lf(p_base);
  for v_i in 0 .. v_count - 1 loop
    v_edit := p_edits -> v_i;
    if v_edit ->> 'op' = 'replace' then
      v_start := public.mcp_patch_lf(v_edit ->> 'find');
      v_s := public.mcp_patch_locate(v_lf, v_start, v_i, 'find');
      v_e := v_s + pg_catalog.length(v_start);
    else
      v_start := public.mcp_patch_lf(v_edit ->> 'start_text');
      v_end := public.mcp_patch_lf(v_edit ->> 'end_text');
      v_s := public.mcp_patch_locate(v_lf, v_start, v_i, 'start_text');
      v_end_at := public.mcp_patch_locate(v_lf, v_end, v_i, 'end_text');
      -- The end anchor must start after the start anchor ends (anchors may not overlap).
      if v_end_at < v_s + pg_catalog.length(v_start) then
        perform public.mcp_patch_fail('mcp_patch_overlap', 'P0001',
          pg_catalog.jsonb_build_object('code', 'overlap', 'editIndex', v_i, 'reason', 'range_reversed'));
      end if;
      v_e := v_end_at + pg_catalog.length(v_end);
      if v_e - v_s > 10000 then
        perform public.mcp_patch_fail('mcp_patch_limit', '22023',
          pg_catalog.jsonb_build_object('code', 'limit', 'editIndex', v_i, 'reason', 'delete_length'));
      end if;
    end if;
    if v_i > 0 and v_s < v_prev_s then
      perform public.mcp_patch_fail('mcp_patch_overlap', 'P0001',
        pg_catalog.jsonb_build_object('code', 'overlap', 'editIndex', v_i, 'reason', 'not_ascending'));
    end if;
    if v_i > 0 and v_s < v_prev_e then
      perform public.mcp_patch_fail('mcp_patch_overlap', 'P0001',
        pg_catalog.jsonb_build_object('code', 'overlap', 'editIndex', v_i, 'reason', 'overlap'));
    end if;
    v_prev_s := v_s;
    v_prev_e := v_e;
    v_starts := pg_catalog.array_append(v_starts, v_s);
    v_ends := pg_catalog.array_append(v_ends, v_e);
    v_reps := pg_catalog.array_append(v_reps, public.mcp_patch_lf(v_edit ->> 'replace'));
  end loop;

  -- Pass 3: build the result, remembering where each replacement sits in it.
  for v_i in 1 .. v_count loop
    v_result := v_result || pg_catalog.substr(v_lf, v_cursor, v_starts[v_i] - v_cursor);
    v_rstarts := pg_catalog.array_append(v_rstarts, pg_catalog.length(v_result) + 1);
    v_result := v_result || v_reps[v_i];
    v_rends := pg_catalog.array_append(v_rends, pg_catalog.length(v_result) + 1);
    v_cursor := v_ends[v_i];
  end loop;
  v_result := v_result || pg_catalog.substr(v_lf, v_cursor);
  if pg_catalog.length(v_result) > p_max then
    perform public.mcp_patch_fail('mcp_patch_limit', '22023',
      pg_catalog.jsonb_build_object('code', 'limit', 'reason', 'result_length'));
  end if;

  for v_i in 1 .. v_count loop
    v_preview := v_preview || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'editIndex', v_i - 1,
      'before', public.mcp_patch_preview_side(pg_catalog.substr(v_result, 1, v_rstarts[v_i] - 1), true),
      'after', public.mcp_patch_preview_side(pg_catalog.substr(v_result, v_rends[v_i]), false)));
  end loop;
  return pg_catalog.jsonb_build_object('content', v_result, 'preview', v_preview);
end;
$$;

revoke all on function public.mcp_patch_fail(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.mcp_patch_lf(text) from public, anon, authenticated, service_role;
revoke all on function public.mcp_patch_positions(text, text, int) from public, anon, authenticated, service_role;
revoke all on function public.mcp_patch_locate(text, text, int, text) from public, anon, authenticated, service_role;
revoke all on function public.mcp_patch_preview_side(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.mcp_patch_apply(text, jsonb, int) from public, anon, authenticated, service_role;

-- 7) The old full-content signatures are replaced (the tool converts content to one replaceAll).
drop function if exists public.mcp_propose_chapter_draft(uuid, uuid, text);
drop function if exists public.mcp_propose_kb_edit(uuid, uuid, text);

-- 8) save_draft: dedupe on the final text from any connection (0043), no supersede.
create or replace function public.mcp_propose_chapter_draft(p_work_id uuid, p_chapter_id uuid, p_base_hash text, p_edits jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller record;
  v_base text;
  v_latest text;
  v_patch jsonb;
  v_preview jsonb;
  v_content text;
  v_hash text;
  v_existing record;
  v_row record;
begin
  select * into v_caller from public.mcp_proposal_caller();

  select c.content into v_base
  from public.chapters as c
  join public.works as w on w.id = c.work_id
  where c.id = p_chapter_id and c.work_id = p_work_id
    and w.owner_id = v_caller.out_user_id
    and c.deleted_at is null and w.deleted_at is null
  for update of c;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  v_base := coalesce(v_base, '');
  v_latest := public.mcp_proposal_sha256(v_base);
  if p_base_hash is distinct from v_latest then
    raise exception 'mcp_patch_stale' using errcode = 'P0001',
      detail = pg_catalog.jsonb_build_object('code', 'stale', 'latestHash', v_latest)::text;
  end if;

  v_patch := public.mcp_patch_apply(v_base, p_edits, 100000);
  v_preview := v_patch -> 'preview';
  v_content := public.mcp_proposal_normalize(v_patch ->> 'content', 100000);
  v_hash := public.mcp_proposal_sha256(v_content);
  if v_base = v_content then
    raise exception 'mcp_no_change' using errcode = 'P0001';
  end if;
  v_preview := case when pg_catalog.jsonb_typeof(v_preview) = 'array'
    then pg_catalog.jsonb_build_object('preview', v_preview) else '{}'::jsonb end;

  select p.id, p.expires_at into v_existing
  from public.mcp_proposals as p
  where p.chapter_id = p_chapter_id and p.kind = 'chapter_draft' and p.status = 'pending'
    and p.content_hash = v_hash
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', 'pending',
      'expires_at', v_existing.expires_at, 'superseded_id', null) || v_preview;
  end if;

  perform public.mcp_proposal_check_cap(v_caller.out_user_id, p_work_id);

  insert into public.mcp_proposals as p
    (owner_id, work_id, kind, chapter_id, content, content_hash, base_content, base_hash,
     source_client_id, source_client_name, source_host)
  values (v_caller.out_user_id, p_work_id, 'chapter_draft', p_chapter_id, v_content, v_hash,
     v_base, v_latest,
     v_caller.out_client_id, v_caller.out_client_name, v_caller.out_host)
  returning p.id, p.expires_at into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', 'pending',
    'expires_at', v_row.expires_at, 'superseded_id', null) || v_preview;
end;
$$;

-- 9) propose_kb_document (edit): same targets as 0041/0043, dedupe per connection (0043).
create or replace function public.mcp_propose_kb_edit(p_work_id uuid, p_node_id uuid, p_base_hash text, p_edits jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_caller record;
  v_base text;
  v_latest text;
  v_patch jsonb;
  v_preview jsonb;
  v_content text;
  v_hash text;
  v_existing record;
  v_row record;
begin
  select * into v_caller from public.mcp_proposal_caller();

  select n.content into v_base
  from public.kb_nodes as n
  join public.works as w on w.id = n.work_id
  where n.id = p_node_id and n.work_id = p_work_id
    and n.owner_id = v_caller.out_user_id and w.owner_id = v_caller.out_user_id
    and n.scope = 'work' and n.node_type = 'file'
    and n.category in ('인물', '장소', '사건', '세력', '아이템', 'custom')
    and not n.is_locked
    and n.deleted_at is null and w.deleted_at is null
  for update of n;
  if not found then
    raise exception 'mcp_not_found' using errcode = 'P0001';
  end if;
  v_base := coalesce(v_base, '');
  v_latest := public.mcp_proposal_sha256(v_base);
  if p_base_hash is distinct from v_latest then
    raise exception 'mcp_patch_stale' using errcode = 'P0001',
      detail = pg_catalog.jsonb_build_object('code', 'stale', 'latestHash', v_latest)::text;
  end if;

  v_patch := public.mcp_patch_apply(v_base, p_edits, 50000);
  v_preview := v_patch -> 'preview';
  v_content := public.mcp_proposal_normalize(v_patch ->> 'content', 50000);
  v_hash := public.mcp_proposal_sha256(v_content);
  if v_base = v_content then
    raise exception 'mcp_no_change' using errcode = 'P0001';
  end if;
  v_preview := case when pg_catalog.jsonb_typeof(v_preview) = 'array'
    then pg_catalog.jsonb_build_object('preview', v_preview) else '{}'::jsonb end;

  select p.id, p.expires_at into v_existing
  from public.mcp_proposals as p
  where p.node_id = p_node_id and p.kind = 'kb_edit' and p.status = 'pending'
    and p.source_client_id = v_caller.out_client_id and p.content_hash = v_hash
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object('id', v_existing.id, 'status', 'pending',
      'expires_at', v_existing.expires_at, 'superseded_id', null) || v_preview;
  end if;

  perform public.mcp_proposal_check_cap(v_caller.out_user_id, p_work_id);

  insert into public.mcp_proposals as p
    (owner_id, work_id, kind, node_id, content, content_hash, base_content, base_hash,
     source_client_id, source_client_name, source_host)
  values (v_caller.out_user_id, p_work_id, 'kb_edit', p_node_id, v_content, v_hash,
     v_base, v_latest,
     v_caller.out_client_id, v_caller.out_client_name, v_caller.out_host)
  returning p.id, p.expires_at into v_row;

  return pg_catalog.jsonb_build_object('id', v_row.id, 'status', 'pending',
    'expires_at', v_row.expires_at, 'superseded_id', null) || v_preview;
end;
$$;

-- 10) ACL: bearer RPCs only for authenticated; kb_create is unchanged (restated, idempotent).
revoke all on function public.mcp_propose_chapter_draft(uuid, uuid, text, jsonb) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_edit(uuid, uuid, text, jsonb) from public, anon, service_role;
revoke all on function public.mcp_propose_kb_create(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.mcp_propose_chapter_draft(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.mcp_propose_kb_edit(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.mcp_propose_kb_create(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;

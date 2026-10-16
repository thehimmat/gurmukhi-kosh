-- 058: vishraam (pause) marks per line (#217), from BaniDB's `visraam` field.
--
-- lines.vishraam holds, per set (igurbani, sttm, sttm2), word index -> kind
-- ("v" main pause, "y" yamki), e.g. {"igurbani": {"3": "v", "0": "y"}}.
-- Null when BaniDB has no marks for the line. A nullable column with no
-- default is a catalogue change only, so adding it doesn't rewrite lines.
-- Give up rather than queue reads behind the brief exclusive lock.
set local lock_timeout = '5s';
alter table lines add column if not exists vishraam jsonb;

comment on column lines.vishraam is
  'Vishraam marks from BaniDB: {set: {word_index: "v"|"y"}}; see lib/vishraam.ts.';

-- The ingest writes an ang at a time: [{id, v}], v null to clear.
create or replace function set_lines_vishraam(p_rows jsonb) returns integer
language sql security definer
set search_path = public
as $$
  with r as (
    select (x->>'id')::bigint as id, x->'v' as v
    from jsonb_array_elements(p_rows) x
  ), u as (
    update lines l
    set vishraam = nullif(r.v, 'null'::jsonb)
    from r
    where l.id = r.id
      and l.vishraam is distinct from nullif(r.v, 'null'::jsonb)
    returning 1
  )
  select count(*)::int from u;
$$;

revoke execute on function set_lines_vishraam(jsonb) from public, anon, authenticated;
grant execute on function set_lines_vishraam(jsonb) to service_role;

-- 050: Run definitions_with_pua() as its owner.
--
-- 049's partial index was only used by roles that bypass RLS. For anon, RLS
-- on `definitions` (even its `true` read policy) stops the planner from using
-- column statistics with the non-leakproof regex operator, so it assumed half
-- the table matches and walked the primary key for the ORDER BY ... LIMIT:
-- 1.5 s and 28k buffers, still timing out in CI. As security definer the
-- function plans with real statistics and reads the partial index (~1 ms as
-- anon). It only reads rows anon can already read; search_path is pinned.

create or replace function definitions_with_pua(p_source_code text, p_limit int default 200)
returns table(id bigint, sense_number int, definition_text text)
language sql stable
security definer
set search_path = public, pg_temp
as $$
  select d.id::bigint, d.sense_number::int, d.definition_text
  from definitions d
  where d.dict_source_id = (select s.id from dict_sources s where s.code = p_source_code)
    and d.definition_text ~ U&'[\E000-\F8FF]'
  order by d.id
  limit p_limit
$$;

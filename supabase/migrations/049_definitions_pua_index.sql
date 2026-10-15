-- 049: Index the definition rows that still carry Private Use Area glyphs.
--
-- tests/mahan-kosh-pua.test.ts looks for PUA code points in Mahan Kosh text
-- (#150). Once the text is clean almost no row matches, so the regex had to
-- scan all of `definitions` (~55 MB of pages) with no early exit: ~70 ms
-- warm, but on a cold cache with the rest of the suite hitting the same
-- project it ran past the anon role's 3 s statement timeout (57014) and
-- failed CI on runs that changed nothing related.
--
-- A partial index on exactly that predicate holds only the PUA rows (one
-- unresolved row today), so the check reads a handful of pages whatever the
-- cache state. definitions_with_pua() spells the predicate with the same
-- literal so the planner always matches the index (a PostgREST `match`
-- filter arrives as a bound parameter, which is not guaranteed to).

create index if not exists definitions_pua_idx
  on definitions (dict_source_id)
  where definition_text ~ U&'[\E000-\F8FF]';

create or replace function definitions_with_pua(p_source_code text, p_limit int default 200)
returns table(id bigint, sense_number int, definition_text text)
language sql stable
as $$
  select d.id::bigint, d.sense_number::int, d.definition_text
  from definitions d
  where d.dict_source_id = (select s.id from dict_sources s where s.code = p_source_code)
    and d.definition_text ~ U&'[\E000-\F8FF]'
  order by d.id
  limit p_limit
$$;

grant execute on function definitions_with_pua(text, int) to anon, authenticated;

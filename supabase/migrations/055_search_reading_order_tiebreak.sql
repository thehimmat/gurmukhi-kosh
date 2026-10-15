-- 055: every line search sorts in exact reading order (gurmukhi-search#46).
--
-- The search RPCs sorted on (corpus_rank, ang, line_no), but line_no is the
-- printed line and one printed line holds several verses (SGGS: 60,403 lines
-- on 26,563 (ang, line_no) pairs). Tied rows came back in no fixed order, so
-- offset pages could repeat or skip lines, and verses on one printed line
-- could read out of order. Adding id as the last key makes the order total
-- and exact: (ang, line_no, id) matches verse_id order for every line of
-- every scripture (checked live: 0 rows out of place). id rather than
-- verse_id because id is already in every covering index (045, 051), so the
-- first-letter searches stay index-only.
--
-- The six functions are edited in place from their deployed definitions
-- rather than restated here: the change is the same one-key append in each,
-- and restating ~400 lines of SQL to add `, x.id` six times would bury it.
-- Each must change (the DO block fails otherwise), and re-running is a no-op.
do $$
declare
  fn    regprocedure;
  def   text;
  new   text;
  found int := 0;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.oid::regprocedure::text in (
        'search_first_letters(text[],text[],text[],bigint[],integer,integer,integer,integer)',
        'search_first_letters_fuzzy(text[],integer,text[],text[],bigint[],integer,integer,integer,integer)',
        'search_lines_fuzzy(text,integer,text[],text[],bigint[],integer,integer,integer,integer)',
        'search_lines_regex(text,text[],text[],bigint[],integer,integer,integer,integer)',
        'search_lines_by_word_ids(bigint[],text[],text[],bigint[],integer,integer,integer,integer)',
        'search_number_lines(integer,text[],text[],text[],bigint[],integer,integer,integer,integer)'
      )
  loop
    found := found + 1;
    def := pg_get_functiondef(fn);
    if def ~ 'order by ([a-z])\.corpus_rank, \1\.ang, \1\.line_no, \1\.id\M' then
      continue;  -- already applied
    end if;
    -- Sort keys only: the same column list also appears in select lists.
    new := regexp_replace(def, 'order by ([a-z])\.corpus_rank, \1\.ang, \1\.line_no\M', 'order by \1.corpus_rank, \1.ang, \1.line_no, \1.id', 'g');
    if new = def then
      raise exception '055: no reading-order sort found in %', fn;
    end if;
    execute new;
  end loop;
  if found <> 6 then
    raise exception '055: expected 6 search functions, found %', found;
  end if;
end
$$;

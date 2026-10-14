-- 045: first-letter search without touching the wide `lines` rows.
--
-- 044's prefix index found matches fast, but the RPC then read every matching
-- row from the heap (gurmukhi + translations) just to count, sort and keep 20.
-- A broad query hits rows scattered over half the table: `ਸ_ਕ` matched 20,690
-- index entries in 143 ms and then spent ~5.5 s on 5,270 heap blocks on a cold
-- cache, past the anon role's 3s timeout (kosh PR #193's CI run).
--
-- Now the index covers everything the search needs before the page is chosen
-- (filter, count, sort, the shabad join key), so matching runs as an
-- index-only scan, and full rows are fetched for the 20 lines on the page only.
-- Same signature, same results: verified in a rolled-back transaction against
-- live data before applying (ਸਨਕਪ 8, ਸ_ਕ 2,292, ਹ 7,654, ਮਨਮ 30, ੴਸਨਕਪ 31,
-- ਸਨ + writer 73, last page of ਹ 14 rows), 4-126 ms each as anon; the
-- ਸ_ਕ plan is an index-only scan with 0 heap fetches.
--
-- The 044 index (lines_first_letters) is superseded but kept here: the
-- Supabase MCP holds destructive statements for a confirmation a cloud session
-- can't answer (see APPLIED.md, 037). With both present the planner picks the
-- covering index (checked in the dry run). APPLIED.md has the one-line cleanup
-- to run from the dashboard SQL editor.

create index if not exists lines_first_letters_cover
  on lines (first_letters text_pattern_ops)
  include (id, corpus_rank, ang, line_no, shabad_id, source_fk);

create or replace function search_first_letters(
  p_letters  text[],
  p_raags    text[]   default null,
  p_writers  text[]   default null,
  p_sources  bigint[] default null,
  p_ang_min  int      default null,
  p_ang_max  int      default null,
  p_limit    int      default 20,
  p_offset   int      default 0
)
returns table(
  id bigint, verse_id int, shabad_id int, ang int, line_no int,
  gurmukhi text, translation_en text, transliteration_en text,
  raag_english text, raag_gurmukhi text, writer_english text, writer_id int,
  ang_start int, source_fk bigint, total_count bigint
)
language plpgsql stable
as $$
declare
  candidate_ids bigint[];
  i             int;
  letter        text;
  prefix        text;
begin
  if p_letters is null or cardinality(p_letters) = 0 then
    return;
  end if;

  if exists (select 1 from unnest(p_letters) l where char_length(l) <> 1) then
    -- Multi-code-point letters: the pre-044 per-position intersection.
    letter := p_letters[1];
    select array_agg(distinct wo.line_id) into candidate_ids
      from word_occurrences wo join words w on w.id = wo.word_id
      where wo.position = 0 and w.gurmukhi like (letter || '%');
    if candidate_ids is null then return; end if;
    for i in 2 .. array_length(p_letters, 1) loop
      letter := p_letters[i];
      select array_agg(distinct wo.line_id) into candidate_ids
        from word_occurrences wo join words w on w.id = wo.word_id
        where wo.position = (i - 1) and wo.line_id = any(candidate_ids)
          and w.gurmukhi like (letter || '%');
      if candidate_ids is null then return; end if;
    end loop;
  end if;

  -- One LIKE character per letter: '_' matches any letter, and '%' (which
  -- used to match any word) does the same, so it becomes '_'.
  prefix := replace(replace(array_to_string(p_letters, ''), '\', '\\'), '%', '_');

  -- Dynamic SQL so the prefix is a literal the planner can use with the index.
  -- `hits` reads only covered columns (+ the small shabads table for raag and
  -- writer filters); `lines` rows are fetched for the chosen page only.
  return query execute format($q$
    with hits as (
      select l.id, l.corpus_rank, l.ang, l.line_no
      from lines l
      left join shabads s on s.id = l.shabad_id
      where %s
        and ($1 is null or cardinality($1) = 0 or s.raag_english   = any($1))
        and ($2 is null or cardinality($2) = 0 or s.writer_english = any($2))
        and ($3 is null or cardinality($3) = 0 or l.source_fk      = any($3))
        and ($4 is null or l.ang >= $4)
        and ($5 is null or l.ang <= $5)
    ),
    page as (
      select h.id, h.corpus_rank, h.ang, h.line_no, count(*) over() as total_count
      from hits h
      order by h.corpus_rank, h.ang, h.line_no
      limit $6 offset $7
    )
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
      l.source_fk,
      p.total_count
    from page p
    join lines l on l.id = p.id
    left join shabads s on s.id = l.shabad_id
    order by p.corpus_rank, p.ang, p.line_no
  $q$,
    case when candidate_ids is null
      then format('l.first_letters like %L', prefix || '%')
      else 'l.id = any($8)'
    end)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset, candidate_ids;
end;
$$;

grant execute on function search_first_letters(text[], text[], text[], bigint[], int, int, int, int) to anon;

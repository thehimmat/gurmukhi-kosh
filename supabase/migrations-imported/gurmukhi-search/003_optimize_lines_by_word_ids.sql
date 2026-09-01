-- Fix: Letter Set "Lines" search timed out (anon statement_timeout = 3s).
--
-- The original search_lines_by_word_ids used count(*) over(), which forced counting
-- every matching line by scanning all ~400k word_occurrences (~2.2s) on top of a
-- DISTINCT join (~4.6s total for a broad letter set). PostgREST cancelled it.
--
-- Two changes:
--   1) Drop the exact total. The caller fetches p_limit+1 rows to learn whether
--      another page exists, instead of computing a (very expensive) count.
--   2) Use an EXISTS semi-join so the planner can walk lines in (ang, line_no)
--      order via the lines_ang index and stop as soon as it has a page.
--
-- The function is plpgsql + EXECUTE format(%L) so the id array is inlined as a
-- literal and the query is re-planned per call. A plain SQL function with an array
-- parameter gets a cached *generic* plan that does NOT early-stop (~500ms warm,
-- timeout cold); inlining the literal yields the lines-ordered plan (~30ms warm,
-- ~480ms worst case for a rare letter at a deep offset).

drop function if exists search_lines_by_word_ids(bigint[], text, text, int, int, int, int);

create or replace function search_lines_by_word_ids(
  p_word_ids bigint[],
  p_raag     text default null,
  p_writer   text default null,
  p_ang_min  int  default null,
  p_ang_max  int  default null,
  p_limit    int  default 20,
  p_offset   int  default 0
)
returns table(
  id               bigint,
  verse_id         int,
  shabad_id        int,
  ang              int,
  line_no          int,
  gurmukhi         text,
  translation_en   text,
  transliteration_en text,
  raag_english     text,
  raag_gurmukhi    text,
  writer_english   text,
  writer_id        int,
  ang_start        int
)
language plpgsql stable
as $$
begin
  return query execute format($q$
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start
    from lines l
    left join shabads s on s.id = l.shabad_id
    where exists (
      select 1 from word_occurrences wo
      where wo.line_id = l.id and wo.word_id = any(%L::bigint[])
    )
      and ($1 is null or s.raag_english   = $1)
      and ($2 is null or s.writer_english = $2)
      and ($3 is null or l.ang >= $3)
      and ($4 is null or l.ang <= $4)
    order by l.ang, l.line_no
    limit $5 offset $6
  $q$, p_word_ids)
  using p_raag, p_writer, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

grant execute on function search_lines_by_word_ids to anon;

-- UNFILED: copied verbatim from the server ledger (supabase_migrations.schema_migrations,
-- version 20260629040129, name lines_by_word_ids_dynamic_plan) on 2026-10-19. It ran only in the database; see supabase/APPLIED.md.

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
  id bigint, verse_id int, shabad_id int, ang int, line_no int,
  gurmukhi text, translation_en text, transliteration_en text,
  raag_english text, raag_gurmukhi text, writer_english text, writer_id int, ang_start int
)
language plpgsql stable
as $$
begin
  -- Inline the id array as a literal so the planner re-plans per call and picks
  -- the lines-ordered EXISTS early-stop plan (a cached generic plan does not).
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

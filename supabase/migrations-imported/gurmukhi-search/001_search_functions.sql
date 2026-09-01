-- Search functions for gurmukhi-search app.
-- Targets the same Supabase project as gurmukhi-kosh.
-- Run once: psql <connection-string> -f this_file
-- Or: supabase db push (from within the kosh project that has the connection set up)

-- ─── Performance index ────────────────────────────────────────────────────────
-- Speeds up first-letter search: look up all line_ids where position=N and word starts with X.
create index if not exists word_occurrences_position_word
  on word_occurrences (position, word_id);

-- ─── search_lines_regex ───────────────────────────────────────────────────────
-- Full-line regex search with optional filters.
-- Returns line rows + total_count column for single-query pagination.
create or replace function search_lines_regex(
  p_regex    text,
  p_raag     text    default null,
  p_writer   text    default null,
  p_ang_min  int     default null,
  p_ang_max  int     default null,
  p_limit    int     default 20,
  p_offset   int     default 0
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
  ang_start        int,
  total_count      bigint
)
language sql stable
as $$
  with filtered as (
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start
    from lines l
    left join shabads s on s.id = l.shabad_id
    where
      l.gurmukhi ~ p_regex
      and (p_raag   is null or s.raag_english   = p_raag)
      and (p_writer is null or s.writer_english = p_writer)
      and (p_ang_min is null or l.ang >= p_ang_min)
      and (p_ang_max is null or l.ang <= p_ang_max)
  )
  select
    f.*,
    count(*) over() as total_count
  from filtered f
  order by f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

-- ─── search_first_letters ─────────────────────────────────────────────────────
-- Find lines where word at position i starts with letters[i].
-- p_letters is an array of single Gurmukhi codepoints/characters.
create or replace function search_first_letters(
  p_letters  text[],
  p_raag     text    default null,
  p_writer   text    default null,
  p_ang_min  int     default null,
  p_ang_max  int     default null,
  p_limit    int     default 20,
  p_offset   int     default 0
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
  ang_start        int,
  total_count      bigint
)
language plpgsql stable
as $$
declare
  candidate_ids bigint[];
  i             int;
  letter        text;
begin
  -- Start with all line IDs, then intersect for each letter position.
  -- We use a temporary set and reduce it with each letter.

  -- Initialise with lines matching position 0
  letter := p_letters[1]; -- 1-indexed in PL/pgSQL
  select array_agg(distinct wo.line_id)
    into candidate_ids
    from word_occurrences wo
    join words w on w.id = wo.word_id
    where wo.position = 0
      and w.gurmukhi like (letter || '%');

  if candidate_ids is null or array_length(candidate_ids, 1) = 0 then
    return; -- no results
  end if;

  -- For each additional letter, narrow the candidate set
  for i in 2 .. array_length(p_letters, 1) loop
    letter := p_letters[i];
    select array_agg(distinct wo.line_id)
      into candidate_ids
      from word_occurrences wo
      join words w on w.id = wo.word_id
      where wo.position = (i - 1)
        and wo.line_id = any(candidate_ids)
        and w.gurmukhi like (letter || '%');

    if candidate_ids is null or array_length(candidate_ids, 1) = 0 then
      return;
    end if;
  end loop;

  -- Return full line rows for the surviving candidate IDs
  return query
    with filtered as (
      select
        l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
        l.gurmukhi, l.translation_en, l.transliteration_en,
        s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start
      from lines l
      left join shabads s on s.id = l.shabad_id
      where l.id = any(candidate_ids)
        and (p_raag   is null or s.raag_english   = p_raag)
        and (p_writer is null or s.writer_english = p_writer)
        and (p_ang_min is null or l.ang >= p_ang_min)
        and (p_ang_max is null or l.ang <= p_ang_max)
    )
    select f.*, count(*) over() as total_count
    from filtered f
    order by f.ang, f.line_no
    limit p_limit
    offset p_offset;
end;
$$;

-- Grant execute to the anon role (matches kosh RLS setup — read-only public access)
grant execute on function search_lines_regex to anon;
grant execute on function search_first_letters to anon;

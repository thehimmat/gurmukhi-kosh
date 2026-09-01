-- Word-level and letter-set search functions for gurmukhi-search.
-- Targets the same Supabase project as gurmukhi-kosh (read-only via anon role).
-- Companion to 001_search_functions.sql.

-- ─── search_words_regex ───────────────────────────────────────────────────────
-- Regex search against individual word forms (words.gurmukhi).
-- Powers Pattern mode's "word" scope. Returns words + total_count for pagination.
create or replace function search_words_regex(
  p_regex   text,
  p_limit   int default 20,
  p_offset  int default 0
)
returns table(
  id          bigint,
  gurmukhi    text,
  frequency   int,
  total_count bigint
)
language sql stable
as $$
  with filtered as (
    select w.id, w.gurmukhi, w.frequency
    from words w
    where w.gurmukhi ~ p_regex
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.frequency desc, f.gurmukhi
  limit p_limit
  offset p_offset;
$$;

-- ─── search_lines_by_word_ids ─────────────────────────────────────────────────
-- Given a set of word ids (e.g. the words that matched a Letter Set query),
-- return the distinct lines that contain any of them, with the usual filters.
-- Mirrors the row shape of search_lines_regex so the client can reuse mapping.
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
  ang_start        int,
  total_count      bigint
)
language sql stable
as $$
  with matched_lines as (
    select distinct wo.line_id
    from word_occurrences wo
    where wo.word_id = any(p_word_ids)
  ),
  filtered as (
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start
    from matched_lines ml
    join lines l on l.id = ml.line_id
    left join shabads s on s.id = l.shabad_id
    where
      (p_raag    is null or s.raag_english    = p_raag)
      and (p_writer is null or s.writer_english = p_writer)
      and (p_ang_min is null or l.ang >= p_ang_min)
      and (p_ang_max is null or l.ang <= p_ang_max)
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

-- Grant execute to the anon role (matches kosh RLS setup — read-only public access)
grant execute on function search_words_regex to anon;
grant execute on function search_lines_by_word_ids to anon;

-- 034: search_number_lines returns every matched numeral's offsets, not just
-- the first.
--
-- Migration 033 collapsed a line's matches to one row (right — results are
-- lines) but carried only min(char_start) through, so a heading holding the
-- same value twice highlighted only the first of them. On
-- ਰਾਗੁ ਸਿਰੀਰਾਗੁ ਮਹਲਾ ਪਹਿਲਾ ੧ ਘਰੁ ੧ ॥ the card showed both role chips while
-- marking just the mahalla ੧, so the ghar ੧ read as if it had not matched.
--
-- char_starts/char_ends are parallel arrays ordered by position, one entry per
-- matched numeral, so char_starts[i] pairs with char_ends[i].
--
-- The scalar char_start/char_end stay for now. gurmukhi-search is deployed
-- against them, and #113 rule 5 requires shared RPC signatures to change
-- add-then-remove: this migration adds the arrays, search ships reading them,
-- and a later migration drops the scalars once nothing reads them. Dropping
-- them here would break number search in production for the minutes between
-- the two deploys.
--
-- Changing a returns-table shape is a return-type change, so the function is
-- dropped and recreated rather than replaced. Both happen in this one
-- migration's transaction, so no call ever sees it missing.

drop function if exists search_number_lines(int, text[], text[], text[], bigint[], int, int, int, int);

create or replace function search_number_lines(
  p_value    int,
  p_roles    text[]    default null,
  p_raags    text[]    default null,
  p_writers  text[]    default null,
  p_sources  bigint[]  default null,
  p_ang_min  int       default null,
  p_ang_max  int       default null,
  p_limit    int       default 20,
  p_offset   int       default 0
)
returns table(
  id                 bigint,
  verse_id           int,
  shabad_id          int,
  ang                int,
  line_no            int,
  gurmukhi           text,
  translation_en     text,
  transliteration_en text,
  raag_english       text,
  raag_gurmukhi      text,
  writer_english     text,
  writer_id          int,
  ang_start          int,
  source_fk          bigint,
  numeral_roles      text[],
  numeral_keywords   text[],
  char_start         int,
  char_end           int,
  char_starts        int[],
  char_ends          int[],
  total_count        bigint
)
language sql stable
as $$
  with matched as (
    select
      n.line_id,
      array_agg(distinct n.role order by n.role)                           as numeral_roles,
      array_remove(array_agg(distinct n.keyword order by n.keyword), null) as numeral_keywords,
      min(n.char_start)                                                    as char_start,
      (array_agg(n.char_end order by n.char_start))[1]                     as char_end,
      array_agg(n.char_start order by n.char_start)                        as char_starts,
      array_agg(n.char_end   order by n.char_start)                        as char_ends
    from number_occurrences n
    where n.value = p_value
      and (p_roles is null or cardinality(p_roles) = 0 or n.role = any(p_roles))
    group by n.line_id
  ),
  filtered as (
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
      l.source_fk, l.corpus_rank,
      m.numeral_roles, m.numeral_keywords,
      m.char_start, m.char_end, m.char_starts, m.char_ends
    from matched m
    join lines l on l.id = m.line_id
    left join shabads s on s.id = l.shabad_id
    where
      (p_raags   is null or cardinality(p_raags)   = 0 or s.raag_english   = any(p_raags))
      and (p_writers is null or cardinality(p_writers) = 0 or s.writer_english = any(p_writers))
      and (p_sources is null or cardinality(p_sources) = 0 or l.source_fk      = any(p_sources))
      and (p_ang_min is null or l.ang >= p_ang_min)
      and (p_ang_max is null or l.ang <= p_ang_max)
  )
  select
    f.id, f.verse_id, f.shabad_id, f.ang, f.line_no,
    f.gurmukhi, f.translation_en, f.transliteration_en,
    f.raag_english, f.raag_gurmukhi, f.writer_english, f.writer_id, f.ang_start,
    f.source_fk,
    f.numeral_roles, f.numeral_keywords,
    f.char_start, f.char_end, f.char_starts, f.char_ends,
    count(*) over() as total_count
  from filtered f
  order by f.corpus_rank, f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

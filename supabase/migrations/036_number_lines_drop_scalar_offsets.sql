-- 036: drop search_number_lines' scalar char_start/char_end (second half of 034).
--
-- 034 added char_starts/char_ends and kept the scalars because gurmukhi-search
-- was deployed against them (#113 rule 5, add-then-remove). Search now reads the
-- arrays: its production deploy of f6ec668 ("Highlight every matched numeral on
-- a line") has been live since 2026-09-23, and its scalar read is only a
-- fallback taken when the arrays are absent, which they never are.
--
-- kosh's own /api/search reads number_occurrences' columns directly, not this
-- RPC, so it is unaffected.
--
-- Same drop-and-recreate in one transaction as 034: a returns-table change is a
-- return-type change.

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
      m.char_starts, m.char_ends
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
    f.char_starts, f.char_ends,
    count(*) over() as total_count
  from filtered f
  order by f.corpus_rank, f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

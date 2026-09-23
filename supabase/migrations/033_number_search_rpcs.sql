-- 033: number search RPCs, consumed by the gurmukhi-search shell.
--
-- These functions live here, not in gurmukhi-search, because kosh owns this
-- project's schema (#113) — "every future migration lands in THIS repo, even
-- when the motivating feature lives in gurmukhi-search". Search reads them over
-- the anon key like the other list_*/search_* RPCs it already calls.
--
-- They answer the search-side question — "where in the scriptures does this
-- number appear, and in what capacity?" — over number_occurrences (migration
-- 032). The roles are assigned by lib/gurmukhi-numerals.ts at ingest, so the
-- role vocabulary is defined once, here-adjacent, and search never needs a copy
-- of the classifier: it asks list_number_roles what the roles are.
--
-- Signatures deliberately mirror search_lines_regex (gurmukhi-search migration
-- 006): same facet arguments in the same order, same flat result columns, same
-- (corpus_rank, ang, line_no) reading order and the same total_count window, so
-- the shell's existing mapFlatLineRow and rpcFilterArgs handle them unchanged.

-- ─── Role facet for one number ───────────────────────────────────────────────
-- Unlike list_raags/list_writers/list_corpora this is scoped to a value: the
-- counts are what the checkboxes show for the number being searched. Every role
-- is returned even at zero, so the UI can render (and disable) the full set
-- rather than silently dropping a box. Ordered author, ghar, heading_other,
-- verse_marker — the NUMERAL_ROLES order, headings before tallies.
create or replace function list_number_roles(p_value int)
returns table(role text, line_count bigint)
language sql stable
as $$
  select r.role, count(n.id)::bigint as line_count
  from (values ('author', 1), ('ghar', 2), ('heading_other', 3), ('verse_marker', 4))
       as r(role, ord)
  left join number_occurrences n
    on n.role = r.role and n.value = p_value
  group by r.role, r.ord
  order by r.ord;
$$;

-- ─── Line search for one number ──────────────────────────────────────────────
-- One row per LINE, not per numeral. A heading like ਮਹਲਾ ਪਹਿਲਾ ੧ ਘਰੁ ੧ carries
-- the same value twice in different roles; emitting it once per occurrence
-- would show the line twice in a line-result list and inflate total_count. The
-- matched roles are aggregated into an array instead, and the offsets are those
-- of the first match, which is what the result card highlights.
--
-- p_roles empty or null means every role, including verse markers. The shell
-- sends the heading roles by default; the "no filter means everything" reading
-- matches the other facets, so a caller that omits it is not silently filtered.
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
  total_count        bigint
)
language sql stable
as $$
  with matched as (
    select
      n.line_id,
      array_agg(distinct n.role order by n.role)                          as numeral_roles,
      array_remove(array_agg(distinct n.keyword order by n.keyword), null) as numeral_keywords,
      min(n.char_start)                                                    as char_start,
      (array_agg(n.char_end order by n.char_start))[1]                     as char_end
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
      m.numeral_roles, m.numeral_keywords, m.char_start, m.char_end
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
    f.numeral_roles, f.numeral_keywords, f.char_start, f.char_end,
    count(*) over() as total_count
  from filtered f
  order by f.corpus_rank, f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

-- 066: Contains search for gurmukhi-search, on the canonical spelling.
--
--   search_lines_contains — a page of lines containing the query
--   count_lines_contains  — their total, for page 0
--
-- The shell searched `lines.gurmukhi like '%q%'` through PostgREST. Two things
-- went wrong with marks:
--
-- 1. Nukta. Most nukta letters are stored ready-made (ਸ਼ U+0A36, 7,560 lines),
--    some as letter + nukta (ਖ + ਼, 220 lines), so ਼ alone found only the
--    second kind, and ਖ਼ typed one way missed lines spelled the other. Both
--    forms are the same text under Unicode NFD (the ready-made letters are
--    composition exclusions, so NFD always splits them), so lines and query
--    are compared after normalize(…, NFD). A plain letter at the end of the
--    query must not run into a nukta (ਸ is not ਸ਼), which the regex enforces.
--
-- 2. Queries with no trigram. pg_trgm reads ਼ and ੍ as non-word characters,
--    so ੍, ਼ or "੍ " give the trigram index nothing to look up. When the
--    planner used it anyway it scanned the whole index (3.4 s, past the anon
--    3 s timeout). Such queries use strpos, which no index serves, so they
--    always take a sequential scan (~0.5 s).
--
-- NFD also puts ਼ before ੍, which the corpus sometimes stores the other way
-- round (ਦ਼੍), so "੍ " (a word ending in halant) is found either way.

create index if not exists lines_gurmukhi_nfd_trgm
  on lines using gin (normalize(gurmukhi, NFD) gin_trgm_ops);

-- The WHERE fragment matching `l` against the query, or null for a blank one.
create or replace function contains_condition(p_query text)
returns text
language plpgsql immutable
as $$
declare
  q    text;
  hay  constant text := 'normalize(l.gurmukhi, NFD)';
  cond text;
begin
  if p_query is null or btrim(p_query) = '' then
    return null;
  end if;
  q := normalize(p_query, NFD);

  -- A LIKE pattern yields a trigram only from a run of three word characters.
  -- The class is Gurmukhi less ਼ and ੍ (pg_trgm's own word characters there).
  if q ~ U&'[\0A01-\0A03\0A05-\0A39\0A3E-\0A4C\0A51\0A59-\0A5E\0A66-\0A75]{3}' then
    cond := format('%s like %L', hay,
      '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%');
  else
    cond := format('strpos(%s, %L) > 0', hay, q);
  end if;

  -- Some occurrence must not be followed by a nukta. `|| ''` keeps the
  -- planner off the trigram index for this regex, which may have no trigram.
  if right(q, 1) <> U&'\0A3C' then
    cond := cond || format(' and (%s || '''') ~ %L', hay,
      regexp_replace(q, '([.^$*+?(){}|\[\]\\])', '\\\1', 'g') || U&'(?!\0A3C)');
  end if;
  return cond;
end;
$$;

create or replace function search_lines_contains(
  p_query    text,
  p_raags    text[]   default null,
  p_writers  text[]   default null,
  p_sources  bigint[] default null,
  p_ang_min  int      default null,
  p_ang_max  int      default null,
  p_limit    int      default 21,
  p_offset   int      default 0
)
returns table(
  id bigint, verse_id int, shabad_id int, ang int, line_no int,
  gurmukhi text, translation_en text, transliteration_en text,
  raag_english text, raag_gurmukhi text, writer_english text, writer_id int,
  ang_start int, source_fk bigint
)
language plpgsql stable
as $$
declare
  conds text := contains_condition(p_query);
begin
  if conds is null then
    return;
  end if;

  return query execute format($q$
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
      l.source_fk
    from lines l
    left join shabads s on s.id = l.shabad_id
    where (%s)
      and ($1 is null or cardinality($1) = 0 or s.raag_english   = any($1))
      and ($2 is null or cardinality($2) = 0 or s.writer_english = any($2))
      and ($3 is null or cardinality($3) = 0 or l.source_fk      = any($3))
      and ($4 is null or l.ang >= $4)
      and ($5 is null or l.ang <= $5)
    order by l.corpus_rank, l.ang, l.line_no, l.verse_id
    limit $6 offset $7
  $q$, conds)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

-- The total, with the same conditions. Uncapped by default: exact Contains
-- has always shown its full count.
create or replace function count_lines_contains(
  p_query    text,
  p_raags    text[]   default null,
  p_writers  text[]   default null,
  p_sources  bigint[] default null,
  p_ang_min  int      default null,
  p_ang_max  int      default null,
  p_cap      int      default null
)
returns bigint
language plpgsql stable
as $$
declare
  conds text := contains_condition(p_query);
  n     bigint;
begin
  if conds is null then
    return 0;
  end if;

  execute format($q$
    select count(*) from (
      select 1
      from lines l
      left join shabads s on s.id = l.shabad_id
      where (%s)
        and ($1 is null or cardinality($1) = 0 or s.raag_english   = any($1))
        and ($2 is null or cardinality($2) = 0 or s.writer_english = any($2))
        and ($3 is null or cardinality($3) = 0 or l.source_fk      = any($3))
        and ($4 is null or l.ang >= $4)
        and ($5 is null or l.ang <= $5)
      limit $6
    ) x
  $q$, conds)
  into n
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_cap;
  return n;
end;
$$;

grant execute on function search_lines_contains(text, text[], text[], bigint[], int, int, int, int) to anon;
grant execute on function count_lines_contains(text, text[], text[], bigint[], int, int, int) to anon;

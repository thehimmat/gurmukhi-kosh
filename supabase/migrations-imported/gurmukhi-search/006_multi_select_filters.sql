-- 006: multi-select filters (writer, raag, scripture).
--
-- Two changes:
--
-- 1. Facet lists. listRaags/listWriters read `shabads` through PostgREST with no
--    pagination, so they silently saw only the first 1000 of 11,875 rows and the
--    dropdowns showed a truncated, alphabetically-clipped slice of writers. The
--    DISTINCT now happens in SQL, which also lets each facet carry its line
--    count and (for writers) which corpora it appears in.
--
-- 2. The line-search RPCs took one raag and one writer. They now take arrays,
--    plus a corpus (scripture) filter. NULL or empty array means "no filter", so
--    an unfiltered call behaves exactly as before.
--
-- Signatures change, so the old single-value functions are dropped first.

-- ─── Facet lists ──────────────────────────────────────────────────────────────

create or replace function list_writers()
returns table(writer_english text, line_count bigint, source_ids bigint[])
language sql stable
as $$
  select
    s.writer_english,
    count(*)::bigint as line_count,
    array_agg(distinct l.source_fk order by l.source_fk) as source_ids
  from lines l
  join shabads s on s.id = l.shabad_id
  where s.writer_english is not null
  group by s.writer_english
  order by count(*) desc;
$$;

create or replace function list_raags()
returns table(raag_english text, line_count bigint)
language sql stable
as $$
  select s.raag_english, count(*)::bigint as line_count
  from lines l
  join shabads s on s.id = l.shabad_id
  where s.raag_english is not null
  group by s.raag_english
  order by s.raag_english;
$$;

-- Corpora in reading order (lines.corpus_rank, migration 031 in gurmukhi-kosh).
create or replace function list_corpora()
returns table(id bigint, code text, name text, line_count bigint)
language sql stable
as $$
  select src.id, src.code, src.name, count(l.id)::bigint as line_count
  from sources src
  join lines l on l.source_fk = src.id
  group by src.id, src.code, src.name
  order by min(l.corpus_rank), src.id;
$$;

-- ─── Line searches, now multi-select ──────────────────────────────────────────

drop function if exists search_lines_regex(text, text, text, int, int, int, int);

create or replace function search_lines_regex(
  p_regex    text,
  p_raags    text[]    default null,
  p_writers  text[]    default null,
  p_sources  bigint[]  default null,
  p_ang_min  int       default null,
  p_ang_max  int       default null,
  p_limit    int       default 20,
  p_offset   int       default 0
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
  source_fk        bigint,
  total_count      bigint
)
language sql stable
as $$
  with filtered as (
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
      l.source_fk, l.corpus_rank
    from lines l
    left join shabads s on s.id = l.shabad_id
    where
      l.gurmukhi ~ p_regex
      and (p_raags   is null or cardinality(p_raags)   = 0 or s.raag_english   = any(p_raags))
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
    count(*) over() as total_count
  from filtered f
  order by f.corpus_rank, f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

drop function if exists search_first_letters(text[], text, text, int, int, int, int);

create or replace function search_first_letters(
  p_letters  text[],
  p_raags    text[]    default null,
  p_writers  text[]    default null,
  p_sources  bigint[]  default null,
  p_ang_min  int       default null,
  p_ang_max  int       default null,
  p_limit    int       default 20,
  p_offset   int       default 0
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
  source_fk        bigint,
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

  return query
    with filtered as (
      select
        l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
        l.gurmukhi, l.translation_en, l.transliteration_en,
        s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
        l.source_fk, l.corpus_rank
      from lines l
      left join shabads s on s.id = l.shabad_id
      where l.id = any(candidate_ids)
        and (p_raags   is null or cardinality(p_raags)   = 0 or s.raag_english   = any(p_raags))
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
      count(*) over() as total_count
    from filtered f
    order by f.corpus_rank, f.ang, f.line_no
    limit p_limit
    offset p_offset;
end;
$$;

-- Keeps migration 003's inlined-literal plpgsql shape (a generic cached plan
-- does not early-stop); the sort key matches the (corpus_rank, ang, line_no)
-- index added in gurmukhi-kosh migration 031.
drop function if exists search_lines_by_word_ids(bigint[], text, text, int, int, int, int);

create or replace function search_lines_by_word_ids(
  p_word_ids bigint[],
  p_raags    text[]    default null,
  p_writers  text[]    default null,
  p_sources  bigint[]  default null,
  p_ang_min  int       default null,
  p_ang_max  int       default null,
  p_limit    int       default 20,
  p_offset   int       default 0
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
  source_fk        bigint
)
language plpgsql stable
as $$
begin
  return query execute format($q$
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
      l.source_fk
    from lines l
    left join shabads s on s.id = l.shabad_id
    where exists (
      select 1 from word_occurrences wo
      where wo.line_id = l.id and wo.word_id = any(%L::bigint[])
    )
      and ($1 is null or cardinality($1) = 0 or s.raag_english   = any($1))
      and ($2 is null or cardinality($2) = 0 or s.writer_english = any($2))
      and ($3 is null or cardinality($3) = 0 or l.source_fk      = any($3))
      and ($4 is null or l.ang >= $4)
      and ($5 is null or l.ang <= $5)
    order by l.corpus_rank, l.ang, l.line_no
    limit $6 offset $7
  $q$, p_word_ids)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

grant execute on function list_writers to anon;
grant execute on function list_raags to anon;
grant execute on function list_corpora to anon;
grant execute on function search_lines_regex to anon;
grant execute on function search_first_letters to anon;
grant execute on function search_lines_by_word_ids to anon;

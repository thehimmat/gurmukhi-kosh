-- 051: First Letter treats a vowel carrier as every vowel it carries (#198),
-- and the fuzzy First Letter indexes cover the search like 045's does (#199).
--
-- lines.first_letters held each word's first code point, so a word starting
-- with an independent vowel (ਇਕ) stored ਇ, and searching its letter ੲ found
-- nothing: only 2 words in the corpus start with a literal ੲ, against 837
-- starting ਇ/ਈ/ਏ. A carrier now stands for its vowels, the way ਸ stands for
-- ਸਿ ਸੀ ਸੇ:
--
--   ੲ  ← ਇ ਈ ਏ        ੳ  ← ਉ ਊ ਓ        ਅ  ← ਆ ਐ ਔ
--
-- first_letters stores the carrier and the RPCs fold the query the same way,
-- so typing ਇ, ਈ, ਏ or ੲ all find the same lines. A folded column, not an
-- expression index: the covering index (045) and the fuzzy indexes (047) stay
-- on the plain column, and fuzzy_fold leaves ੲ ੳ ਅ alone at every level.
-- gurmukhi-search doesn't highlight First Letter matches, so it holds no copy.

create or replace function first_letter_fold(t text) returns text
language sql immutable parallel safe
as $$
  select pg_catalog.translate(t, 'ਇਈਏਉਊਓਆਐਔ', 'ੲੲੲੳੳੳਅਅਅ')
$$;

grant execute on function first_letter_fold(text) to anon;

-- 044's rebuild, folding each word's first letter.
create or replace function refresh_line_first_letters() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  update lines
  set first_letters = f.letters
  from (
    select wo.line_id,
           first_letter_fold(string_agg(left(w.gurmukhi, 1), '' order by wo.position)) as letters
    from word_occurrences wo
    join words w on w.id = wo.word_id
    group by wo.line_id
  ) f
  where lines.id = f.line_id
    and lines.first_letters is distinct from f.letters;

  update lines
  set first_letters = null
  where first_letters is not null
    and not exists (select 1 from word_occurrences wo where wo.line_id = lines.id);
$$;

revoke execute on function refresh_line_first_letters() from public, anon, authenticated;
grant execute on function refresh_line_first_letters() to service_role;

-- Fold the stored letters in place (~45k of 171,880 lines carry a vowel).
update lines
set first_letters = first_letter_fold(first_letters)
where first_letters ~ '[ਇਈਏਉਊਓਆਐਔ]';

-- ─── Exact ───────────────────────────────────────────────────────────────────
-- 045's function with the query folded. The pre-044 per-position branch for
-- letters of more than one code point is gone: gurmukhi-search splits the
-- query by code point, so nothing reached it (#199). Each letter is now its
-- first code point, as search_first_letters_fuzzy already did.
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
  prefix text;
begin
  if p_letters is null or cardinality(p_letters) = 0 then
    return;
  end if;

  -- One LIKE character per letter: '_' matches any letter, and '%' does the
  -- same, so it becomes '_'.
  prefix := first_letter_fold(array_to_string(array(select left(l, 1) from unnest(p_letters) l), ''));
  prefix := replace(replace(prefix, '\', '\\'), '%', '_');

  -- Dynamic SQL so the prefix is a literal the planner can use with the index.
  -- `hits` reads only covered columns (+ the small shabads table for raag and
  -- writer filters); `lines` rows are fetched for the chosen page only.
  return query execute format($q$
    with hits as (
      select l.id, l.corpus_rank, l.ang, l.line_no
      from lines l
      left join shabads s on s.id = l.shabad_id
      where l.first_letters like %L
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
  $q$, prefix || '%')
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

grant execute on function search_first_letters(text[], text[], text[], bigint[], int, int, int, int) to anon;

-- ─── Fuzzy ───────────────────────────────────────────────────────────────────
-- Covering versions of 047's fold indexes, so fuzzy First Letter is an
-- index-only scan like 045's exact search. 047's lines_first_letters_fold1/2
-- are superseded; drop them (and 044's lines_first_letters) from the dashboard
-- SQL editor, as the MCP holds DROP for a confirmation (APPLIED.md).
create index if not exists lines_first_letters_fold1_cover
  on lines (fuzzy_fold(first_letters, 1) text_pattern_ops)
  include (id, corpus_rank, ang, line_no, shabad_id, source_fk);
create index if not exists lines_first_letters_fold2_cover
  on lines (fuzzy_fold(first_letters, 2) text_pattern_ops)
  include (id, corpus_rank, ang, line_no, shabad_id, source_fk);

-- 047's function with the query folded to carriers first.
create or replace function search_first_letters_fuzzy(
  p_letters  text[],
  p_level    int,
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
  lvl     int := least(greatest(coalesce(p_level, 0), 1), 3);
  fold    int := least(lvl, 2);
  letters text;
  conds   text;
begin
  if p_letters is null or cardinality(p_letters) = 0 then
    return;
  end if;

  -- One character per letter; a user wildcard stays a wildcard after folding.
  letters := first_letter_fold(array_to_string(array(select left(l, 1) from unnest(p_letters) l), ''));
  letters := replace(letters, '%', '_');

  select string_agg(format('fuzzy_fold(l.first_letters, %s) like %L', fold, b || '%'), ' or ')
    into conds
    from (
      -- fuzzy_like_bodies escapes '_', but here '_' is the user's wildcard.
      select replace(b, '\_', '_') as b from unnest(fuzzy_like_bodies(letters, lvl)) b
    ) x;

  return query execute format($q$
    with hits as (
      select l.id, l.corpus_rank, l.ang, l.line_no
      from lines l
      left join shabads s on s.id = l.shabad_id
      where (%s)
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
  $q$, conds)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

grant execute on function search_first_letters_fuzzy(text[], int, text[], text[], bigint[], int, int, int, int) to anon;

-- 047: fuzzy search levels for gurmukhi-search (Off / Low / Medium / High).
--
-- fuzzy_fold(text, level) maps letters that a searcher may mix up onto one
-- representative, so a folded query matches folded text:
--
--   Low (1):    ਕਖ ਗਘ ਚਛ ਜਝ ਟਠ ਡਢ ਤਥ ਦਧ ਪਫ ਬਭ ਨਣ, and every nukta letter with its
--               base (ਸ਼ ਸ, ਖ਼ ਖ, ਗ਼ ਗ, ਜ਼ ਜ, ਫ਼ ਫ, ਲ਼ ਲ).
--   Medium (2): Low, plus ਤਥਟਠ, ਦਧਡਢ, ਨਣਞਙ, and vowel length: ਅ ਆ, ਇ ਈ, ਉ ਊ,
--               ਏ ਐ, ਓ ਔ as independent vowels, and kanna/ਿ ੀ/ੁ ੂ/ੇ ੈ/ੋ ੌ as matras.
--   High:       Medium, plus any one letter of the query may be wrong. That is a
--               query-side rewrite (one '_' wildcard per position, OR-ed), so
--               it needs no fold of its own.
--
-- NFD first so nukta letters (U+0A33, U+0A36, U+0A59-5E) split into base +
-- U+0A3C, which translate() then drops (a from-character with no to-character
-- is deleted). Kanna is dropped the same way at Medium. The fold never removes
-- a whole letter, so lines.first_letters keeps one character per word and
-- prefix positions still line up.
--
-- Matching uses expression indexes on fuzzy_fold(col, level) rather than
-- stored columns: the folded text is cheap to recompute for index rechecks
-- and this keeps lines/words unchanged. The function is a plain IMMUTABLE SQL
-- function (no SET clause) so the planner inlines it and matches queries to
-- the index expressions; the levels are spliced into the RPCs' SQL as literals
-- for the same reason.
--
-- Search-side copy of the rules (for highlighting matches): gurmukhi-search
-- lib/fuzzy.ts. Change both together.

create or replace function fuzzy_fold(t text, lvl int) returns text
language sql immutable parallel safe
as $$
  select case
    when t is null or lvl is null or lvl <= 0 then t
    when lvl = 1 then pg_catalog.translate(normalize(t, NFD),
      'ਖਘਛਝਠਢਥਧਫਭਣ਼',
      'ਕਗਚਜਟਡਤਦਪਬਨ')
    else pg_catalog.translate(normalize(t, NFD),
      'ਖਘਛਝਠਢਥਧਫਭਣਟਡਞਙਆਈਊਐਔੀੂੈੌ਼ਾ',
      'ਕਗਚਜਤਦਤਦਪਬਨਤਦਨਨਅਇਉਏਓਿੁੇੋ')
  end
$$;

grant execute on function fuzzy_fold(text, int) to anon;

-- Contains: substring on the folded line.
create index if not exists lines_gurmukhi_fold1_trgm on lines using gin (fuzzy_fold(gurmukhi, 1) gin_trgm_ops);
create index if not exists lines_gurmukhi_fold2_trgm on lines using gin (fuzzy_fold(gurmukhi, 2) gin_trgm_ops);

-- First letter: prefix on the folded first letters (as 044/045 do unfolded).
create index if not exists lines_first_letters_fold1 on lines (fuzzy_fold(first_letters, 1) text_pattern_ops);
create index if not exists lines_first_letters_fold2 on lines (fuzzy_fold(first_letters, 2) text_pattern_ops);

-- Dictionary: prefix on the folded word; High also needs the trigram index
-- because a wildcard in the first position defeats the prefix btree.
create index if not exists words_gurmukhi_fold1 on words (fuzzy_fold(gurmukhi, 1) text_pattern_ops);
create index if not exists words_gurmukhi_fold2 on words (fuzzy_fold(gurmukhi, 2) text_pattern_ops);
create index if not exists words_gurmukhi_fold2_trgm on words using gin (fuzzy_fold(gurmukhi, 2) gin_trgm_ops);

-- The LIKE body for a folded query: escaped, and for High (3) one alternative
-- per position with that position wildcarded. Queries of under three letters
-- get no wildcard (one letter of two being anything matches nearly
-- everything), so High falls back to Medium for them.
create or replace function fuzzy_like_bodies(p_query text, p_level int) returns text[]
language sql immutable parallel safe
as $$
  with q as (
    select regexp_replace(fuzzy_fold(p_query, least(p_level, 2)), '([\\%_])', '\\\1', 'g') as e,
           fuzzy_fold(p_query, least(p_level, 2)) as raw
  )
  select case
    when p_level < 3 or char_length(q.raw) < 3 then array[q.e]
    else array(
      select regexp_replace(left(q.raw, i - 1), '([\\%_])', '\\\1', 'g') || '_' ||
             regexp_replace(substr(q.raw, i + 1), '([\\%_])', '\\\1', 'g')
      from generate_series(1, char_length(q.raw)) i
    )
  end
  from q
$$;

-- ─── Contains ────────────────────────────────────────────────────────────────
-- Lines whose folded text contains the folded query, in reading order. Returns
-- p_limit rows from p_offset; callers ask for one extra row to learn whether
-- another page exists (no total: counting every match is what made Contains
-- slow before 046).
create or replace function search_lines_fuzzy(
  p_query    text,
  p_level    int,
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
  lvl   int := least(greatest(coalesce(p_level, 0), 1), 3);
  fold  int := least(lvl, 2);
  conds text;
begin
  if p_query is null or btrim(p_query) = '' then
    return;
  end if;

  select string_agg(format('fuzzy_fold(l.gurmukhi, %s) like %L', fold, '%' || b || '%'), ' or ')
    into conds
    from unnest(fuzzy_like_bodies(p_query, lvl)) b;

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
    order by l.corpus_rank, l.ang, l.line_no
    limit $6 offset $7
  $q$, conds)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

grant execute on function search_lines_fuzzy(text, int, text[], text[], bigint[], int, int, int, int) to anon;

-- ─── First letter ────────────────────────────────────────────────────────────
-- 045's search_first_letters with the letters and first_letters folded. Same
-- return shape (with total_count) so the client handles both alike. Letters
-- are one code point each; '_' (or '%') is "any letter", as in 045.
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
  letters := array_to_string(array(select left(l, 1) from unnest(p_letters) l), '');
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

-- ─── Dictionary ──────────────────────────────────────────────────────────────
-- Words whose folded spelling starts with the folded query: exact-prefix
-- spellings first, then by frequency.
create or replace function search_words_fuzzy(p_query text, p_level int, p_limit int default 20)
returns table(id bigint, gurmukhi text, frequency int, exact boolean)
language plpgsql stable
as $$
declare
  lvl   int := least(greatest(coalesce(p_level, 0), 1), 3);
  fold  int := least(lvl, 2);
  conds text;
begin
  if p_query is null or btrim(p_query) = '' then
    return;
  end if;

  select string_agg(format('fuzzy_fold(w.gurmukhi, %s) like %L', fold, b || '%'), ' or ')
    into conds
    from unnest(fuzzy_like_bodies(p_query, lvl)) b;

  return query execute format($q$
    select w.id::bigint, w.gurmukhi, w.frequency::int, w.gurmukhi like $1 as exact
    from words w
    where w.in_corpus and (%s)
    order by (w.gurmukhi like $1) desc, w.frequency desc, w.id
    limit $2
  $q$, conds)
  using regexp_replace(btrim(p_query), '([\\%_])', '\\\1', 'g') || '%', p_limit;
end;
$$;

grant execute on function search_words_fuzzy(text, int, int) to anon;

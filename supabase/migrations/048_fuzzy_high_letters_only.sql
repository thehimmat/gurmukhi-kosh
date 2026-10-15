-- 048: High fuzzy swaps a letter for a letter.
--
-- 047's High turned each position of the folded query into a LIKE '_', and
-- '_' matches any character: a space (ਵਾਹਗੁਰੂ found "ਪਾਵ ਗੁਰੂ", "ਦੇਵ ਗੁਰੂ" on
-- the live preview) or a vowel sign. "Wrong on one letter" means one letter
-- typed as another, so High is now a regex alternation in which only letter
-- positions (consonants and independent vowels) are wildcarded, and only by a
-- letter. The regex alone plans poorly with the trigram index (ਵਾਹਗੁਰੂ took
-- 2.2 s in the dry run), so 047's LIKE alternatives still find candidates
-- through the index and the regex only rechecks them (ਵਾਹਗੁਰੂ: see below).
--
-- First Letter is unchanged: lines.first_letters holds one letter per word,
-- so its '_' is already a letter.
--
-- Search-side mirror: gurmukhi-search lib/fuzzy.ts (fuzzyHighlightSpans).

-- The High pattern for a query, unanchored, or null when the folded query has
-- under three letters (High then behaves as Medium, as in 047).
create or replace function fuzzy_high_regex(p_query text) returns text
language sql immutable parallel safe
as $$
  with q as (
    select array(select c from regexp_split_to_table(fuzzy_fold(p_query, 2), '') with ordinality t(c, i) order by i) as chars
  ),
  letters as (
    select i from q, generate_subscripts(q.chars, 1) i where q.chars[i] ~ '^[ਅ-ਹੲੳ]$'
  )
  select case when (select count(*) from letters) < 3 then null else (
    select '(' || string_agg(alt, '|') || ')'
    from (
      select string_agg(
               case when j = l.i then '[ਅ-ਹੲੳ]'
                    else regexp_replace(q.chars[j], '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') end,
               '' order by j) as alt
      from letters l, q, generate_subscripts(q.chars, 1) j
      group by l.i
    ) a
  ) end
$$;

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
  re    text;
  conds text;
begin
  if p_query is null or btrim(p_query) = '' then
    return;
  end if;

  re := case when lvl = 3 then fuzzy_high_regex(p_query) end;
  if re is not null then
    select format('(%s) and fuzzy_fold(l.gurmukhi, 2) ~ %L',
                  string_agg(format('fuzzy_fold(l.gurmukhi, 2) like %L', '%' || b || '%'), ' or '), re)
      into conds
      from unnest(fuzzy_like_bodies(p_query, 3)) b;
  else
    conds := format('fuzzy_fold(l.gurmukhi, %s) like %L', fold,
      '%' || (fuzzy_like_bodies(p_query, least(lvl, 2)))[1] || '%');
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
    order by l.corpus_rank, l.ang, l.line_no
    limit $6 offset $7
  $q$, conds)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

create or replace function search_words_fuzzy(p_query text, p_level int, p_limit int default 20)
returns table(id bigint, gurmukhi text, frequency int, exact boolean)
language plpgsql stable
as $$
declare
  lvl   int := least(greatest(coalesce(p_level, 0), 1), 3);
  fold  int := least(lvl, 2);
  re    text;
  conds text;
begin
  if p_query is null or btrim(p_query) = '' then
    return;
  end if;

  re := case when lvl = 3 then fuzzy_high_regex(p_query) end;
  if re is not null then
    select format('(%s) and fuzzy_fold(w.gurmukhi, 2) ~ %L',
                  string_agg(format('fuzzy_fold(w.gurmukhi, 2) like %L', b || '%'), ' or '), '^' || re)
      into conds
      from unnest(fuzzy_like_bodies(p_query, 3)) b;
  else
    conds := format('fuzzy_fold(w.gurmukhi, %s) like %L', fold,
      (fuzzy_like_bodies(p_query, least(lvl, 2)))[1] || '%');
  end if;

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

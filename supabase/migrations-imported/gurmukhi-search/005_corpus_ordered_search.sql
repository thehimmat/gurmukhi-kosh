-- 005: results come back in reading order across corpora.
--
-- Every line-returning search sorted by (ang, line_no) alone, which interleaves
-- the corpora: Bhai Gurdas ang 1 and Dasam ang 1 sorted alongside SGGS ang 1, so
-- a Contains search led with Bhai Gurdas. Sorting now leads with the corpus —
-- SGGS, then Dasam Bani, then Bhai Gurdas Ji Vaaran, then anything later.
--
-- Depends on gurmukhi-kosh migration 031, which adds the generated column
-- lines.corpus_rank and the (corpus_rank, ang, line_no) index. The rank lives on
-- lines, not in a join, so search_lines_by_word_ids keeps the index-ordered plan
-- migration 003 relies on for its early stop.
--
-- Function signatures are unchanged; corpus_rank is a sort key only, never a
-- returned column.

-- ─── search_lines_regex ───────────────────────────────────────────────────────
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
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
      l.corpus_rank
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
    f.id, f.verse_id, f.shabad_id, f.ang, f.line_no,
    f.gurmukhi, f.translation_en, f.transliteration_en,
    f.raag_english, f.raag_gurmukhi, f.writer_english, f.writer_id, f.ang_start,
    count(*) over() as total_count
  from filtered f
  order by f.corpus_rank, f.ang, f.line_no
  limit p_limit
  offset p_offset;
$$;

-- ─── search_first_letters ─────────────────────────────────────────────────────
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
        l.corpus_rank
      from lines l
      left join shabads s on s.id = l.shabad_id
      where l.id = any(candidate_ids)
        and (p_raag   is null or s.raag_english   = p_raag)
        and (p_writer is null or s.writer_english = p_writer)
        and (p_ang_min is null or l.ang >= p_ang_min)
        and (p_ang_max is null or l.ang <= p_ang_max)
    )
    select
      f.id, f.verse_id, f.shabad_id, f.ang, f.line_no,
      f.gurmukhi, f.translation_en, f.transliteration_en,
      f.raag_english, f.raag_gurmukhi, f.writer_english, f.writer_id, f.ang_start,
      count(*) over() as total_count
    from filtered f
    order by f.corpus_rank, f.ang, f.line_no
    limit p_limit
    offset p_offset;
end;
$$;

-- ─── search_lines_by_word_ids ─────────────────────────────────────────────────
-- Keeps migration 003's inlined-literal plpgsql shape (a generic cached plan
-- does not early-stop); only the sort key gains corpus_rank, matched by the
-- (corpus_rank, ang, line_no) index.
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
  ang_start        int
)
language plpgsql stable
as $$
begin
  return query execute format($q$
    select
      l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
      l.gurmukhi, l.translation_en, l.transliteration_en,
      s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start
    from lines l
    left join shabads s on s.id = l.shabad_id
    where exists (
      select 1 from word_occurrences wo
      where wo.line_id = l.id and wo.word_id = any(%L::bigint[])
    )
      and ($1 is null or s.raag_english   = $1)
      and ($2 is null or s.writer_english = $2)
      and ($3 is null or l.ang >= $3)
      and ($4 is null or l.ang <= $4)
    order by l.corpus_rank, l.ang, l.line_no
    limit $5 offset $6
  $q$, p_word_ids)
  using p_raag, p_writer, p_ang_min, p_ang_max, p_limit, p_offset;
end;
$$;

grant execute on function search_lines_regex to anon;
grant execute on function search_first_letters to anon;
grant execute on function search_lines_by_word_ids to anon;

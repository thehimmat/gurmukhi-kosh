-- 044: lines.first_letters — make first-letter search fast enough for anon.
--
-- search_first_letters (gurmukhi-search 001/005/006) intersected per-position
-- candidate sets with `wo.line_id = any(<array of ~20k ids>)` over the 1.1M-row
-- word_occurrences. Any query of 2+ letters ran ~3.7s and hit the anon role's
-- 3s statement_timeout: the site's first-letter mode returned "canceling
-- statement due to statement timeout" for e.g. ਸਨਕਪ.
--
-- lines.first_letters holds the first code point of each word in position
-- order (ੴ ਸਤਿ ਨਾਮੁ ਕਰਤਾ … → ੴਸਨਕ…), so "word i starts with letter i" for
-- i = 0..n-1 is the prefix match `first_letters like 'ਸਨਕਪ%'`, served by a
-- text_pattern_ops btree. Positions are contiguous from 0 with no duplicates
-- (checked live: 171,880 lines), which is what makes the concatenation exact.
-- Verified against the old function before applying: identical line sets for
-- 12 queries, including the `_` wildcard and nukta letters.
--
-- The RPC keeps its signature (shared with deployed clients), so its body is
-- replaced in place. Letters of more than one code point can't be expressed
-- as a prefix of first_letters; those rare calls keep the old per-position path.

alter table lines add column if not exists first_letters text;

-- Rebuild from word_occurrences. Called by the ingest after it writes
-- occurrences (pipeline/sggs/ingest.ts), alongside the frequency refreshes.
-- Explicit WHEREs for safeupdate and its own timeout, as in 030.
create or replace function refresh_line_first_letters() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  update lines
  set first_letters = f.letters
  from (
    select wo.line_id, string_agg(left(w.gurmukhi, 1), '' order by wo.position) as letters
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

select refresh_line_first_letters();

create index if not exists lines_first_letters on lines (first_letters text_pattern_ops);

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
  candidate_ids bigint[];
  i             int;
  letter        text;
  prefix        text;
begin
  if p_letters is null or cardinality(p_letters) = 0 then
    return;
  end if;

  if exists (select 1 from unnest(p_letters) l where char_length(l) <> 1) then
    -- Multi-code-point letters: the pre-044 per-position intersection.
    letter := p_letters[1];
    select array_agg(distinct wo.line_id) into candidate_ids
      from word_occurrences wo join words w on w.id = wo.word_id
      where wo.position = 0 and w.gurmukhi like (letter || '%');
    if candidate_ids is null then return; end if;
    for i in 2 .. array_length(p_letters, 1) loop
      letter := p_letters[i];
      select array_agg(distinct wo.line_id) into candidate_ids
        from word_occurrences wo join words w on w.id = wo.word_id
        where wo.position = (i - 1) and wo.line_id = any(candidate_ids)
          and w.gurmukhi like (letter || '%');
      if candidate_ids is null then return; end if;
    end loop;
  end if;

  -- One LIKE character per letter, as before: '_' matches any letter and '%'
  -- (which used to match any word) does the same, so it becomes '_'.
  prefix := replace(replace(array_to_string(p_letters, ''), '\', '\\'), '%', '_');

  -- Dynamic SQL so the prefix is a literal and the planner uses the index
  -- (a generic plan with a parameterised LIKE can't).
  return query execute format($q$
    with filtered as (
      select
        l.id, l.verse_id, l.shabad_id, l.ang, l.line_no,
        l.gurmukhi, l.translation_en, l.transliteration_en,
        s.raag_english, s.raag_gurmukhi, s.writer_english, s.writer_id, s.ang_start,
        l.source_fk, l.corpus_rank
      from lines l
      left join shabads s on s.id = l.shabad_id
      where %s
        and ($1 is null or cardinality($1) = 0 or s.raag_english   = any($1))
        and ($2 is null or cardinality($2) = 0 or s.writer_english = any($2))
        and ($3 is null or cardinality($3) = 0 or l.source_fk      = any($3))
        and ($4 is null or l.ang >= $4)
        and ($5 is null or l.ang <= $5)
    )
    select
      f.id, f.verse_id, f.shabad_id, f.ang, f.line_no,
      f.gurmukhi, f.translation_en, f.transliteration_en,
      f.raag_english, f.raag_gurmukhi, f.writer_english, f.writer_id, f.ang_start,
      f.source_fk,
      count(*) over() as total_count
    from filtered f
    order by f.corpus_rank, f.ang, f.line_no
    limit $6 offset $7
  $q$,
    case when candidate_ids is null
      then format('l.first_letters like %L', prefix || '%')
      else 'l.id = any($8)'
    end)
  using p_raags, p_writers, p_sources, p_ang_min, p_ang_max, p_limit, p_offset, candidate_ids;
end;
$$;

grant execute on function search_first_letters(text[], text[], text[], bigint[], int, int, int, int) to anon;

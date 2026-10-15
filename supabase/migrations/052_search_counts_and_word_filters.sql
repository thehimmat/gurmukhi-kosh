-- 052: RPCs for gurmukhi-search's counts and Dictionary filters.
--
--   count_number_roles      — the number-role checkbox counts, scoped to the
--                             same facets as the results (gurmukhi-search#35).
--   count_lines_fuzzy       — the exact total for fuzzy Contains, so the
--                             header can say "20 of 1,234" (gurmukhi-search#33).
--   word_corpus_writer_stats — per-word frequency by scripture and writer,
--   search_words_filtered      and the Dictionary search over it (#204,
--                              gurmukhi-search#32).

-- ─── Number roles, filtered ──────────────────────────────────────────────────
-- 033's list_number_roles counted every scripture whatever the filters, so a
-- Dasam-only search showing 2 lines labelled its boxes with SGGS-wide counts.
-- A new name rather than new arguments on the old one: an overload that only
-- adds defaulted arguments makes list_number_roles(p_value) ambiguous, and
-- the old function stays for deployed clients until the shell switches.
-- Counts are distinct lines, matching what search_number_lines returns.
create or replace function count_number_roles(
  p_value    int,
  p_raags    text[]   default null,
  p_writers  text[]   default null,
  p_sources  bigint[] default null,
  p_ang_min  int      default null,
  p_ang_max  int      default null
)
returns table(role text, line_count bigint)
language sql stable
as $$
  with hits as (
    select n.role, n.line_id
    from number_occurrences n
    join lines l on l.id = n.line_id
    left join shabads s on s.id = l.shabad_id
    where n.value = p_value
      and (p_raags   is null or cardinality(p_raags)   = 0 or s.raag_english   = any(p_raags))
      and (p_writers is null or cardinality(p_writers) = 0 or s.writer_english = any(p_writers))
      and (p_sources is null or cardinality(p_sources) = 0 or l.source_fk      = any(p_sources))
      and (p_ang_min is null or l.ang >= p_ang_min)
      and (p_ang_max is null or l.ang <= p_ang_max)
  )
  select r.role, count(distinct h.line_id)::bigint as line_count
  from (values ('author', 1), ('ghar', 2), ('heading_other', 3), ('verse_marker', 4)) as r(role, ord)
  left join hits h on h.role = r.role
  group by r.role, r.ord
  order by r.ord;
$$;

grant execute on function count_number_roles(int, text[], text[], bigint[], int, int) to anon;

-- ─── Fuzzy Contains total ────────────────────────────────────────────────────
-- search_lines_fuzzy (048) pages with one extra row and no count. This is the
-- count on its own, with the same conditions, for page 0 only. Capped so a
-- near-everything High query stays inside the anon timeout; the shell shows
-- "10,000+" at the cap.
create or replace function count_lines_fuzzy(
  p_query    text,
  p_level    int,
  p_raags    text[]   default null,
  p_writers  text[]   default null,
  p_sources  bigint[] default null,
  p_ang_min  int      default null,
  p_ang_max  int      default null,
  p_cap      int      default 10000
)
returns bigint
language plpgsql stable
as $$
declare
  lvl   int := least(greatest(coalesce(p_level, 0), 1), 3);
  fold  int := least(lvl, 2);
  re    text;
  conds text;
  n     bigint;
begin
  if p_query is null or btrim(p_query) = '' then
    return 0;
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

grant execute on function count_lines_fuzzy(text, int, text[], text[], bigint[], int, int, int) to anon;

-- ─── Words by scripture and writer ───────────────────────────────────────────
-- 028's word_corpus_stats split, one level finer: occurrences per word per
-- (scripture, writer). Not 008's word_writer_stats matview, which has no
-- scripture and drops lines without a writer (all of Sarbloh), so it can't
-- answer "this scripture AND this writer". Every occurrence is already tagged through
-- occurrence -> line -> shabad -> writer; Sri Sarbloh Granth lines carry no
-- shabad, so its rows have a null writer (#205) and match a Scripture filter
-- but never a Writer one. Rebuilt, not maintained, like word_corpus_stats.
create table if not exists word_corpus_writer_stats (
  word_id        bigint not null references words(id) on delete cascade,
  source_fk      bigint not null references sources(id) on delete cascade,
  writer_english text,
  frequency      integer not null
);
create index if not exists idx_wcws_word on word_corpus_writer_stats (word_id);

alter table word_corpus_writer_stats enable row level security;
create policy "public read word_corpus_writer_stats" on word_corpus_writer_stats for select using (true);

set local check_function_bodies = off;

create or replace function refresh_word_corpus_writer_stats() returns void
language sql security definer
set search_path = public
set statement_timeout = '900s'
as $$
  delete from word_corpus_writer_stats where true;
  insert into word_corpus_writer_stats (word_id, source_fk, writer_english, frequency)
  select wo.word_id, l.source_fk, s.writer_english, count(*)
  from word_occurrences wo
  join lines l on l.id = wo.line_id
  left join shabads s on s.id = l.shabad_id
  group by wo.word_id, l.source_fk, s.writer_english;
$$;

revoke execute on function refresh_word_corpus_writer_stats() from public, anon, authenticated;
grant execute on function refresh_word_corpus_writer_stats() to service_role;

select refresh_word_corpus_writer_stats();

-- Dictionary search within a selection of scriptures and writers: words whose
-- spelling starts with the query (folded at p_level > 0, as
-- search_words_fuzzy), attested in the selection, most frequent within it
-- first. `frequency` is the count inside the selection, not the corpus total.
-- Null or empty filters mean "any".
create or replace function search_words_filtered(
  p_query    text,
  p_level    int      default 0,
  p_sources  bigint[] default null,
  p_writers  text[]   default null,
  p_limit    int      default 20
)
returns table(id bigint, gurmukhi text, frequency int, exact boolean)
language plpgsql stable
as $$
declare
  lvl   int := least(greatest(coalesce(p_level, 0), 0), 3);
  re    text;
  conds text;
  esc   text := regexp_replace(btrim(coalesce(p_query, '')), '([\\%_])', '\\\1', 'g');
begin
  if btrim(coalesce(p_query, '')) = '' then
    return;
  end if;

  if lvl = 0 then
    conds := format('w.gurmukhi like %L', esc || '%');
  else
    re := case when lvl = 3 then fuzzy_high_regex(p_query) end;
    if re is not null then
      select format('(%s) and fuzzy_fold(w.gurmukhi, 2) ~ %L',
                    string_agg(format('fuzzy_fold(w.gurmukhi, 2) like %L', b || '%'), ' or '), '^' || re)
        into conds
        from unnest(fuzzy_like_bodies(p_query, 3)) b;
    else
      conds := format('fuzzy_fold(w.gurmukhi, %s) like %L', least(lvl, 2),
        (fuzzy_like_bodies(p_query, least(lvl, 2)))[1] || '%');
    end if;
  end if;

  return query execute format($q$
    select w.id::bigint, w.gurmukhi, f.n::int, w.gurmukhi like $1 as exact
    from words w
    cross join lateral (
      select sum(x.frequency) as n
      from word_corpus_writer_stats x
      where x.word_id = w.id
        and ($2 is null or cardinality($2) = 0 or x.source_fk      = any($2))
        and ($3 is null or cardinality($3) = 0 or x.writer_english = any($3))
    ) f
    where w.in_corpus and (%s) and f.n > 0
    order by (w.gurmukhi like $1) desc, f.n desc, w.id
    limit $4
  $q$, conds)
  using esc || '%', p_sources, p_writers, p_limit;
end;
$$;

grant execute on function search_words_filtered(text, int, bigint[], text[], int) to anon;

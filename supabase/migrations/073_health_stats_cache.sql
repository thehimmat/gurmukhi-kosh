-- 073: health_stats reads its slow totals from a cache. After 072 the function still took ~17 s on
-- production (2026-10-23, explain analyze), against its own 20 s limit: the definitions scans
-- (definitions_per_source, words_without_definition, words_with_definition_but_no_pos), the
-- line_translations scans (lines_per_source, empty_bodies, dup_line_source, lines_with_no_commentary)
-- and the provenance and review_status breakdowns. Under load it went past 20 s and /api/health
-- returned 500.
--
-- Everything that only an ingest changes is now computed by refresh_health_stats() into the one
-- row of health_stats_cache. health_stats() reads that row and counts live only what a reader can
-- change (open flags) and the two source registries, ~3 ms on production. stats_computed_at and
-- stats_age_seconds say how old the cached totals are.
--
-- Refresh after an ingest: the SGGS ingest and the Gur Sobha loader call refresh_health_stats, and
-- refresh_computed_stats calls it too. By hand: select refresh_health_stats();
-- Corpus totals still cover public lines only (070), counted as 072 does.

create table if not exists health_stats_cache (
  id          boolean primary key default true check (id),
  stats       jsonb not null,
  computed_at timestamptz not null default now()
);

-- No policies: only the definer functions below read or write it.
alter table health_stats_cache enable row level security;
revoke all on health_stats_cache from public, anon, authenticated;

create or replace function refresh_health_stats()
returns void
language sql
security definer
set search_path = public
set statement_timeout = '900s'
as $$
  insert into health_stats_cache (id, stats, computed_at)
  select true, jsonb_build_object(
    'total_words', (select count(*) from words),
    'total_lines', (select count(*) from lines) - (select count(*) from lines where not is_public),
    'total_angs', (select count(distinct ang) from lines) - (
      select count(*) from (select distinct ang from lines where not is_public) p
       where not exists (select 1 from lines l where l.ang = p.ang and l.is_public)
    ),
    'total_occurrences', (select count(*) from word_occurrences) - (
      select count(*) from lines l join word_occurrences wo on wo.line_id = l.id where not l.is_public
    ),

    'lines_per_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select a.source_code, a.rows - coalesce(p.rows, 0) as rows, a.lines - coalesce(p.lines, 0) as lines
        from (
          select source_code, count(*) as rows, count(distinct line_id) as lines
          from line_translations group by source_code
        ) a
        left join (
          select lt.source_code, count(*) as rows, count(distinct lt.line_id) as lines
          from lines l join line_translations lt on lt.line_id = l.id
          where not l.is_public
          group by lt.source_code
        ) p using (source_code)
        where a.rows > coalesce(p.rows, 0)
        order by rows desc
      ) t
    ),
    'lines_with_no_commentary', (
      (select count(*) from lines l
        where not exists (select 1 from line_translations lt where lt.line_id = l.id))
      - (select count(*) from lines l
        where not l.is_public
          and not exists (select 1 from line_translations lt where lt.line_id = l.id))
    ),
    'empty_bodies', (select count(*) from line_translations where btrim(body_unicode) = ''),

    'definitions_total', (select count(*) from definitions),
    'words_with_definition', (select count(distinct word_id) from definitions),
    'words_without_definition', (
      select count(*) from words w
      where not exists (select 1 from definitions d where d.word_id = w.id)
    ),
    'definitions_per_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select ds.code, ds.name, count(d.id) as rows, count(distinct d.word_id) as words
        from dict_sources ds left join definitions d on d.dict_source_id = ds.id
        group by ds.code, ds.name order by rows desc
      ) t
    ),
    'words_with_definition_but_no_pos', (
      select count(distinct d.word_id) from definitions d
      where not exists (select 1 from word_grammar g where g.word_id = d.word_id)
    ),

    'word_grammar_total', (select count(*) from word_grammar),
    'words_with_any_grammar', (select count(distinct word_id) from word_grammar),
    'sourced_vs_rule', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select provenance, count(*) as rows, count(distinct word_id) as words
        from word_grammar group by provenance order by rows desc
      ) t
    ),
    'sourced_only_words', (
      select count(distinct word_id) from word_grammar g1
      where g1.provenance = 'imported'
        and not exists (
          select 1 from word_grammar g2
          where g2.word_id = g1.word_id and g2.provenance <> 'imported'
        )
    ),
    'grammar_unreviewed', (select count(*) from word_grammar where review_status = 'unreviewed'),

    'etymology_total', (select count(*) from etymology),
    'words_with_etymology', (select count(distinct word_id) from etymology),

    'dup_line_source', (
      select count(*) from (
        select 1 from line_translations group by line_id, source_code having count(*) > 1
      ) t
    ),
    'orphan_grammar', (
      select count(*) from word_grammar g where not exists (select 1 from words w where w.id = g.word_id)
    ),
    'orphan_definitions', (
      select count(*) from definitions d where not exists (select 1 from words w where w.id = d.word_id)
    ),
    'provenance_breakdown', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select 'definitions' as table_name, provenance, count(*) as rows from definitions group by provenance
        union all
        select 'word_grammar', provenance, count(*) from word_grammar group by provenance
        order by table_name, rows desc
      ) t
    ),
    'review_status_breakdown', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select 'definitions' as table_name, review_status, count(*) as rows from definitions group by review_status
        union all
        select 'word_grammar', review_status, count(*) from word_grammar group by review_status
        order by table_name, rows desc
      ) t
    )
  ), now()
  on conflict (id) do update set stats = excluded.stats, computed_at = excluded.computed_at;
$$;

revoke execute on function refresh_health_stats() from public, anon, authenticated;
grant execute on function refresh_health_stats() to service_role;

create or replace function health_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.stats, '{}'::jsonb) || jsonb_build_object(
    'stats_computed_at', c.computed_at,
    'stats_age_seconds', floor(extract(epoch from now() - c.computed_at))::int,

    'dict_sources_registered', (select count(*) from dict_sources),
    'translation_sources_registered', (select count(*) from translation_sources),

    'open_flags_total', (select count(*) from flags where status = 'open'),
    'open_flags_by_target', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select coalesce(target_table, 'word-level') as target, count(*) as rows
        from flags where status = 'open'
        group by coalesce(target_table, 'word-level') order by rows desc
      ) t
    ),
    'open_flags_by_type', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select flag_type, count(*) as rows from flags where status = 'open'
        group by flag_type order by rows desc
      ) t
    )
  )
  from (select) one left join health_stats_cache c on true;
$$;

grant execute on function health_stats() to anon, authenticated;

-- The matview refresh after an ingest refreshes the health totals too.
create or replace function refresh_computed_stats()
returns void
language plpgsql
set statement_timeout = '900s'
as $$
begin
  refresh materialized view concurrently word_source_stats;
  refresh materialized view concurrently word_writer_stats;
  refresh materialized view concurrently word_stem_groups;
  perform refresh_health_stats();
end;
$$;

select refresh_health_stats();

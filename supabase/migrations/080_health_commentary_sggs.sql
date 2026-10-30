-- 080: the /health commentary metrics count Guru Granth Sahib lines only.
--
-- The commentaries (line_translations) cover SGGS alone. lines_with_no_commentary counted every
-- public line, so each Dasam, Bhai Gurdas, Sarbloh … line read as "zero commentary" (112,229 on
-- 2026-10-29, against the ~55 non-content SGGS lines the metric is there to watch), and
-- lib/health.ts divided commentary coverage by all lines. Now lines_with_no_commentary is SGGS lines
-- with no commentary, and the new sggs_lines is the coverage denominator. SGGS is public, so neither
-- needs 070's private-line subtraction. The rest of refresh_health_stats is 075's, unchanged.

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
    'sggs_lines', (select count(*) from lines where source_fk = (select id from sources where code = 'sggs_banidb_v2')),
    'lines_with_no_commentary', (
      select count(*) from lines l
       where l.source_fk = (select id from sources where code = 'sggs_banidb_v2')
         and not exists (select 1 from line_translations lt where lt.line_id = l.id)
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

select refresh_health_stats();

-- 013_health_stats.sql
-- Aggregate stats for the /health data-quality dashboard. PostgREST can't express
-- distinct-counts or group-by aggregates directly, so this single RPC returns every
-- pure-SQL metric as one jsonb blob (one round trip). The one metric that needs TS
-- logic (grammar_conflicts, via buildGrammarView) is computed separately in
-- lib/health.ts from a plain word_grammar fetch. Idempotent (create or replace).

-- Runs ~15 aggregate subqueries over tables up to 280k rows; on the project's
-- small compute tier that can exceed the anon role's default 3s statement_timeout,
-- so the function overrides it for its own execution only.
create or replace function health_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '20s'
as $$
  select jsonb_build_object(
    'total_words', (select count(*) from words),
    'total_lines', (select count(*) from lines),
    'total_angs', (select count(distinct ang) from lines),
    'total_occurrences', (select count(*) from word_occurrences),
    'dict_sources_registered', (select count(*) from dict_sources),
    'translation_sources_registered', (select count(*) from translation_sources),

    'lines_per_source', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select source_code, count(*) as rows, count(distinct line_id) as lines
        from line_translations group by source_code order by rows desc
      ) t
    ),
    'lines_with_no_commentary', (
      select count(*) from lines l
      where not exists (select 1 from line_translations lt where lt.line_id = l.id)
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
  );
$$;

grant execute on function health_stats() to anon, authenticated;

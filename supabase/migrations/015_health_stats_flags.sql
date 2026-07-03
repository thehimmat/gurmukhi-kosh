-- 015_health_stats_flags.sql
-- Extends health_stats() (013) with open-flag counts (P4 curation queue). flags
-- has no public SELECT policy (insert-only RLS, migration 014), so these counts
-- can only come from this security-definer function, same as every other
-- aggregate here — it exposes counts/breakdowns only, never flag content.

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
    ),

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
  );
$$;

grant execute on function health_stats() to anon, authenticated;

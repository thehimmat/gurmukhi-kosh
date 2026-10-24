-- Rebuilds everything derived from the corpus tables, after a REST copy (or to check a restore):
-- the same refresh functions the ingest pipelines call through RPC. A dump restore already carries
-- these tables and the materialized views' contents, so there this is optional.
\set ON_ERROR_STOP on
\timing on
set statement_timeout = 0;
select refresh_word_frequencies();
select refresh_word_corpus_stats();
select refresh_word_corpus_writer_stats();
select refresh_line_first_letters();
-- Materialized views word_source_stats / word_writer_stats / word_stem_groups, then health_stats_cache.
select refresh_computed_stats();
analyze;
notify pgrst, 'reload schema';

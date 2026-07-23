-- 019_scoped_delete_indexes.sql
-- The per-source idempotent/takedown deletes filter definitions by
-- dict_source_id and word_grammar by source_code. Neither column had a usable
-- leading index (definitions only had a composite unique with dict_source_id in
-- second position), so the deletes full-scanned these now-large tables and hit
-- Supabase's statement timeout during the Shackle re-ingest. Index them.
create index if not exists definitions_dict_source on definitions (dict_source_id);
create index if not exists word_grammar_source_code on word_grammar (source_code) where source_code is not null;

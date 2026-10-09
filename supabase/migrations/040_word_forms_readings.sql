-- 040_word_forms_readings.sql
-- Let one membership carry several readings, and one word belong to a lexeme
-- under several sources (#30 decision 4), ahead of the first writer, the
-- Shackle form links (#18).
--
-- 002 made (lexeme_id, word_id) unique: one row per form per lexeme. 023 added
-- the intended key, (lexeme_id, word_id, source, reading_number), but left the
-- old index in place, so ਜੀਅ could not be both Shackle's singular oblique and
-- plural direct of ਜੀਉ. word_forms holds no live rows (037), so dropping it
-- loses nothing.
-- Idempotent.

drop index if exists word_forms_lexeme_word;

-- 002's word_forms_word_id duplicates 023's word_forms_word_id_idx.
drop index if exists word_forms_word_id;

-- Scoped deletes (pipeline/shared/wipe-form-links.ts) filter on source_code,
-- and hubs are looked up by their root word.
create index if not exists word_forms_source_code_idx on word_forms (source_code);
create index if not exists lexeme_citations_source_code_idx on lexeme_citations (source_code);
create index if not exists lexemes_root_word_id_idx on lexemes (root_word_id);

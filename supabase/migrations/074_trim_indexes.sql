-- 074: drop indexes another index already serves, or that no query can use.
--
-- The database is ~926 MB against Supabase Free's 500 MB, and indexes are over half of it. Each
-- drop below was checked on production on 2026-10-23: EXPLAIN ANALYZE before, then EXPLAIN with the
-- index hidden (hypopg, in a rolled-back transaction) after. Every query that used it still gets an
-- index scan from the index named. No function body or constraint names any of them.
--
--   lines_first_letters_cover (23 MB): superseded by 070's lines_first_letters_cover_public, which
--     adds is_public. The planner already picks _public for anon and service_role alike.
--   word_occurrences_word_id (12 MB): word_id leads word_occurrences_unique (word_id, line_id,
--     position). Word-page lookups move to it at ~10% more estimated cost.
--   line_translations_line_id (7 MB): line_id leads line_translations_line_id_source_code_key.
--     line-context and the FK lookups move to it at ~6% more estimated cost.
--   words_phonetic_ipa_trgm (6 MB, 0 scans): search_words_phonetic filters on
--     greatest(similarity(), word_similarity()) > 0.25, which no index can serve; it is a seq scan
--     with or without this. Only voice-search's first version (`%`) used it.
--   word_occurrences_position_word (18 MB): served search_first_letters' per-position branch,
--     which 051 removed. No function or app query filters on position now.
--
-- Kept: words_gurmukhi_fold1 (Low Dictionary goes to a seq scan without it) and
-- words_gurmukhi_fold2 (Medium Dictionary falls back to the trigram index at ~2x estimated cost).
--
-- DROP INDEX locks the table briefly; the Supabase MCP holds DROP for a confirmation, so this runs
-- from the dashboard SQL editor (APPLIED.md).

drop index if exists lines_first_letters_cover;
drop index if exists word_occurrences_word_id;
drop index if exists line_translations_line_id;
drop index if exists words_phonetic_ipa_trgm;
drop index if exists word_occurrences_position_word;

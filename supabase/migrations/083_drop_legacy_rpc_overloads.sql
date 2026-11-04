-- gurmukhi-search#15: search's 007 re-added the pre-006 single-value signatures (p_raag, p_writer)
-- of these three as thin wrappers, because applying 006 broke the deployed shell mid-rollout. Every
-- client has sent the array parameters (p_raags, p_writers, p_sources) since, and nothing in
-- gurmukhi-kosh, gurmukhi-search or gurmukhi-voice-search calls the old shapes.
drop function if exists public.search_lines_regex(text, text, text, int, int, int, int);
drop function if exists public.search_first_letters(text[], text, text, int, int, int, int);
drop function if exists public.search_lines_by_word_ids(bigint[], text, text, int, int, int, int);

-- The VM runs plain Postgres, without Supabase's event trigger that tells PostgREST about DDL.
notify pgrst, 'reload schema';

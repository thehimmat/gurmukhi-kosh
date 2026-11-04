-- #194: refresh_word_frequencies() and refresh_word_corpus_stats() are SECURITY DEFINER full-table
-- rebuilds with statement_timeout = 900s (030). Executable by anon, anyone holding the public key
-- every page ships could call them through /rest/v1/rpc and load the database for up to 15 minutes
-- a call. Only the ingest (service_role) needs them; same form as 080's refresh_health_stats.
-- health_stats() stays public: /api/health reads it, and since 075 it reads only cached totals.

revoke execute on function refresh_word_frequencies() from public, anon, authenticated;
grant execute on function refresh_word_frequencies() to service_role;

revoke execute on function refresh_word_corpus_stats() from public, anon, authenticated;
grant execute on function refresh_word_corpus_stats() to service_role;

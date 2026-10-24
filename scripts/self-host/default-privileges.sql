-- Supabase's default grants on the public schema, for the migration-replay path only (setup.sh
-- replay runs it first). RLS, not grants, is what limits anon. Never run it before a pg_restore:
-- see bootstrap.sql.
\set ON_ERROR_STOP on
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

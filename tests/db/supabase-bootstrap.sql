-- What a Supabase project has before any migration runs, as far as the migrations rely on it:
-- the API roles, and Supabase's default grants on the public schema (RLS, not grants, is what
-- limits anon). Run once, before supabase/migrations/001_schema.sql.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

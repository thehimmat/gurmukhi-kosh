-- What a Supabase project has before any migration runs, rebuilt for plain Postgres 17 + PostgREST.
-- Run once as the database owner (superuser), in the app database, before restoring a dump or
-- replaying supabase/migrations. Idempotent.
--
-- psql -v authenticator_password="'...'" -f scripts/self-host/bootstrap.sql
--
-- Mirrors production as read from pg_roles / pg_db_role_setting (2026-10-24):
--   anon           nologin, statement_timeout=3s
--   authenticated  nologin, statement_timeout=8s
--   service_role   nologin, bypassrls, no timeout
--   authenticator  login, noinherit, statement_timeout=8s, lock_timeout=8s; member of the three
-- Stubbed, not reproduced (see docs/self-hosting.md):
--   session_preload_libraries = supautils, safeupdate on authenticator. supautils is Supabase's own
--   superuser guard; safeupdate (pg-safeupdate) rejects UPDATE/DELETE without WHERE. Neither ships
--   with stock Postgres. The migrations already satisfy safeupdate (030), so dropping it only loses
--   a guard rail.
--   The `extensions` schema holding pgcrypto, uuid-ossp, pg_stat_statements: nothing in the app or
--   migrations calls them, so only the schema is created.

\set ON_ERROR_STOP on

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

alter role authenticator with password :authenticator_password;
grant anon, authenticated, service_role to authenticator;

alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
-- Production has pg_trgm in public (001_schema.sql creates it); create it up front so a dump restore
-- (which restores into public) finds it too.
create extension if not exists pg_trgm with schema public;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase's default privileges (grant all on new tables/sequences/functions to the API roles) are
-- NOT set here: default-privileges.sql sets them, for the migration-replay path only. Before a
-- pg_restore they would be wrong: each restored object would pick them up on creation, and the
-- dump's ACLs (written relative to Postgres's built-in defaults) never revoke them, so grants a
-- migration took away (022: anon may not execute bulk_update_phonetic_ipa) would come back. The
-- dump carries production's own default privileges and per-object grants instead.

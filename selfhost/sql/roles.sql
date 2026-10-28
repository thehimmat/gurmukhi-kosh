-- The roles a Supabase project has, as far as this database relies on them. Run once on an empty
-- server, before restoring a dump or replaying migrations: the dump's grants and RLS policies name
-- these roles. Idempotent. Needs psql's -v auth_pw=… for the authenticator's password.
--
-- PostgREST logs in as `authenticator` and switches to the role in the request's JWT: `anon` for the
-- anon key, `service_role` for the service key. The timeouts are Supabase's defaults; the apps'
-- search RPCs are written to finish inside them (see migration 030 and the imported 003).

set client_min_messages = warning; -- re-runs are routine; "already exists" notices are noise

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  -- The annotation site's role (gurmukhi-akhar-ocr): reaches only the akhar schema. It comes
  -- through the API with AKHAR_KEY; it has no password, so it can't log in to Postgres directly.
  if not exists (select from pg_roles where rolname = 'akhar_writer') then
    create role akhar_writer login noinherit;
  end if;
end
$$;

alter role authenticator with password :'auth_pw';
grant anon, authenticated, service_role, akhar_writer to authenticator;

alter role anon set statement_timeout = '3s';
alter role authenticated set statement_timeout = '8s';
alter role authenticator set statement_timeout = '8s';
alter role authenticator set lock_timeout = '8s';

create extension if not exists pg_trgm with schema public;

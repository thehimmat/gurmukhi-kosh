# Self-hosted API (bridge off Supabase Free)

The production database outgrew Supabase Free's 500 MB. Until the project can pay for Supabase Pro,
it runs on a free Oracle Cloud VM as **Postgres 17 + PostgREST + Caddy**. That's the same REST server
Supabase runs, behind a gateway that serves `/rest/v1` and checks the `apikey` header like
Supabase's does. To the apps (this repo, gurmukhi-search, gurmukhi-voice-search) only the URL and
keys change. RLS, the search RPCs and `pg_trgm` work as they are.

Not included, because none of the apps use them: Supabase Auth, Storage, Realtime, Edge Functions
and the dashboard.

## Files

| File | What it does |
|---|---|
| `docker-compose.yml` | The three services. Postgres listens on localhost only. |
| `Caddyfile` | Gateway: `/rest/v1/*` → PostgREST for requests with a known apikey; TLS on the server |
| `sql/roles.sql` | Supabase's API roles (`anon`, `authenticated`, `service_role`, `authenticator`) and their timeouts |
| `scripts/mint-keys.mjs` | A JWT secret plus anon and service keys signed with it |
| `scripts/restore.sh` | Restores an encrypted weekly backup, grants included |
| `scripts/replay-migrations.sh` | Rehearsal only: builds the schema from migrations instead of a dump |

`tests/selfhost/gateway.test.ts` checks the stack behaves like Supabase. It runs only when
`SELFHOST_URL`, `SELFHOST_ANON_KEY` and `SELFHOST_SERVICE_KEY` are set, and never against the
shared project, because it writes fixture rows.

## Run it locally

```sh
{ echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"; echo "AUTHENTICATOR_PASSWORD=$(openssl rand -hex 24)"
  node selfhost/scripts/mint-keys.mjs; } > selfhost/.env && chmod 600 selfhost/.env
docker compose -f selfhost/docker-compose.yml up -d
sh selfhost/scripts/replay-migrations.sh                        # or restore.sh with a backup
set -a; . selfhost/.env; set +a
SELFHOST_URL=http://localhost:8000 SELFHOST_ANON_KEY=$ANON_KEY SELFHOST_SERVICE_KEY=$SERVICE_KEY \
  npx vitest run tests/selfhost/
```

`selfhost/.env` is gitignored. It holds every secret the stack has.

## Rehearsal result (2026-10-26)

`restore.sh` restored the 2026-10-25 backup in under a minute with no errors. Row counts in every
table checked match production exactly, and so do the 38 RLS policies and 76 functions. The restored
database is 664 MB. The full test suite, pointed at the stack (`NEXT_PUBLIC_SUPABASE_URL`, anon and
service keys from `selfhost/.env`), passed 890 of 901 tests. The 9 failures were 8 tests of the
deployed Vercel site, which the rehearsal machine couldn't reach, and 1 that expected a
`supabase.co` URL (fixed).

**`akhar_writer`** is a login role that writes `akhar.annotations` over a direct Postgres
connection, not through the API. `sql/roles.sql` creates it with no password, so whatever tool uses
it can't connect until it gets a password and a way in (an SSH tunnel; Postgres isn't exposed).

Two differences from Supabase, both harmless: no `safeupdate`, so an UPDATE/DELETE without a WHERE
is allowed here but not on Supabase (write migrations for the stricter one), and no `supabase_admin`
role.

## Later: moving to Supabase Pro or a VPS

Run the backup workflow, restore its dump into the new host (supabase/BACKUP.md), and swap the URL
and keys in the three Vercel projects again. Nothing in the apps changes.

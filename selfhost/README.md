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

## Later: moving to Supabase Pro or a VPS

Run the backup workflow, restore its dump into the new host (supabase/BACKUP.md), and swap the URL
and keys in the three Vercel projects again. Nothing in the apps changes.

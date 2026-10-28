# Self-hosted API (bridge off Supabase Free)

The production database outgrew Supabase Free's 500 MB. Until the project can pay for Supabase Pro,
it runs on a free Oracle Cloud VM as **Postgres 17 + PostgREST + Caddy**. That's the same REST server
Supabase runs, behind a gateway that serves `/rest/v1` and checks the `apikey` header like
Supabase's does. To the apps (this repo and gurmukhi-search on Vercel, gurmukhi-voice-search
locally) only the URL and keys change. RLS, the search RPCs and `pg_trgm` work as they are.

Not included, because none of the apps use them: Supabase Auth, Storage, Realtime, Edge Functions
and the dashboard.

- **Server:** Oracle VM `kosh-db` (Ashburn, Ampere A1, 2 OCPU / 12 GB, Ubuntu 24.04), `141.148.39.45`
- **API:** `https://141-148-39-45.sslip.io` (sslip.io resolves the name to the IP; swap in a real
  domain by re-running setup with it, then updating the apps' URL)
- **Code and secrets on the server:** `/opt/kosh` (this branch); secrets in
  `/opt/kosh/selfhost/.env` and `backup.pass`, both gitignored and mode 600

## Files

| File | What it does |
|---|---|
| `docker-compose.yml` | The three services. Postgres listens on localhost only. |
| `docker-compose.server.yml` | On the server: Caddy on 80/443 with its own TLS certificate |
| `Caddyfile` | `/rest/v1/*` → PostgREST for requests with a known apikey; `/health`; the latest backup behind a token |
| `sql/roles.sql` | Supabase's API roles and timeouts, plus `akhar_writer` |
| `scripts/server-setup.sh` | One-time (re-runnable) VM setup: updates, firewall, Docker, swap, secrets, stack, backup timer |
| `scripts/mint-keys.mjs` | A JWT secret plus anon and service keys signed with it |
| `scripts/restore.sh` | Restore from a live Supabase dump (`--supabase`) or an encrypted backup (`--gpg`) |
| `scripts/backup.sh` | Nightly encrypted dump, 14 days kept (`kosh-backup.timer`, 03:30 UTC) |
| `scripts/compare.sh` | Row counts of every table, here vs another database |
| `scripts/check.sh` | The test suite, run on the server against its own stack |
| `scripts/replay-migrations.sh` | Rehearsal only: builds the schema from migrations instead of a dump |

`tests/selfhost/gateway.test.ts` checks the stack behaves like Supabase. It runs only when
`SELFHOST_URL`, `SELFHOST_ANON_KEY` and `SELFHOST_SERVICE_KEY` are set, and never against
production data you care about, because it writes (and removes) fixture rows.

## Run it locally

```sh
{ echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"; echo "AUTHENTICATOR_PASSWORD=$(openssl rand -hex 24)"
  echo "BACKUP_TOKEN=$(openssl rand -hex 24)"; node selfhost/scripts/mint-keys.mjs; } > selfhost/.env
chmod 600 selfhost/.env
(cd selfhost && docker compose up -d)
sh selfhost/scripts/replay-migrations.sh                        # or restore.sh
set -a; . selfhost/.env; set +a
SELFHOST_URL=http://localhost:8000 SELFHOST_ANON_KEY=$ANON_KEY SELFHOST_SERVICE_KEY=$SERVICE_KEY \
  npx vitest run tests/selfhost/
```

Run Compose from inside `selfhost/`: it resolves `COMPOSE_FILE` (set in the server's `.env`) against
the working directory.

## Server setup

From a machine that can SSH to the VM (one command per step; each prints a short result):

```sh
# 1. Set up, or update to the latest code on this branch (safe to re-run; keeps existing secrets)
ssh ubuntu@141.148.39.45 'curl -fsSL https://raw.githubusercontent.com/thehimmat/gurmukhi-kosh/feat/selfhost-postgrest/selfhost/scripts/server-setup.sh | bash -s -- 141-148-39-45.sslip.io'

# 2. Restore a fresh dump from Supabase into an empty database (prompts for the session-pooler URL)
ssh -t ubuntu@141.148.39.45 'cd /opt/kosh && read -rsp "Supabase session pooler URL: " SUPABASE_DB_URL && echo && SUPABASE_DB_URL=$SUPABASE_DB_URL sh selfhost/scripts/restore.sh --supabase'

# 3. Run the test suite on the server against its own stack
ssh ubuntu@141.148.39.45 'cd /opt/kosh && sh selfhost/scripts/check.sh'
```

## Backups

Nightly at 03:30 UTC the server writes an encrypted dump to `selfhost/backups/` (14 kept) and serves
the latest at `https://<api>/backups/<BACKUP_TOKEN>/latest.dump.gpg`. The weekly workflow
(`.github/workflows/backup.yml`) copies it offsite as a 90-day artifact, after checking it decrypts,
and fails if it's more than two days old. It's encrypted with the same passphrase as before
(`BACKUP_PASSPHRASE`). To turn it on:

```sh
# Store the passphrase on the server (prompted, never echoed), take a first backup, print the URL
ssh -t ubuntu@141.148.39.45 'cd /opt/kosh/selfhost && read -rsp "Backup passphrase: " p && echo && (umask 077 && printf %s "$p" > backup.pass) && sudo systemctl start kosh-backup && journalctl -u kosh-backup -n 1 -o cat && echo "KOSH_BACKUP_URL=https://$(grep ^SITE_ADDRESS= .env | cut -d= -f2)/backups/$(grep ^BACKUP_TOKEN= .env | cut -d= -f2)/latest.dump.gpg"'
```

Then add that URL as the repository secret `KOSH_BACKUP_URL`, and run the workflow once by hand.
Restore one with `restore.sh --gpg` (on an empty database).

## Uptime

`.github/workflows/uptime.yml` checks `/health` every 30 minutes once the repository variable
`KOSH_API_URL` is set (`https://141-148-39-45.sslip.io`). `/health` is 200 only when PostgREST is up
and reaches the database. A failed run is GitHub's email that the API is down.

## Cutover from Supabase

Writes are rare (no flags since September, curator writes only during ingests), so there's no
write freeze: check nothing changed since the restore, switch, check again.

1. **Nothing changed since the restore:** `compare.sh` against Supabase reports every table the
   same. If not, restore again (empty the database first: `cd /opt/kosh/selfhost && docker compose
   down && docker volume rm selfhost_pgdata && docker compose up -d`).
   ```sh
   ssh -t ubuntu@141.148.39.45 'cd /opt/kosh && read -rsp "Supabase session pooler URL: " OTHER_DB_URL && echo && OTHER_DB_URL=$OTHER_DB_URL sh selfhost/scripts/compare.sh'
   ```
2. **Vercel**, projects `gurmukhi-kosh` and `gurmukhi-search` (Settings → Environment Variables,
   Production and Preview), then redeploy each (Deployments → ⋯ → Redeploy; `NEXT_PUBLIC_` values
   are baked in at build time):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://141-148-39-45.sslip.io`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the server's `ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (gurmukhi-kosh only) = the server's `SERVICE_KEY`, from
     `ssh ubuntu@141.148.39.45 'grep ^SERVICE_KEY= /opt/kosh/selfhost/.env | cut -d= -f2'`
3. **Check:** the sites work, Supabase's API logs go quiet, and `compare.sh` still matches.
4. **Local `.env.local`** files (pipelines, gurmukhi-voice-search): the same three values.
5. **akhar annotation tool:** connects as `akhar_writer` through an SSH tunnel
   (`ssh -N -L 6543:localhost:5432 ubuntu@141.148.39.45`, then `localhost:6543`) once the role has
   a password (`docker compose exec db psql -U postgres -c "alter role akhar_writer password '…'"`).
   Don't use it against Supabase after the cutover: those writes would be stranded there.

**Rollback:** put the Supabase values back in Vercel (Supabase dashboard → Settings → API) and
redeploy. Supabase is left untouched, so it's exactly as it was at cutover; anything written to the
server since would need copying back (`compare.sh` lists which tables).

## Rehearsal results

- **2026-10-26, sandbox:** the 2026-10-25 backup restored with no errors; row counts, 38 RLS
  policies and 76 functions match production; 664 MB.
- **2026-10-27, the VM:** a live dump from Supabase restored with no errors; HTTPS, firewall and
  reboot recovery verified; the full suite passed (894 tests, 0 failures) against the server.
- **2026-10-28, sandbox:** backup → download through the gateway → restore round trip matched every
  row count.

**`akhar_writer`** is a login role that writes `akhar.annotations` over a direct Postgres
connection, not through the API. `sql/roles.sql` creates it with no password.

Two differences from Supabase, both harmless: no `safeupdate`, so an UPDATE/DELETE without a WHERE
is allowed here but not on Supabase (write migrations for the stricter one), and no `supabase_admin`
role.

## Later: moving to Supabase Pro or a VPS

Take a backup (or `pg_dump` the server over an SSH tunnel), restore it into the new host
(supabase/BACKUP.md), and swap the URL and keys in the apps again. Nothing in the apps changes.

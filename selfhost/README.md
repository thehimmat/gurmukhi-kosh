# Self-hosted API (bridge off Supabase Free)

The production database outgrew Supabase Free's 500 MB. Until the project can pay for Supabase Pro,
it runs on a free Oracle Cloud VM as **Postgres 17 + PostgREST**. That's the same REST server
Supabase runs, behind a gateway (Caddy) that serves `/rest/v1` and checks the `apikey` header like
Supabase's does. The gateway, the two apps and everything else on the VM's ports 80 and 443 are
[thehimmat/atthebunga-server](https://github.com/thehimmat/atthebunga-server)'s (`/opt/infra`); this
folder is the database half, and PostgREST shares exactly one network with that gateway (`api-edge`). To the apps (this repo and gurmukhi-search, now on this VM too, and
gurmukhi-voice-search locally) only the URL and keys change. RLS, the search RPCs and `pg_trgm` work as they are.

Not included, because none of the apps use them: Supabase Auth, Storage, Realtime, Edge Functions
and the dashboard.

- **Server:** Oracle VM `kosh-db` (Ashburn, Ampere A1, 4 OCPU / 24 GB, Ubuntu 24.04), `141.148.39.45`
- **API:** `https://141-148-39-45.sslip.io` (sslip.io resolves the name to the IP; swap in a real
  domain by re-running setup with it, then updating the apps' URL)
- **Code and secrets on the server:** `/opt/kosh` (`main`; re-running setup updates it); secrets in
  `/opt/kosh/selfhost/.env` and `backup.pass`, both gitignored and mode 600

## Files

| File | What it does |
|---|---|
| `docker-compose.yml` | Postgres (localhost only) and PostgREST, project `selfhost` (the volume is `selfhost_pgdata`) |
| `docker-compose.local.yml` | Local development only: the gateway on `localhost:8000`, with atthebunga-server's `sites/api.caddy` |
| `sql/roles.sql` | Supabase's API roles and timeouts, plus `akhar_writer` (the annotation site); re-applied by setup |
| `scripts/db-setup.sh` | The database's half of server setup (re-runnable): checkout, secrets, network, stack, roles, backup timer |
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

With a checkout of atthebunga-server next to this repo's folder (or `INFRA_DIR=` in `.env` pointing
at one), for the gateway's config:

```sh
{ echo "COMPOSE_FILE=docker-compose.yml:docker-compose.local.yml"
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"; echo "AUTHENTICATOR_PASSWORD=$(openssl rand -hex 24)"
  echo "BACKUP_TOKEN=$(openssl rand -hex 24)"; node selfhost/scripts/mint-keys.mjs; } > selfhost/.env
chmod 600 selfhost/.env
docker network create api-edge 2>/dev/null || true
(cd selfhost && docker compose up -d)
sh selfhost/scripts/replay-migrations.sh                        # or restore.sh
set -a; . selfhost/.env; set +a
SELFHOST_URL=http://localhost:8000 SELFHOST_ANON_KEY=$ANON_KEY SELFHOST_SERVICE_KEY=$SERVICE_KEY \
  npx vitest run tests/selfhost/
```

Run Compose from inside `selfhost/`: it resolves `COMPOSE_FILE` (set in your local `.env`) against
the working directory. The server's `.env` sets none.

## Server setup

The host (Docker, firewall, swap) and the gateway come first, from atthebunga-server's README ("A
new server"). Then, from a machine that can SSH to the VM (one command per step; each prints a
short result):

```sh
# 1. Set up, or update to the latest code on this branch (safe to re-run; keeps existing secrets)
ssh ubuntu@141.148.39.45 'curl -fsSL https://raw.githubusercontent.com/thehimmat/gurmukhi-kosh/main/selfhost/scripts/db-setup.sh | bash -s -- 141-148-39-45.sslip.io'

# 2. Restore a backup into the empty database (prompts for the passphrase). First copy a
#    kosh-YYYY-MM-DD.dump.gpg to /opt/kosh: from the old server's selfhost/backups/, or a backup
#    workflow artifact (supabase/BACKUP.md).
ssh -t ubuntu@141.148.39.45 'cd /opt/kosh && read -rsp "Backup passphrase: " BACKUP_PASSPHRASE && echo && BACKUP_PASSPHRASE=$BACKUP_PASSPHRASE sh selfhost/scripts/restore.sh --gpg kosh-YYYY-MM-DD.dump.gpg'

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

To change the token (the file is encrypted either way, but the URL shouldn't circulate): set a new
`BACKUP_TOKEN=` in `/opt/kosh/selfhost/.env`, recreate the gateway
(`sh /opt/infra/scripts/compose.sh up -d gateway`), and update the `KOSH_BACKUP_URL` secret.

## Uptime

`.github/workflows/uptime.yml` checks `/health` every 30 minutes once the repository variable
`KOSH_API_URL` is set (`https://141-148-39-45.sslip.io`). `/health` is 200 only when PostgREST is up
and reaches the database. A failed run is GitHub's email that the API is down.

## History: the move off Supabase

Production moved from Supabase (project `brczghxvpfikezsevbkh`) to this server on 2026-10-28, by
restoring a live dump (`restore.sh --supabase`), checking it with `compare.sh`, and switching the
apps' URL and keys. Supabase was paused on 2026-11-11 (#419) once nothing used it. It can be
restored from its dashboard until about 2027-02-09; after that only its backup download remains.
`restore.sh --supabase` and `compare.sh` still work against it while it's restored.

Rolling the apps back to Vercel now means a fresh build there (Redeploy, not Promote of an old
deployment, whose values point at Supabase), still talking to this server's API. Vercel holds the
URL and anon key; `SUPABASE_SERVICE_ROLE_KEY` (gurmukhi-kosh, for `/admin/flags`) is deliberately not
set there and would need adding from the server's `SERVICE_KEY` at that point.

## The akhar annotation site

annotate.atthebunga.com (repo gurmukhi-akhar-ocr, `site/`) stores its answers in `akhar.annotations`.
It reaches them through this API like the other apps, with a key of its own (`AKHAR_KEY` in
`.env`), signed for the `akhar_writer` role: it can read and write that schema and nothing else, and
anon can't see the schema at all. Postgres stays closed to the internet. In Vercel, `akhar-annotate`
needs `AKHAR_API_URL` (this API's address) and `AKHAR_API_KEY`:

```sh
ssh ubuntu@141.148.39.45 'grep ^AKHAR_KEY= /opt/kosh/selfhost/.env | cut -d= -f2' | pbcopy
```

The gateway tests write an answer and have PostgREST roll it back (`PGRST_DB_TX_END`), so running
them against the server leaves no rows.

## The apps (search.atthebunga.com)

Since Nov 2026 the VM also serves the site, off Vercel Hobby (Oct 2026: crawlers on /word, /line and
/ang used the team's whole Fluid CPU allowance). The apps, their deploys, Cloudflare and the rollback
to Vercel are documented in [atthebunga-server](https://github.com/thehimmat/atthebunga-server)'s
README. What's this repo's:

- **The image** `ghcr.io/thehimmat/gurmukhi-kosh`, a standalone Next server built for arm64 by
  `.github/workflows/deploy.yml` after CI on main (tags `latest` and the commit SHA). The workflow
  then sends the deploy key the target `kosh`, or `kosh-db` when no app file changed (same rule as
  Vercel's, `scripts/vercel-ignore.mjs`), and purges search.atthebunga.com from Cloudflare's cache.
- **Next's cache (ISR):** regenerated /line and /ang pages are written inside the container, next to
  the build's own pages (a volume there would hide them). They survive restarts and start over on
  each deploy, as on Vercel.
- **Postgres's memory:** `shared_buffers` 3 GB of the VM's 24 GB (`effective_cache_size` 8 GB is only
  a planner hint). The whole database fits; `pg_prewarm`'s autoprewarm worker saves the list of
  cached blocks every 5 minutes and loads it back when Postgres starts, so the first searches after
  a restart don't read `lines` from disk and pass anon's 3 s timeout (gurmukhi-search#50).
  `docker compose logs db | grep autoprewarm` says how many blocks it loaded.

## Migrations

Apply a migration from GitHub, not a shell: **Actions → Apply migration → Run workflow** with the file
name (`087_example.sql`), or

```sh
gh workflow run migrate.yml -R thehimmat/gurmukhi-kosh -f migration=087_example.sql
```

It runs `scripts/migrate.sh` on the server over its own SSH key, which can run that script and
nothing else. The script takes a file name only, applies the file **from main** in one transaction
(`psql -v ON_ERROR_STOP=1 -1`), reloads PostgREST's schema cache, and refuses a file that isn't on
main or that `supabase/APPLIED.md` already records. psql's output lands in the run's summary; record
it in `APPLIED.md` in a commit afterwards. Write and test the migration first (`tests/db/`).

One-time setup (on your Mac):

```sh
ssh-keygen -t ed25519 -N "" -C github-migrate -f ~/.ssh/kosh-migrate
```
```sh
echo "restrict,command=\"sh /opt/kosh/selfhost/scripts/migrate.sh\" $(cat ~/.ssh/kosh-migrate.pub)" | ssh ubuntu@141.148.39.45 'cat >> ~/.ssh/authorized_keys'
```
```sh
gh secret set MIGRATE_SSH_KEY -R thehimmat/gurmukhi-kosh < ~/.ssh/kosh-migrate
```

It reuses the `DEPLOY_HOST` variable and `DEPLOY_KNOWN_HOSTS` secret. By hand, the same as the
workflow: `ssh ubuntu@141.148.39.45 'sh /opt/kosh/selfhost/scripts/migrate.sh 087_example.sql'`.

### Oracle's idle-instance reclaim

Oracle stops Always Free instances that it judges idle over 7 days. The criteria include low CPU,
network and (on A1 shapes) memory use, and Oracle emails before stopping. With the site on it, the VM
is less likely to look idle. A **Pay As You Go** upgrade takes the instance out of the reclaim and
keeps the Always Free allowance at no charge. Confirm both points on Oracle's
[Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
page before upgrading. After upgrading, set a budget alert (Billing → Budgets, $1) so anything
outside the free tier is caught at once.

## Rehearsal results

- **2026-10-26, sandbox:** the 2026-10-25 backup restored with no errors; row counts, 38 RLS
  policies and 76 functions match production; 664 MB.
- **2026-10-27, the VM:** a live dump from Supabase restored with no errors; HTTPS, firewall and
  reboot recovery verified; the full suite passed (894 tests, 0 failures) against the server.
- **2026-10-28, sandbox:** backup → download through the gateway → restore round trip matched every
  row count.

Two differences from Supabase, both harmless: no `safeupdate`, so an UPDATE/DELETE without a WHERE
is allowed here but not on Supabase (write migrations for the stricter one), and no `supabase_admin`
role.

## Later: moving to Supabase Pro or a VPS

Take a backup (or `pg_dump` the server over an SSH tunnel), restore it into the new host
(supabase/BACKUP.md), and swap the URL and keys in the apps again. Nothing in the apps changes.

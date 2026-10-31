# Self-hosted API (bridge off Supabase Free)

The production database outgrew Supabase Free's 500 MB. Until the project can pay for Supabase Pro,
it runs on a free Oracle Cloud VM as **Postgres 17 + PostgREST + Caddy**. That's the same REST server
Supabase runs, behind a gateway that serves `/rest/v1` and checks the `apikey` header like
Supabase's does. To the apps (this repo and gurmukhi-search, now on this VM too, and
gurmukhi-voice-search locally) only the URL and keys change. RLS, the search RPCs and `pg_trgm` work as they are.

Not included, because none of the apps use them: Supabase Auth, Storage, Realtime, Edge Functions
and the dashboard.

- **Server:** Oracle VM `kosh-db` (Ashburn, Ampere A1, 2 OCPU / 12 GB, Ubuntu 24.04), `141.148.39.45`
- **API:** `https://141-148-39-45.sslip.io` (sslip.io resolves the name to the IP; swap in a real
  domain by re-running setup with it, then updating the apps' URL)
- **Code and secrets on the server:** `/opt/kosh` (`main`; re-running setup updates it); secrets in
  `/opt/kosh/selfhost/.env` and `backup.pass`, both gitignored and mode 600

## Files

| File | What it does |
|---|---|
| `docker-compose.yml` | The three services. Postgres listens on localhost only. |
| `docker-compose.server.yml` | On the server: Caddy on 80/443 with its own TLS certificate |
| `Caddyfile` | `/rest/v1/*` → PostgREST for requests with a known apikey; `/health`; the latest backup behind a token. The same API on `:8080` (HTTP, Docker network only) for the apps |
| `docker-compose.apps.yml` | On the server: the two Next apps behind search.atthebunga.com ([The apps](#the-apps-searchatthebungacom)) |
| `sites/search.caddy` | search.atthebunga.com → the search app, for Cloudflare only (Origin CA cert, Authenticated Origin Pulls) |
| `sql/roles.sql` | Supabase's API roles and timeouts, plus `akhar_writer` (the annotation site); re-applied by setup |
| `scripts/server-setup.sh` | One-time (re-runnable) VM setup: updates, firewall, Docker, swap, secrets, stack, backup timer |
| `scripts/mint-keys.mjs` | A JWT secret plus anon and service keys signed with it |
| `scripts/restore.sh` | Restore from a live Supabase dump (`--supabase`) or an encrypted backup (`--gpg`) |
| `scripts/backup.sh` | Nightly encrypted dump, 14 days kept (`kosh-backup.timer`, 03:30 UTC) |
| `scripts/compare.sh` | Row counts of every table, here vs another database |
| `scripts/check.sh` | The test suite, run on the server against its own stack |
| `scripts/deploy.sh` | Deploys one app (or only this folder's config); GitHub Actions' deploy key runs nothing else |
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
ssh ubuntu@141.148.39.45 'curl -fsSL https://raw.githubusercontent.com/thehimmat/gurmukhi-kosh/main/selfhost/scripts/server-setup.sh | bash -s -- 141-148-39-45.sslip.io'

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

To change the token (the file is encrypted either way, but the URL shouldn't circulate): set a new
`BACKUP_TOKEN=` in `/opt/kosh/selfhost/.env`, run `docker compose up -d` in that folder, and update
the `KOSH_BACKUP_URL` secret.

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
5. **akhar annotation site** (Vercel project `akhar-annotate`, repo gurmukhi-akhar-ocr): see
   [The akhar annotation site](#the-akhar-annotation-site).

**Rollback:** put the Supabase values back in Vercel (Supabase dashboard → Settings → API) and
redeploy. Supabase is left untouched, so it's exactly as it was at cutover; anything written to the
server since would need copying back (`compare.sh` lists which tables).

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
/ang used the team's whole Fluid CPU allowance, and every request, cached or not, counts toward
Vercel's 1M CDN requests).

```
visitor → Cloudflare (cache, bot rules) → Caddy :443 (sites/search.caddy) → search:3000
                                                        search's rewrites → kosh:3000 (/word, /line, /ang, …)
                               both apps → gateway:8080 → PostgREST → Postgres   (Docker network only)
```

- **Images:** `ghcr.io/thehimmat/gurmukhi-kosh` and `ghcr.io/thehimmat/gurmukhi-search`, standalone
  Next servers built for arm64 by each repo's `.github/workflows/deploy.yml` (after CI on main here;
  on every push to main in gurmukhi-search). Tags: `latest` and the commit SHA.
- **Deploy:** the workflow SSHes in with a key whose only command is `scripts/deploy.sh`: update
  /opt/kosh to main, pull the image, `docker compose up -d --wait`, reload Caddy. Then it purges
  search.atthebunga.com from Cloudflare's cache, because cached pages name the old build's chunks.
  A push that changes no app file (same rule as Vercel's, `scripts/vercel-ignore.mjs`) builds nothing
  and only applies this folder's config.
- **TLS:** Cloudflare in Full (strict) mode. Caddy holds a Cloudflare Origin CA certificate (15 years,
  no renewals) and requires Cloudflare's client certificate (Authenticated Origin Pulls), so the
  apps can't be reached around Cloudflare. The API on sslip.io keeps its Let's Encrypt certificate
  and takes no client certificate (it's matched by name on the same port).
- **Next's cache (ISR):** regenerated /line and /ang pages are written inside the container, next to
  the build's own pages (a volume there would hide them). They survive restarts and reboots and
  start over on each deploy, as on Vercel. Cloudflare's cache does most of the work anyway.
- **Memory (12 GB):** Postgres `shared_buffers` 3 GB (`effective_cache_size` 8 GB is only a planner
  hint); each app capped at 768 MB with a 512 MB heap (about 80 MB idle); PostgREST and Caddy about
  100 MB; 2 GB swap. Check with `docker stats --no-stream`.

### One-time setup

1. **Cloudflare, zone atthebunga.com:**
   - SSL/TLS → Overview: **Full (strict)**.
   - SSL/TLS → Origin Server → Create Certificate: RSA, hostnames `*.atthebunga.com` and
     `atthebunga.com`, 15 years. Copy the certificate, then:
     ```sh
     pbpaste | ssh ubuntu@141.148.39.45 'install -d -m 700 /opt/kosh/selfhost/certs && (umask 077 && cat > /opt/kosh/selfhost/certs/origin.pem)'
     ```
     Copy the private key and run the same with `origin.key`.
   - SSL/TLS → Origin Server → **Authenticated Origin Pulls: on**. Then fetch Cloudflare's CA for it:
     ```sh
     ssh ubuntu@141.148.39.45 'curl -fsS https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem -o /opt/kosh/selfhost/certs/cloudflare-origin-pull-ca.pem && chmod -R a+rX /opt/kosh/selfhost/certs'
     ```
   - My Profile → API Tokens → Create: permission Zone → Cache Purge → Purge, this zone only.
2. **The server:** the apps in `COMPOSE_FILE`, and the curator key (prompted, never echoed; the same
   `ADMIN_KEY` as in Vercel):
   ```sh
   ssh -t ubuntu@141.148.39.45 'cd /opt/kosh/selfhost && sed -i "s|^COMPOSE_FILE=.*|COMPOSE_FILE=docker-compose.yml:docker-compose.server.yml:docker-compose.apps.yml|" .env && read -rsp "ADMIN_KEY: " k && echo && echo "ADMIN_KEY=$k" >> .env'
   ```
3. **The deploy key** (on your Mac). It can run `deploy.sh` and nothing else:
   ```sh
   ssh-keygen -t ed25519 -N "" -C github-deploy -f ~/.ssh/kosh-deploy
   ```
   ```sh
   echo "restrict,command=\"sh /opt/kosh/selfhost/scripts/deploy.sh\" $(cat ~/.ssh/kosh-deploy.pub)" | ssh ubuntu@141.148.39.45 'cat >> ~/.ssh/authorized_keys'
   ```
4. **GitHub, both repos** (Settings → Secrets and variables → Actions):
   - Variables: `DEPLOY_HOST` = `ubuntu@141.148.39.45`, `NEXT_PUBLIC_SUPABASE_URL` =
     `https://141-148-39-45.sslip.io`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the server's `ANON_KEY`.
   - Secrets: `DEPLOY_SSH_KEY` (`pbcopy < ~/.ssh/kosh-deploy`), `DEPLOY_KNOWN_HOSTS`
     (`ssh-keyscan 141.148.39.45 | pbcopy`), `CLOUDFLARE_ZONE_ID` (zone Overview page),
     `CLOUDFLARE_API_TOKEN`.
5. **First images:** run Deploy by hand in gurmukhi-kosh, then in gurmukhi-search (Actions → Deploy →
   Run workflow). The first `docker compose pull` fails until both packages are public: GitHub →
   your profile → Packages → each one → Package settings → Change visibility → Public. Then run both
   again.
6. **Check on the VM, before any DNS change** (each prints a status code; expect 200s):
   ```sh
   ssh ubuntu@141.148.39.45 'cd /opt/kosh/selfhost && for p in / /word/%E0%A8%B8%E0%A8%A4%E0%A8%BF /ang/1 /line/1 /api/health; do docker compose exec -T kosh node -e "fetch(\"http://search:3000$p\").then(r=>console.log(r.status,\"$p\"))"; done'
   ```
7. **Cloudflare cache rules** (Caching → Cache Rules). Later rules override earlier ones, so the
   bypass goes last:
   1. *Dictionary pages*: `http.host eq "search.atthebunga.com" and (starts_with(http.request.uri.path, "/word/") or starts_with(http.request.uri.path, "/line/") or starts_with(http.request.uri.path, "/ang/") or starts_with(http.request.uri.path, "/api/word/"))`
      → Eligible for cache; Edge TTL: use cache-control header if present, bypass cache if not;
      Browser TTL: respect origin. Cloudflare reads `CDN-Cache-Control` first (/word) and
      `s-maxage` otherwise (/line, /ang).
   2. *Curator URLs*: `http.host eq "search.atthebunga.com" and http.request.uri.query contains "key="`
      → Bypass cache. (They also send `private, no-store`, so this is the second guard.)
   **Bot Fight Mode stays off** (Security → Bots). On the Free plan no rule can exempt anything from
   it, and it challenged GitHub's runners, so CI's production checks and the uptime checks never
   reached the site. The cache rules above take crawler load off the VM instead; the AI-crawler
   block and robots.txt stay on. In its place, the Free plan's one rate-limiting rule (Security →
   WAF → Rate limiting rules): `http.host eq "search.atthebunga.com" and (starts_with(http.request.uri.path, "/word/") or starts_with(http.request.uri.path, "/line/") or starts_with(http.request.uri.path, "/ang/") or starts_with(http.request.uri.path, "/api/"))`,
   counted per IP, more than 100 requests in 10 seconds → Block for 10 seconds.
8. **Cut over:** Cloudflare DNS, `search` and `kosh`: change each to an **A record `141.148.39.45`,
   proxied** (note the old CNAME targets for the rollback). Leave the domains on the Vercel projects.
9. **Check:**
   ```sh
   for i in 1 2; do curl -sI https://search.atthebunga.com/word/%E0%A8%B8%E0%A8%A4%E0%A8%BF | grep -iE "^(cf-cache-status|x-vercel-cache)"; done
   ```
   The second line should say `cf-cache-status: HIT`, and no `x-vercel-cache` header should appear.
   Then set the gurmukhi-kosh variable `SITE_URL` = `https://search.atthebunga.com` (uptime checks),
   and re-run CI on main (its production checks use the public site).
10. **After a stable week:** in Vercel, project gurmukhi-kosh, Production, set
    `KOSH_REDIRECT_VERCEL_HOST=1` and redeploy, so crawlers that know gurmukhi-kosh.vercel.app go to
    the public site through a routing redirect, which uses no function time. Also remove the Vercel
    project's cron if Vercel still lists one (vercel.json no longer has it).

### Rollback to Vercel

Vercel keeps deploying main (now with nothing to serve), so it's a DNS switch:

1. If `KOSH_REDIRECT_VERCEL_HOST` is set in Vercel, delete it and redeploy gurmukhi-kosh first; the
   Vercel shell reaches the kosh zone through gurmukhi-kosh.vercel.app.
2. Cloudflare DNS: `search` and `kosh` back to their old CNAMEs (`cname.vercel-dns.com`), still
   proxied. Full (strict) and Authenticated Origin Pulls work with Vercel as they are.
3. Purge the cache (Caching → Configuration → Custom Purge → Hostname `search.atthebunga.com`).

**Roll back one app on the VM** to an earlier image (the commit SHAs are the image tags):
`KOSH_TAG=<sha>` or `SEARCH_TAG=<sha>` in `.env`, then `docker compose up -d`. Remove the line to
follow `latest` again.

### Day to day

```sh
# Logs (Next prints errors here)
ssh ubuntu@141.148.39.45 'cd /opt/kosh/selfhost && docker compose logs --tail 100 search kosh'

# Deploy by hand (your own key isn't limited to deploy.sh): kosh, search, or selfhost (config only)
ssh ubuntu@141.148.39.45 'sh /opt/kosh/selfhost/scripts/deploy.sh kosh'

# Memory and health
ssh ubuntu@141.148.39.45 'cd /opt/kosh/selfhost && docker stats --no-stream && docker compose ps'
```

`.github/workflows/uptime.yml` checks the API and the home page every 30 minutes, and `/api/health`
daily at 08:00 UTC, which used to be the Vercel cron.

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

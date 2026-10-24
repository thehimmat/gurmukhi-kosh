# Self-hosting the database (Postgres 17 + PostgREST) instead of Supabase

**Verdict: it works, with no app code changes.** On a stack of stock Postgres 17, PostgREST 12.2 and a Caddy
proxy serving `/rest/v1`, the app built and served every page and API checked. Responses matched
production's, and RLS hid exactly what it hides on Supabase. The only change is three env vars. Trial run
2026-10-24 in a cloud container (4 vCPU, 15 GB RAM), against a full copy of production (project
`brczghxvpfikezsevbkh`, us-west-1, 902 MB on Supabase, 754 MB once loaded locally).

Why: production is over the Free plan's 500 MB. The candidates are an old 2015 MacBook Pro at home
behind a Cloudflare Tunnel, or a ~$5/month VPS.

Everything to run it is in [`scripts/self-host/`](../scripts/self-host/):

| File | What |
|---|---|
| `setup.sh` | `install` (Postgres 17, PostgREST, Caddy, cloudflared), `init` (db, roles, secrets, configs, keys), `restore <dump.gpg>`, `replay` + `copy`, `refresh`, `services` (systemd / launchd), `check`. macOS and Ubuntu. |
| `bootstrap.sql` | The Supabase roles, role settings, schemas and extensions the migrations and the dump expect. |
| `default-privileges.sql` | Supabase's default grants to the API roles. **Replay path only** (see "What broke" #1). |
| `replay-order.ts` | Prints the migrations in ledger order (from `tests/db/replay.ts`) for psql. |
| `copy-from-supabase.ts` | Copies every public table over the REST API with only the service key (fallback when no dump is at hand). |
| `refresh.sql` | Rebuilds the derived tables and materialized views. |
| `mint-jwt.mjs` | Mints the anon and service_role keys (HS256 JWTs) from a new secret. |
| `postgrest.conf.template`, `Caddyfile` | PostgREST config matching Supabase's (max-rows 1000, schema `public`); proxy at `/rest/v1`. |
| `services/` | systemd units (Ubuntu) and launchd agents (macOS) for PostgREST and Caddy. |
| `cloudflared.yml.template` | Tunnel config for the home-server option. |
| `docker-compose.yml` | The same stack in containers (how the trial ran; suits a VPS that runs Docker). |

## What was done, and what came out

1. **Roles, extensions, schema.** `bootstrap.sql` (roles anon / authenticated / service_role /
   authenticator, with production's role settings), then all 90 migration files replayed in ledger
   order: **6.5 s, no errors.** Compared with production:
   - RLS policies: identical (36, same md5 over table/name/roles/command).
   - Effective privileges of anon, authenticated and service_role on every public table, view and
     function: **identical** (264 checks, same md5).
   - Schema drift (exists in production but in no repo): see "What broke" #4.
2. **Data.** `copy-from-supabase.ts` paged all 43 public tables over REST with the service key:
   **2,584,050 rows fetched in 81 s, loaded in 115 s, 3 min 16 s total.** Keyset paging (`id=gt.N`) in
   50k-id ranges with 8 parallel workers; PostgREST's 1,000-row cap is respected as in
   `lib/fetch-all-rows.ts`. **Every table's exact row count matches production.** Then `refresh.sql`
   ran in 76 s (frequencies 1 s, corpus stats 5.5 s, writer stats 5.2 s, first letters 2.8 s,
   materialized views + health cache 13.5 s, `analyze` 48 s).
3. **Proxy and keys.** PostgREST behind Caddy at `http://127.0.0.1:8000/rest/v1`. New HS256 secret;
   anon and service_role JWTs minted by `mint-jwt.mjs`.
4. **App pointed at it.** `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8000` plus the two new keys.
   - DB tests (`tests/db`, PGlite): 94/94 pass. They don't touch the stack, but nothing in this branch
     broke them.
   - Live tests (`tests/api.test.ts`, `tests/stories/`, `tests/line-context.test.ts`): **56 passed
     against self-hosted, 57 against Supabase.** In both runs, the 8 failures are route checks that call
     `https://gurmukhi-kosh.vercel.app`, which this container's egress policy blocks. The one extra
     local failure is `api.test.ts`'s `expect(SUPABASE_URL).toContain("supabase.co")`. Suite time:
     2.8 s self-hosted vs 9.0 s Supabase.
   - `npm run build`: passes (24 s), with no warnings about the URL.
   - Pages and APIs: same status and same byte size as the identical build pointed at Supabase. The
     JSON of `/api/word/ਨਾਨਕ` and `/api/line/32` is byte-identical. `/api/search?q=ਸਤਿ` returns the same
     20 frequencies, but different words among those tied at frequency 2: the query orders by
     `frequency` only, with no tiebreaker (already true on Supabase, see risks). `/api/health`
     differs only in timestamps.
5. **RLS.** Exact counts, anon key vs service key, same on both stacks:

   | Query | anon | service |
   |---|---|---|
   | `sources?id=eq.7` (Sri Gur Sobha) | 0 | 1 |
   | `lines?source_fk=eq.7` | 0 | 3,708 |
   | `shabads?source_fk=eq.7` | 0 | 483 |
   | `line_translations?source_code=eq.ss_darpan` (Darpan) | 0 | 55,058 |
   | `padarth_glosses?source_code=eq.ss_padarth` | 0 | 124,751 |
   | `etymology?source_code=eq.shackle` | 0 | 7,049 |
   | `word_corpus_stats?source_fk=eq.7` | 0 | 4,789 |
   | `flags` | 0 | 15,542 |
   | `lines` (all) | 172,604 | 176,312 |

   Two anon counts came back blank from Supabase: an HTTP 500 after 3.6 s, from Supabase's 3 s anon
   `statement_timeout` on an exact count under RLS. Self-hosted answered the same requests with `0` in
   0.1–0.2 s. In the app, `/line/<Gur Sobha line>` and `/api/line/<id>` return 404 on both stacks.
   `/admin/line/<id>?key=ADMIN_KEY` returns 200 with identical 37,271 bytes on both, and 404 with the
   wrong key.

### Timings

The same production build was served twice from this container: once pointed at self-hosted, once at
Supabase. Times are curl `time_total` in seconds: first hit, then median of 7 warm hits.

| URL | self-hosted first | self-hosted warm | Supabase first | Supabase warm | PG capped at 1 CPU / 2 GB, warm |
|---|---|---|---|---|---|
| `/` | 0.021 | 0.006 | 0.017 | 0.007 | 0.004 |
| `/word/ਨਾਨਕ` | 0.109 | 0.042 | 0.667 | 0.230 | 0.046 |
| `/line/32` | 0.018 | 0.009 | 0.428 | 0.005 | 0.006 |
| `/api/search?q=ਸਤਿ` | 0.048 | 0.018 | 0.230 | 0.200 | 0.020 |
| `/api/health` | 0.672 | 0.654 | 4.759 | 1.774 | 1.059 |
| `/api/word/ਨਾਨਕ` | 0.046 | 0.035 | 0.465 | 0.292 | 0.058 |
| `/api/line/32` | 0.044 | 0.036 | 0.306 | 0.313 | 0.038 |
| `/browse` | 0.036 | 0.035 | 0.332 | 0.120 | 0.035 |
| `/health` | 0.632 | 0.614 | 1.627 | 1.586 | 1.080 |
| `/admin/line/175497` (curator) | 0.045 | | 0.669 | | |

**Read these carefully.** One PostgREST round trip from this container takes about 0.012 s to the local
stack and 0.23–0.55 s to Supabase. So most of the gap is network distance from this container, not
database speed. The useful conclusions:
- On similar hardware with no network in the way, Postgres + PostgREST is at least as fast as Supabase
  Free for every page. `/api/health` and `/health` are the only CPU-heavy pages, and they stay near
  1 s with Postgres capped at one CPU (a rough stand-in for one core of a 2015 dual-core i5).
- In production the app runs on Vercel, by default in `iad1` (US East); `vercel.json` sets no region.
  Supabase is in us-west-1, so today every query already crosses the US (roughly 60–70 ms per round
  trip). A home server behind a Cloudflare Tunnel adds Vercel → Cloudflare edge → tunnel → home per
  query. If home is in North America that is likely the same order as today; elsewhere it is worse. A
  VPS in US East would be faster than today. **Measure from Vercel before cutting over** (step 3 below).
- Memory: Postgres used ~0.9 GB under a 2 GB cap (including its cache), PostgREST 44 MB, Caddy 15 MB.

### The backup-restore path (rehearsed)

The real weekly artifact couldn't be used here: there is no GitHub artifact access and no
`BACKUP_PASSPHRASE`. So the same steps ran on a dump of the local copy instead: `pg_dump --format=custom`
(52 MB, 13 s), `gpg --symmetric` as `.github/workflows/backup.yml` does, then decrypt, `bootstrap.sql`,
and `pg_restore --no-owner` into an empty database. The restore took **47 s**. The only error was the
expected `schema "public" already exists`. Row counts, all 36 policies, and every ACL on the public
schema match the source exactly (same md5).

## What broke, and what was found

1. **Restoring a dump after setting Supabase's default privileges re-grants revoked permissions.**
   Found and fixed in the scripts. At first, `bootstrap.sql` set `ALTER DEFAULT PRIVILEGES ... GRANT ALL
   ON FUNCTIONS TO anon, ...`, as `tests/db/supabase-bootstrap.sql` does. `pg_restore` then created
   every function with those grants. The dump's ACL entries are written relative to Postgres's built-in
   defaults, so nothing revoked them. Result: anon could execute `bulk_update_phonetic_ipa`, which
   022_rls_lockdown revoked. The default grants now live in `default-privileges.sql`, which only
   `setup.sh replay` runs. After the fix, the restored ACLs are identical to the source.
2. **`tests/api.test.ts` asserts the URL contains `supabase.co`.** It is the only live test that fails
   on self-hosted. Loosen it when cutting over (not changed here, so `main` behaves as before).
3. **The story tests' route checks are pinned to `PROD_BASE = https://gurmukhi-kosh.vercel.app`**
   (`tests/stories/helpers.ts`). They test whatever the deployment points at, not the configured
   database, so they can't verify a self-hosted stack before cut-over. Pages were checked here with
   curl instead.
4. **Production has schema that no migration file creates.** Five tables (`mk_alignments`,
   `mk_discrepancies`, `mk_pa_entries`, `mk_runs`, `mk_secrets`) and the function `mk_ingest`
   (a Mahan Kosh tool, it seems). Nothing in this repo reads them. The app doesn't need them, so the
   REST copy skips them; a dump restore carries them. In the other direction, index `lines_source_fk`
   (001_schema.sql) exists in the replay but not in production: it was dropped outside the ledger.
   Both belong in `supabase/APPLIED.md` / `migrations-imported/`.
5. **Production's materialized views are stale.** `word_source_stats` holds 29,495 rows and
   `word_stem_groups` 14,638. After `refresh_computed_stats()` on the identical data they hold 93,726
   and 42,242; the definitions are the same (same md5). `refresh_computed_stats()` hasn't run since
   words and definitions grew. Not a self-hosting problem, and not touched here (no production writes).
6. **Production's service key is the new `sb_secret_...` format, not a JWT.** On Supabase the gateway
   translates it. PostgREST can only verify JWTs, so self-hosted needs the minted service_role JWT.
   The app passes the key through without looking at it, so this changes nothing in code. But mixing
   the two (e.g. a stale `SUPABASE_SERVICE_ROLE_KEY` in the shell overriding `.env.local`) gives
   `JWSError CompactDecodeError` and a 500 on curator pages. That happened once during this trial.

## Every Supabase-specific thing that was stubbed

| Supabase has | Self-hosted | Effect |
|---|---|---|
| Roles anon, authenticated, service_role (bypassrls), authenticator | Created by `bootstrap.sql`, same attributes | None |
| `anon` statement_timeout 3 s, `authenticated` 8 s, `authenticator` 8 s + lock_timeout 8 s | Same settings | None (keeps the app honest about slow queries) |
| `session_preload_libraries = supautils, safeupdate` on authenticator | **Dropped.** supautils is Supabase's superuser guard; pg-safeupdate (rejects UPDATE/DELETE without WHERE) isn't in stock Postgres packages | Loses a guard rail only; the refresh functions already satisfy it (030) |
| Default privileges: all on new public tables/sequences/functions to the API roles | `default-privileges.sql`, replay path only | None; the dump carries its own |
| `extensions` schema with pgcrypto, uuid-ossp, pg_stat_statements; `search_path` includes it | Schema created, no extensions; `db-extra-search-path = public, extensions` | Nothing calls them |
| `supabase_vault` extension, `vault` schema | Not created | Unused |
| pg_trgm in `public` | Same | None |
| Roles `supabase_admin`, `akhar_writer` named in the dump's grants | NOLOGIN stubs created before `pg_restore` | Grants apply; akhar_writer can't log in until given a password (its tool is outside this repo) |
| `supabase_migrations.schema_migrations` ledger | Restored with the dump; not created by replay | Migrations from now on: apply with psql, record in APPLIED.md (the MCP `apply_migration` won't reach this server) |
| Kong gateway: `/rest/v1` prefix; rejects requests without a valid `apikey`; `apikey`-only requests work | Caddy: strips `/rest/v1`, promotes `apikey` to `Authorization: Bearer` | Requests with no key run as anon (the anon key is public anyway) |
| New-format `sb_publishable_` / `sb_secret_` keys | Not possible; HS256 JWTs from `mint-jwt.mjs` | Env values change (they do anyway) |
| PostgREST `max-rows` 1000 | `db-max-rows = 1000` | Paging behaves as in production |
| Auth, Storage, Realtime, Edge Functions, `auth`/`storage` schemas | Not created | Unused by the app |
| Dashboard, SQL editor, MCP `execute_sql`, daily usage graphs | psql over SSH | Operational, see risks |

## Remaining risks

- **Single machine, no failover.** A home Mac adds power cuts, ISP outages, macOS updates and sleep.
  Cloudflare Tunnel reconnects by itself, but the site is down while the machine is. With
  Supabase/Vercel's cache in front, static pages (`/`, `/line/*`, `/ang/*`) keep serving; search,
  word and health pages don't.
- **Backups become ours.** The weekly workflow dumps from Supabase. After cut-over it needs a
  `SUPABASE_DB_URL` that reaches the new server, which a tunnel doesn't expose as plain Postgres. Run
  `pg_dump` on the server itself (cron / launchd) and push the encrypted file off-machine. This isn't
  scripted yet.
- **Old macOS.** A 2015 MacBook Pro tops out at macOS 12 Monterey. Homebrew no longer supports it, so
  formulae may build from source or break, and security updates have ended. Ubuntu on the same
  hardware avoids both.
- **1 GB VPS is tight.** The working set is ~0.75 GB of data plus indexes; `/api/health` does
  full-table work. Prefer 2 GB RAM.
- **Latency from Vercel is unmeasured** (see Timings). Measure it in cut-over step 3.
- **Public exposure.** PostgREST serves anything the anon role can read, same as today. On a VPS,
  bind Postgres to localhost (both configs do) and only open 80/443 (or 8000 behind a firewall).
- **Pre-existing, not caused by self-hosting:** `/api/search` orders by `frequency` with no tiebreaker,
  so ties come back in arbitrary order (it differs between two identical databases). Production's
  stale materialized views (#5). Untracked `mk_*` schema (#4).
- **Tested here:** `setup.sh init`, `replay`, `copy` and `check`, run against the Docker Postgres
  (with `SETUP_OS=macos`, the TCP path), the generated `postgrest.conf` under the static PostgREST
  binary from GitHub, and the generated Caddyfile.
- **Not tested here:** `setup.sh install` and `services` (this container can't reach the PGDG, Caddy
  or Cloudflare apt repos, and has no systemd or launchd); real macOS; cloudflared; the real
  encrypted weekly artifact (no passphrase or artifact access); ingest pipelines writing through the
  service key (the trial never writes to production, and no ingest ran against the local copy).

## Cut-over plan

Prerequisites: a machine (home Mac with Ubuntu or macOS, or a VPS); a domain on Cloudflare DNS (home
option) or a hostname pointing at the VPS; the `BACKUP_PASSPHRASE`.

1. **Build the server** (no production impact):
   ```sh
   git clone https://github.com/thehimmat/gurmukhi-kosh && cd gurmukhi-kosh && npm ci
   scripts/self-host/setup.sh install
   scripts/self-host/setup.sh init          # writes ~/kosh-db/etc/secrets.env with the new keys
   ```
2. **Load data.** Download the latest weekly backup artifact (Actions → Weekly database backup), or run
   the workflow by hand for a fresh one:
   ```sh
   scripts/self-host/setup.sh restore kosh-YYYY-MM-DD.dump.gpg
   scripts/self-host/setup.sh services
   scripts/self-host/setup.sh check         # anon must not list gur_sobha_iss; service must
   ```
   With no dump: `setup.sh replay`, then `SRC_URL=https://brczghxvpfikezsevbkh.supabase.co SRC_KEY=<service key> setup.sh copy`,
   then `setup.sh refresh`.
3. **Expose it and measure from Vercel.** Home: follow `cloudflared.yml.template`. VPS: put the
   hostname in the Caddyfile in place of `:8000`. Then create a **Preview** deployment with the three
   env vars set to the new values for that branch only. Production env stays on Supabase. Compare
   `/word/ਨਾਨਕ`, `/api/search?q=ਸਤਿ`, `/health` timings and contents against production.
4. **Freeze writes.** From the start of step 5 until the cut-over is done, run no ingest pipelines
   and make no curator edits (`/admin/flags`, `/admin/spellings`). Public flag submissions
   (`/api/flags`) are the only other writes from the site: note `select max(id) from flags` on
   Supabase.
5. **Final sync.** Run the backup workflow by hand, restore that dump (drop and recreate the database
   first, then `setup.sh init` and `restore`). Check that row counts match Supabase.
6. **Switch.** In Vercel Production env set `NEXT_PUBLIC_SUPABASE_URL=https://<new host>`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>` and `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>`, then
   redeploy. A redeploy is required: `NEXT_PUBLIC_*` values are inlined at build time. `ADMIN_KEY`
   doesn't change.
7. **Verify.** Run the live tests with the new env (`api.test.ts`'s `supabase.co` assertion will need
   loosening), open `/`, a word page, `/line/32`, `/api/search?q=ਸਤਿ`, `/api/health`, and a curator page
   with `?key=`. Check that the anon key can't read `source_id` 7 (step 2's `check`).
8. **Copy late flags.** Insert Supabase's `flags` rows with `id >` the value noted in step 4 into the
   new server.
9. **Afterwards.** Point the backup workflow (or a server-side cron) at the new database. Keep the
   Supabase project paused, not deleted, for a few weeks as the rollback target.

## Rollback

Set the three Vercel env vars back to the Supabase values and redeploy. Nothing else changes: no code
differs between the two setups. If flags, curator edits or ingests were written to the self-hosted
database in the meantime, copy those rows back to Supabase (same `id > N` approach) before or after switching. If the
Supabase project was paused, restore it first (Dashboard → Restore). Free-plan projects paused for
more than 90 days can't be restored from the dashboard (Supabase's policy at the time of
writing), so decide within that window, or keep the weekly dumps as the fallback.

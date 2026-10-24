# Database backups

Supabase's Free plan keeps no backups. `.github/workflows/backup.yml` dumps the production database
every Sunday (and on demand: Actions → Weekly database backup → Run workflow), encrypts it, and keeps
it as a workflow artifact for 90 days. The repo is public and so are its artifacts, so a dump is only
ever stored encrypted: it holds curator-only texts.

## Setup (once)

Add two repository secrets (Settings → Secrets and variables → Actions):

- `SUPABASE_DB_URL`: the **session pooler** connection string (port 5432) from the project's
  Connect button, with the database password filled in. The direct `db.<ref>.supabase.co` host is
  IPv6-only, which GitHub's runners can't reach.
- `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy somewhere outside GitHub (a password
  manager): without it no backup can be read.

Then run the workflow once by hand and check that it goes green.

## What's in a dump

`pg_dump --format=custom` (owners and grants included) of the `public`, `akhar` and `supabase_migrations` schemas: every table,
function, policy and index the app owns, and the migration ledger. Not `auth` or `storage`, which a
new Supabase project creates itself and the app doesn't use. Each run checks that the file decrypts
and that `pg_restore` can read it.

## Restore

1. Download the artifact from the run (Actions → the run → Artifacts) and unzip it.
2. Decrypt: `gpg --decrypt kosh-YYYY-MM-DD.dump.gpg > kosh.dump` (it asks for the passphrase).
3. Restore into an empty database, Postgres 17 or later:
   `pg_restore --no-owner --dbname "$TARGET_DB_URL" kosh.dump`
   On a new Supabase project the roles `anon`, `authenticated` and `service_role` already exist and
   the dump's grants and RLS policies apply as they are. Elsewhere, create those three roles first
   (the policies and grants name them), or add `--no-privileges` and grant afresh.

# Database backups

Production runs on the self-hosted server (`selfhost/`), which writes an encrypted dump nightly
(`selfhost/README.md`, Backups). Every Sunday (and on demand: Actions → Weekly database backup → Run
workflow) `.github/workflows/backup.yml` copies the latest one offsite as a workflow artifact for 90
days, after checking it decrypts. The repo is public and so are its artifacts, so a dump is only ever
stored encrypted: it holds curator-only texts. (The Supabase project this folder is named after was
paused on 2026-11-11, #419; the workflow no longer dumps it.)

## Setup (once)

Two repository secrets (Settings → Secrets and variables → Actions):

- `KOSH_BACKUP_URL`: the server's `https://<api>/backups/<BACKUP_TOKEN>/latest.dump.gpg`, printed when
  its backup is turned on (`selfhost/README.md`, Backups).
- `BACKUP_PASSPHRASE`: a long random passphrase, the same one the server encrypts with. Keep a copy
  somewhere outside GitHub (a password manager): without it no backup can be read.

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
   Onto the self-hosted stack, use `selfhost/scripts/restore.sh --gpg` instead: it handles roles and
   reloads PostgREST. On a new Supabase project the roles `anon`, `authenticated` and `service_role` already exist and
   the dump's grants and RLS policies apply as they are. Elsewhere, create those three roles first
   (the policies and grants name them), or add `--no-privileges` and grant afresh.

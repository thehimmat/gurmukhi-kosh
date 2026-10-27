#!/bin/sh
# Restores the production database into the stack, grants and RLS policies included, then makes
# PostgREST reload its schema cache. Run from the repo root with the stack up and the database still
# empty (a fresh volume). Two sources:
#
#   BACKUP_PASSPHRASE=… sh selfhost/scripts/restore.sh --gpg kosh-YYYY-MM-DD.dump.gpg
#       an encrypted weekly backup (.github/workflows/backup.yml)
#   SUPABASE_DB_URL=…   sh selfhost/scripts/restore.sh --supabase
#       a fresh pg_dump of the live project (the session-pooler connection string)
#
# Secrets come from the environment, never arguments (arguments show up in `ps`).
set -eu
cd "$(dirname "$0")/../.."
# From inside selfhost/: Compose reads COMPOSE_FILE from .env relative to where it runs.
compose() { (cd selfhost && docker compose "$@"); }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"; compose exec -T db rm -f /tmp/kosh.dump /tmp/kosh.toc' EXIT

case "${1:-}" in
  --gpg)
    : "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
    gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 \
        --output "$tmp/kosh.dump" "${2:?--gpg needs a file}" 3<<EOF
$BACKUP_PASSPHRASE
EOF
    compose cp "$tmp/kosh.dump" db:/tmp/kosh.dump
    source=$(basename "$2")
    ;;
  --supabase)
    : "${SUPABASE_DB_URL:?set SUPABASE_DB_URL}"
    # The same dump as the weekly backup, made by the container's pg_dump 17. `-e NAME` passes the
    # URL through from this environment without putting it on a command line.
    compose exec -T -e SUPABASE_DB_URL db sh -c \
      'pg_dump "$SUPABASE_DB_URL" --format=custom --schema=public --schema=akhar --schema=supabase_migrations -f /tmp/kosh.dump'
    source="live Supabase dump"
    ;;
  *)
    echo "usage: restore.sh --gpg FILE | --supabase" >&2
    exit 2
    ;;
esac

# Everything except the public schema itself (every database has it already) and Supabase's
# default privileges for its own supabase_admin role, which doesn't exist here and creates nothing.
compose exec -T db sh -c 'pg_restore --list /tmp/kosh.dump | grep -v -e " SCHEMA - public " -e "DEFAULT ACL .* supabase_admin" > /tmp/kosh.toc'
# --no-owner: everything belongs to `postgres` here. Grants are kept: they are what lets anon read.
# Errors are collected, not fatal, so one missing role doesn't stop the restore; they're printed
# at the end and the script fails if there were any.
if ! compose exec -T db pg_restore -U postgres -d postgres --no-owner --use-list=/tmp/kosh.toc /tmp/kosh.dump 2>"$tmp/errors.txt"; then
  echo "pg_restore reported errors:" >&2
  cat "$tmp/errors.txt" >&2
  exit 1
fi
compose exec -T db psql -U postgres -d postgres -qc "analyze"
compose restart rest
echo "restored: $source"

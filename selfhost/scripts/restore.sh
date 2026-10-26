#!/bin/sh
# Restores an encrypted weekly backup (.github/workflows/backup.yml) into the stack's database,
# grants and RLS policies included, then makes PostgREST reload its schema cache. Run from the repo
# root with the stack up and the database still empty (a fresh volume):
#
#   BACKUP_PASSPHRASE=… sh selfhost/scripts/restore.sh kosh-YYYY-MM-DD.dump.gpg
#
# The passphrase is read from the environment, never from an argument (arguments show up in `ps`).
set -eu
cd "$(dirname "$0")/../.."
dump_gpg=$1
: "${BACKUP_PASSPHRASE:?set BACKUP_PASSPHRASE}"
compose="docker compose -f selfhost/docker-compose.yml"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase-fd 3 \
    --output "$tmp/kosh.dump" "$dump_gpg" 3<<EOF
$BACKUP_PASSPHRASE
EOF

$compose cp "$tmp/kosh.dump" db:/tmp/kosh.dump
# --no-owner: everything belongs to `postgres` here. Grants are kept: they are what lets anon read.
# Errors are collected, not fatal, so one missing role doesn't stop the restore; they're printed
# at the end and the script fails if there were any.
if ! $compose exec -T db pg_restore -U postgres -d postgres --no-owner /tmp/kosh.dump 2>"$tmp/errors.txt"; then
  echo "pg_restore reported errors:" >&2
  cat "$tmp/errors.txt" >&2
  $compose exec -T db rm -f /tmp/kosh.dump
  exit 1
fi
$compose exec -T db rm -f /tmp/kosh.dump
$compose exec -T db psql -U postgres -d postgres -qc "analyze"
$compose restart rest
echo "restored $(basename "$dump_gpg")"

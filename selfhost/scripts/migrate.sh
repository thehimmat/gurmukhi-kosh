#!/bin/sh
# Applies one migration on the server. It's the forced command of GitHub Actions' migrate key
# (selfhost/README.md, "Migrations"), which sends the migration's file name as its SSH command:
#
#   ssh ubuntu@<ip> 087_example.sql
#
# Takes the file from main (fetched, never the working tree), refuses one that isn't there or that
# supabase/APPLIED.md already records, and runs it in one transaction that stops at the first
# error, then reloads PostgREST's schema cache. Recording it in APPLIED.md stays a reviewed commit.
set -eu
name=${SSH_ORIGINAL_COMMAND:-${1:-}}
usage() {
  echo "usage: migrate.sh NNN_name.sql (a file in supabase/migrations on main)" >&2
  exit 2
}
case "$name" in
  *"
"*) usage ;;
esac
printf '%s' "$name" | grep -Eqx '[0-9]{3}_[a-z0-9_]+\.sql' || usage

ref=${KOSH_MIGRATE_REF:-origin/main}
cd "$(dirname "$0")/.."
[ -n "${KOSH_MIGRATE_NO_FETCH:-}" ] || git -C .. fetch -q origin main
path=supabase/migrations/$name
if ! git -C .. cat-file -e "$ref:$path" 2>/dev/null; then
  echo "$name is not in supabase/migrations on main" >&2
  exit 3
fi
if git -C .. show "$ref:supabase/APPLIED.md" | grep -Fq "${name%.sql}"; then
  echo "$name is already applied (supabase/APPLIED.md)" >&2
  exit 4
fi

echo "apply $name ($(git -C .. rev-parse --short "$ref"))"
[ -z "${KOSH_MIGRATE_DRY_RUN:-}" ] || exit 0
git -C .. show "$ref:$path" | docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1
docker compose exec -T db psql -U postgres -d postgres -c "notify pgrst, 'reload schema'"

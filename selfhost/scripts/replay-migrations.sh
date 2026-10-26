#!/bin/sh
# Rehearsal only: builds the schema from the repo's migrations, in the order the shared project ran
# them (tests/db/replay.ts), instead of restoring a production dump. The result has no corpus, just
# what migrations seed. Run from the repo root with the stack up:
#
#   sh selfhost/scripts/replay-migrations.sh
set -eu
cd "$(dirname "$0")/../.."

psql_db() { docker compose -f selfhost/docker-compose.yml exec -T db psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres "$@"; }

npx tsx selfhost/scripts/replay-order.ts |
while read -r file; do
  echo "$file"
  case "$file" in
    # selfhost/sql/roles.sql already made the roles; keep the bootstrap's grants.
    */supabase-bootstrap.sql) grep -v '^create role' "$file" | psql_db ;;
    *) psql_db < "$file" ;;
  esac
done

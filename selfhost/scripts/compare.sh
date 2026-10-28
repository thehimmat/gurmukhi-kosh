#!/bin/sh
# Row counts of every table in public and akhar, here and in another database, side by side, and
# the tables where they differ. Read-only on both. For the cutover: before it, nothing should differ
# from Supabase (or restore again); after it, only tables the apps wrote to since.
#
#   OTHER_DB_URL=… sh selfhost/scripts/compare.sh      (e.g. the Supabase session-pooler URL)
set -eu
cd "$(dirname "$0")/../.."
: "${OTHER_DB_URL:?set OTHER_DB_URL}"
compose() { (cd selfhost && docker compose "$@"); }

# Exact counts, one "schema.table count" line per table, built and run in one session.
counts='
select format($q$select %L, count(*) from %I.%I$q$, schemaname || $s$.$s$ || tablename, schemaname, tablename)
from pg_tables where schemaname in ($s$public$s$, $s$akhar$s$) order by 1 \gexec'

here=$(echo "$counts" | compose exec -T db psql -U postgres -d postgres -AtF' ' -q)
there=$(echo "$counts" | compose exec -T -e OTHER_DB_URL db sh -c 'psql "$OTHER_DB_URL" -AtF" " -q')

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "$here" > "$tmp/here"
echo "$there" > "$tmp/there"
diff=$(join -a1 -a2 -e missing -o 0,1.2,2.2 "$tmp/here" "$tmp/there" | awk '$2 != $3')
echo "$(echo "$here" | wc -l) tables here, $(echo "$there" | wc -l) there"
if [ -z "$diff" ]; then
  echo "every table has the same row count"
else
  echo "differ (table, here, there):"
  echo "$diff"
  exit 1
fi

#!/bin/sh
# Every table in public and akhar, here and in another database: row count and a checksum of the
# rows' contents, side by side, and the tables where either differs. Read-only on both. For the
# cutover: before it, nothing should differ from Supabase (or restore again); after it, only
# tables the apps wrote to since.
#
#   OTHER_DB_URL=… sh selfhost/scripts/compare.sh      (e.g. the Supabase session-pooler URL)
#
# The checksum is an md5 over each row's md5, sorted, so it needs no primary key and ignores row
# order. The session settings below fix how values print, so equal rows hash equally on both.
set -eu
cd "$(dirname "$0")/../.."
: "${OTHER_DB_URL:?set OTHER_DB_URL}"
compose() { (cd selfhost && docker compose "$@"); }

# One "schema.table count checksum" line per table, built and run in one session.
sums='
set timezone to $s$UTC$s$;
set datestyle to $s$ISO, MDY$s$;
set intervalstyle to $s$postgres$s$;
set extra_float_digits to 1;
set bytea_output to $s$hex$s$;
set statement_timeout to 0;
select format(
  $q$select %L, count(*), md5(coalesce(string_agg(h, $e$$e$ order by h), $e$$e$)) from (select md5(t::text) h from %I.%I t) x$q$,
  schemaname || $s$.$s$ || tablename, schemaname, tablename)
from pg_tables where schemaname in ($s$public$s$, $s$akhar$s$) order by 1 \gexec'

here=$(echo "$sums" | compose exec -T db psql -U postgres -d postgres -AtF' ' -q)
there=$(echo "$sums" | compose exec -T -e OTHER_DB_URL db sh -c 'psql "$OTHER_DB_URL" -AtF" " -q')

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "$here" > "$tmp/here"
echo "$there" > "$tmp/there"
diff=$(join -a1 -a2 -e missing -o 0,1.2,2.2,1.3,2.3 "$tmp/here" "$tmp/there" |
  awk '$2 != $3 || $4 != $5 { print $1, $2, $3, ($4 == $5 ? "same contents" : "contents differ") }')
echo "$(echo "$here" | wc -l) tables here, $(echo "$there" | wc -l) there"
if [ -z "$diff" ]; then
  echo "every table has the same rows (count and contents)"
else
  echo "differ (table, rows here, rows there, contents):"
  echo "$diff"
  exit 1
fi

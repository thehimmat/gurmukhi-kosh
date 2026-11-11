#!/bin/sh
# Loads dictionary entries (written by writeLoadDir: 0001.sql…, verify.sql, expected.txt) into the
# self-hosted database, one directory at a time, and checks each against its expected n and
# checksum. Stops at the first mismatch. Run from your Mac (it uses your SSH key); re-running a
# directory is safe, the load upserts.
#
#   sh selfhost/scripts/load-entries.sh pipeline/cologne/output/mw72 pipeline/sikhri/output/sql
#
# KOSH_SSH overrides the server (default ubuntu@141.148.39.45). KOSH_PSQL replaces the whole psql
# command (it reads SQL on stdin); the tests use it to stand in for the server.
set -eu
: "${KOSH_SSH:=ubuntu@141.148.39.45}"

psql_remote() {
  if [ -n "${KOSH_PSQL:-}" ]; then
    $KOSH_PSQL
  else
    ssh "$KOSH_SSH" 'cd /opt/kosh/selfhost && docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -tA'
  fi
}

[ $# -gt 0 ] || { echo "usage: $0 <load dir>..." >&2; exit 2; }

for dir in "$@"; do
  name=$(basename "$dir")
  echo "== $name"
  [ -f "$dir/expected.txt" ] || { echo "$dir: no expected.txt (regenerate with the loader)" >&2; exit 2; }
  expected=$(cat "$dir/expected.txt")
  files=$(ls "$dir" | grep -E '^[0-9]+\.sql$' | sort)
  [ -n "$files" ] || { echo "$dir: no numbered .sql files" >&2; exit 2; }

  links=$(for f in $files; do cat "$dir/$f"; done | psql_remote | tail -1)
  echo "links proposed: $links"

  got=$(psql_remote < "$dir/verify.sql" | tail -1)
  n=${got%%|*}
  sum=${got#*|}
  if [ "$got" = "$expected" ]; then
    echo "$name: n=$n checksum=$sum OK"
  else
    echo "$name: MISMATCH — expected $expected, got $got" >&2
    exit 1
  fi
done
echo "All loaded and verified."

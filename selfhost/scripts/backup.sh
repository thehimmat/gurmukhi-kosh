#!/bin/sh
# Nightly backup on the server (kosh-backup.timer, installed by server-setup.sh): the same dump as
# .github/workflows/backup.yml makes, encrypted with the same passphrase, kept 14 days in
# selfhost/backups/. latest.dump.gpg is what the gateway serves to that workflow, which keeps the
# offsite copies. Restore one with restore.sh --gpg.
#
# The passphrase is read from selfhost/backup.pass (mode 600), never from the environment or an
# argument. Without it, this fails loudly rather than writing an unencrypted dump.
set -eu
cd "$(dirname "$0")/../.."
pass=selfhost/backup.pass
dir=selfhost/backups
keep_days=14
test -s "$pass" || { echo "backup.sh: $pass is missing; see selfhost/README.md" >&2; exit 1; }

mkdir -p "$dir"
name="kosh-$(date -u +%Y-%m-%d).dump.gpg"
tmp="$dir/.$name.partial"
trap 'rm -f "$tmp"' EXIT

(cd selfhost && docker compose exec -T db pg_dump -U postgres -d postgres --format=custom \
    --schema=public --schema=akhar --schema=supabase_migrations) |
  gpg --batch --yes --pinentry-mode loopback --symmetric --cipher-algo AES256 \
      --passphrase-file "$pass" --output "$tmp"

# A dump that failed part-way is short (production's is ~50 MB): refuse anything implausibly small.
size=$(wc -c < "$tmp")
test "$size" -gt 20000000 || { echo "backup.sh: dump is only $size bytes" >&2; exit 1; }

chmod 644 "$tmp" # the gateway's container reads it; it's encrypted
mv "$tmp" "$dir/$name"
ln -f "$dir/$name" "$dir/latest.dump.gpg"
find "$dir" -name 'kosh-*.dump.gpg' -mtime +"$keep_days" -delete
echo "backup.sh: $name, $((size / 1048576)) MB"

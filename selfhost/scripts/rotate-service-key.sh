#!/bin/sh
# Replaces the service key with a new one (same JWT secret, so the anon key and the apps' anon
# settings are untouched) and reloads the gateway, which from then on refuses the old key. Prints
# nothing secret: read the new key with
#   grep ^SERVICE_KEY= /opt/kosh/selfhost/.env | cut -d= -f2
# and put it in Vercel (gurmukhi-kosh's SUPABASE_SERVICE_ROLE_KEY) and any local .env.local.
set -eu
cd "$(dirname "$0")/.."
secret=$(grep '^JWT_SECRET=' .env | cut -d= -f2)
test -n "$secret"
old=$(grep '^SERVICE_KEY=' .env | cut -d= -f2)
# mint-keys.mjs signs with JWT_SECRET when it's set; iat makes the new key differ from the old.
sleep 1
new=$(docker run --rm -e JWT_SECRET="$secret" -v "$PWD/scripts:/s:ro" node:22-alpine node /s/mint-keys.mjs |
  sed -n 's/^SERVICE_KEY=//p')
test -n "$new" && test "$new" != "$old"
sed -i "s|^SERVICE_KEY=.*|SERVICE_KEY=$new|" .env
docker compose up -d gateway >/dev/null 2>&1
echo "service key replaced; the old one is refused from now on"

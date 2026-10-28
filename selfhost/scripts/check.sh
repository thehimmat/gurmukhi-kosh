#!/bin/sh
# Runs the test suite on the server against its own stack, so the service key never leaves the box:
# the gateway parity tests plus every live test, through the public HTTPS address when SITE_ADDRESS
# is a domain (that also proves the certificate), else through the local port. Prints a summary.
#
#   sh selfhost/scripts/check.sh
set -eu
cd "$(dirname "$0")/../.."
set -a
. selfhost/.env
set +a
case "${SITE_ADDRESS:-:8000}" in
  :*) url=http://localhost:8000 ;;
  *) url=https://$SITE_ADDRESS ;;
esac

# tests/db/ is skipped: those replay migrations into an in-process PGlite, never touch this stack,
# and run in CI; on the VM's two cores their setup outruns Vitest's hook timeout.
# Tests that call the deployed Vercel site (tests/api.test.ts "production", the stories' PROD_BASE)
# still run; they test the apps, not this stack.
docker run --rm --network host -v "$PWD:/app" -w /app \
  -e SELFHOST_URL="$url" -e SELFHOST_ANON_KEY="$ANON_KEY" -e SELFHOST_SERVICE_KEY="$SERVICE_KEY" -e SELFHOST_JWT_SECRET="$JWT_SECRET" \
  -e NEXT_PUBLIC_SUPABASE_URL="$url" -e NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  node:22 sh -c 'npm ci --silent --no-audit --no-fund >/dev/null && npx vitest run --exclude "tests/db/**" --exclude "**/node_modules/**" 2>&1 | grep -E "^ (FAIL|✓ tests/selfhost)| Test Files | Tests " | sort -u'

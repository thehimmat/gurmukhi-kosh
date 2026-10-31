#!/bin/sh
# Deploys one app (or only selfhost/ config) on the server. It's the forced command of GitHub
# Actions' deploy key (selfhost/README.md, "The apps"), which sends the target as its SSH command:
#
#   ssh ubuntu@<ip> kosh            # or search, or selfhost
#
# Updates /opt/kosh to main (compose files, Caddy sites), pulls the app's latest image, and brings
# the stack up, waiting for health checks. Caddy reloads its config in place.
set -eu
target=${SSH_ORIGINAL_COMMAND:-${1:-}}
case "$target" in
  kosh | search | selfhost) ;;
  *)
    echo "usage: deploy.sh kosh|search|selfhost" >&2
    exit 2
    ;;
esac
echo "deploy $target"
[ -z "${KOSH_DEPLOY_DRY_RUN:-}" ] || exit 0

cd "$(dirname "$0")/.."
git -C .. fetch -q origin main
git -C .. checkout -q -B main origin/main
[ "$target" = selfhost ] || docker compose pull -q "$target"
docker compose up -d --quiet-pull --wait
docker compose exec -T gateway caddy reload --config /etc/caddy/Caddyfile
docker image prune -f >/dev/null
docker compose ps --format '{{.Service}}: {{.Status}}'

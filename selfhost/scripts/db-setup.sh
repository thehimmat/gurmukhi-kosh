#!/bin/bash
# The database's half of setting up the server (as the `ubuntu` user): this checkout, secrets, the
# api-edge network, the stack, roles and the nightly backup. Safe to re-run. The host itself (Docker,
# firewall, swap) and the gateway are thehimmat/atthebunga-server's scripts/host-setup.sh; run that
# first (its README, "A new server"). From a Mac:
#
#   ssh ubuntu@<ip> 'curl -fsSL https://raw.githubusercontent.com/thehimmat/gurmukhi-kosh/main/selfhost/scripts/db-setup.sh | bash -s -- <api-domain>'
#
# <api-domain> is the API's public name (the gateway's SITE_ADDRESS), e.g. 141-148-39-45.sslip.io;
# scripts/check.sh tests through it.
set -euo pipefail
site=${1:?usage: db-setup.sh <api-domain>}
branch=${KOSH_BRANCH:-main}
dir=/opt/kosh

echo "== code ($branch)"
sudo install -d -o ubuntu -g ubuntu "$dir"
if [ -d "$dir/.git" ]; then
  git -C "$dir" fetch -q origin "$branch" && git -C "$dir" checkout -q -B "$branch" "origin/$branch"
else
  git clone -q --branch "$branch" https://github.com/thehimmat/gurmukhi-kosh.git "$dir"
fi

echo "== secrets (selfhost/.env, made once, never printed)"
env_file=$dir/selfhost/.env
if [ ! -f "$env_file" ]; then
  (umask 077 && : > "$env_file")
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "AUTHENTICATOR_PASSWORD=$(openssl rand -hex 24)"
    echo "PG_SHARED_BUFFERS=3GB"
    echo "PG_EFFECTIVE_CACHE_SIZE=8GB"
    echo "SITE_ADDRESS=$site"
    sudo docker run --rm -v "$dir/selfhost/scripts:/s:ro" node:22-alpine node /s/mint-keys.mjs
  } >> "$env_file"
else
  sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$site|" "$env_file"
  # Left from when this folder ran the gateway and the apps too (before atthebunga-server): those
  # compose files are gone, and Compose would fail on a COMPOSE_FILE that names them.
  sed -i '/^COMPOSE_FILE=/d; /^GATEWAY_PORTS=/d' "$env_file"
fi
# Added after the first server was set up, so appended when missing.
grep -q '^BACKUP_TOKEN=' "$env_file" || echo "BACKUP_TOKEN=$(openssl rand -hex 24)" >> "$env_file"
if ! grep -q '^AKHAR_KEY=' "$env_file"; then
  sudo docker run --rm -e JWT_SECRET="$(grep '^JWT_SECRET=' "$env_file" | cut -d= -f2)" \
      -v "$dir/selfhost/scripts:/s:ro" node:22-alpine node /s/mint-keys.mjs | grep '^AKHAR_KEY=' >> "$env_file"
fi

echo "== nightly backup (03:30 UTC, scripts/backup.sh)"
install -d "$dir/selfhost/backups"
sudo tee /etc/systemd/system/kosh-backup.service >/dev/null <<UNIT
[Unit]
Description=Nightly encrypted backup of the kosh database
After=docker.service

[Service]
Type=oneshot
User=ubuntu
ExecStart=/bin/sh $dir/selfhost/scripts/backup.sh
UNIT
sudo tee /etc/systemd/system/kosh-backup.timer >/dev/null <<'UNIT'
[Unit]
Description=Nightly encrypted backup of the kosh database

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now kosh-backup.timer

echo "== api-edge (the one network PostgREST shares with the gateway)"
sudo docker network inspect api-edge >/dev/null 2>&1 || sudo docker network create api-edge >/dev/null

echo "== stack"
cd "$dir/selfhost"
sudo docker compose up -d --quiet-pull --wait
# Roles and grants (sql/roles.sql, idempotent) on every run, so a server picks up new ones; then
# PostgREST reloads what each role may see.
sudo docker compose exec -T db psql -U postgres -v ON_ERROR_STOP=1 -q \
    -v auth_pw="$(grep '^AUTHENTICATOR_PASSWORD=' .env | cut -d= -f2)" -f /selfhost/sql/roles.sql
sudo docker compose exec -T db psql -U postgres -q -c "notify pgrst, 'reload schema'"
sudo docker compose ps --format '{{.Service}}: {{.Status}}'
echo
echo "Done. Public anon key (safe to share; it ships to browsers):"
grep '^ANON_KEY=' "$env_file" | cut -d= -f2
if [ ! -s "$dir/selfhost/backup.pass" ]; then
  echo
  echo "Backups are not on yet: selfhost/backup.pass is missing (selfhost/README.md, Backups)."
fi

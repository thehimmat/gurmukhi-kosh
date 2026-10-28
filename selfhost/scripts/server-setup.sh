#!/bin/bash
# One-time setup of the Oracle VM (Ubuntu 24.04, as the `ubuntu` user). Safe to re-run. From a Mac:
#
#   ssh ubuntu@<ip> 'curl -fsSL https://raw.githubusercontent.com/thehimmat/gurmukhi-kosh/main/selfhost/scripts/server-setup.sh | bash -s -- <api-domain>'
#
# <api-domain> is the name Caddy gets a TLS certificate for, e.g. api.example.org, pointing at the
# VM. Without one, use <ip-with-dashes>.sslip.io (e.g. 141-148-39-45.sslip.io), which resolves to the
# IP with no DNS setup.
set -euo pipefail
site=${1:?usage: server-setup.sh <api-domain>}
branch=${KOSH_BRANCH:-main}
dir=/opt/kosh

echo "== packages and automatic security updates"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get -y -qq full-upgrade
sudo DEBIAN_FRONTEND=noninteractive apt-get -y -qq install docker.io docker-compose-v2 git unattended-upgrades gnupg
# Security updates install daily; a kernel update reboots at 04:30 UTC, and the stack restarts itself.
sudo tee /etc/apt/apt.conf.d/52kosh-unattended >/dev/null <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF
sudo systemctl enable --now unattended-upgrades docker
sudo usermod -aG docker ubuntu # takes effect from the next SSH login

echo "== firewall: ports 80 and 443 (Oracle's image rejects everything but SSH)"
for port in 443 80; do
  if ! sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    reject=$(sudo iptables -L INPUT --line-numbers | awk '/REJECT/ {print $1; exit}')
    sudo iptables -I INPUT "${reject:-1}" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  fi
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null; fi

echo "== swap (2 GB, for pg_restore and index builds)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap -q /swapfile && sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

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
    echo "COMPOSE_FILE=docker-compose.yml:docker-compose.server.yml"
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "AUTHENTICATOR_PASSWORD=$(openssl rand -hex 24)"
    echo "PG_SHARED_BUFFERS=3GB"
    echo "PG_EFFECTIVE_CACHE_SIZE=8GB"
    echo "GATEWAY_PORTS=127.0.0.1:8000:8000"
    echo "SITE_ADDRESS=$site"
    sudo docker run --rm -v "$dir/selfhost/scripts:/s:ro" node:22-alpine node /s/mint-keys.mjs
  } >> "$env_file"
else
  sed -i "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$site|" "$env_file"
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

echo "== stack"
# From inside selfhost/: Compose reads COMPOSE_FILE from .env relative to where it runs.
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

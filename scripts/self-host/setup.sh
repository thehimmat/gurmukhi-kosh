#!/usr/bin/env bash
# Self-hosted Postgres 17 + PostgREST + Caddy for gurmukhi-kosh, in place of Supabase.
# See docs/self-hosting.md for the why, the measured numbers, and the cut-over / rollback plan.
#
# Usage (run from the repo root, as a user with sudo; never as root on macOS):
#   scripts/self-host/setup.sh install     # packages: Postgres 17, PostgREST, Caddy, cloudflared
#   scripts/self-host/setup.sh init        # database, roles, extensions, secrets, configs, API keys
#   scripts/self-host/setup.sh restore kosh-YYYY-MM-DD.dump.gpg   # load the weekly encrypted backup
#   scripts/self-host/setup.sh replay      # OR: empty schema from supabase/migrations ...
#   scripts/self-host/setup.sh copy        # ... then rows over the REST API (needs SRC_URL, SRC_KEY)
#   scripts/self-host/setup.sh refresh     # rebuild derived tables + materialized views
#   scripts/self-host/setup.sh services    # start PostgREST + Caddy now and at every boot
#   scripts/self-host/setup.sh check       # smoke test through the proxy with both keys
#
# Platforms:
#   Ubuntu 22.04 / 24.04 (a ~$5 VPS, or the old MacBook with Ubuntu installed; Linux is the better
#     choice on a 2015 MacBook Pro: macOS 12 Monterey is the newest it gets, and Homebrew has
#     dropped Monterey to "unsupported", so bottles stop coming and formulae build from source).
#     Postgres 17 from the PGDG apt repo, PostgREST's static binary from GitHub releases, Caddy and
#     cloudflared from their apt repos; services are systemd units.
#   macOS (Monterey or later, Intel or Apple silicon): Homebrew's postgresql@17, postgrest, caddy,
#     cloudflared; services are launchd agents in ~/Library/LaunchAgents. Keep the Mac from
#     sleeping (System Settings > Battery > Options > "Prevent automatic sleeping on power adapter
#     when the display is off", or `sudo pmset -c sleep 0`) and set "Start up automatically after a
#     power failure" (`sudo pmset autorestart 1`).
#
# Everything this script writes lives under $PREFIX (default ~/kosh-db): etc/ (configs, secrets),
# log/. Postgres keeps its own data directory (brew: $(brew --prefix)/var/postgresql@17; apt:
# /var/lib/postgresql/17/main).
set -euo pipefail

PREFIX="${PREFIX:-$HOME/kosh-db}"
DB_NAME="${DB_NAME:-kosh}"
DB_HOST="${DB_HOST:-127.0.0.1}"
PGRST_VERSION="${PGRST_VERSION:-v12.2.8}"
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SECRETS="$PREFIX/etc/secrets.env"

# SETUP_OS=macos also suits any Postgres reached over TCP as a superuser (PGUSER/PGPASSWORD set),
# e.g. the docker-compose.yml database.
os() { [[ -n "${SETUP_OS:-}" ]] && { echo "$SETUP_OS"; return; }; [[ "$(uname -s)" == Darwin ]] && echo macos || echo ubuntu; }
log() { printf '\033[1m==> %s\033[0m\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

# psql as the database superuser, on the app database.
su_psql() {
  if [[ "$(os)" == macos ]]; then
    # Homebrew's initdb makes the installing user the superuser.
    psql -X -v ON_ERROR_STOP=1 -h "$DB_HOST" -d "$DB_NAME" "$@"
  else
    sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d "$DB_NAME" "$@"
  fi
}

load_secrets() {
  [[ -f "$SECRETS" ]] || die "no $SECRETS: run '$0 init' first"
  # shellcheck disable=SC1090
  source "$SECRETS"
}

cmd_install() {
  if [[ "$(os)" == macos ]]; then
    command -v brew >/dev/null || die "install Homebrew first: https://brew.sh"
    brew install postgresql@17 postgrest caddy cloudflared gnupg
    brew link --force postgresql@17
    # Tuned for 8-16 GB RAM: the database is ~0.9 GB, so it all fits in cache.
    local conf
    conf="$(brew --prefix)/var/postgresql@17/postgresql.conf"
    grep -q '^# kosh' "$conf" || cat >> "$conf" <<'EOF'
# kosh
listen_addresses = 'localhost'
shared_buffers = 1GB
effective_cache_size = 4GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_wal_size = 2GB
EOF
    brew services restart postgresql@17
  else
    sudo apt-get update -qq
    sudo apt-get install -y -qq curl ca-certificates gnupg lsb-release debian-keyring debian-archive-keyring apt-transport-https
    # Postgres 17 (PGDG: Ubuntu's own archive has 16 on 24.04, 14 on 22.04).
    sudo install -d /usr/share/postgresql-common/pgdg
    sudo curl -fsSo /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
      | sudo tee /etc/apt/sources.list.d/pgdg.list >/dev/null
    # Caddy.
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    # cloudflared (only needed for the home-server option).
    sudo mkdir -p --mode=0755 /usr/share/keyrings
    curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
    echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
      | sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
    sudo apt-get update -qq
    sudo apt-get install -y -qq postgresql-17 caddy cloudflared
    # PostgREST: static binary (no apt package).
    local arch
    case "$(uname -m)" in x86_64) arch=linux-static-x86-64 ;; aarch64) arch=ubuntu-aarch64 ;; *) die "no PostgREST build for $(uname -m)" ;; esac
    curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/${PGRST_VERSION}/postgrest-${PGRST_VERSION}-${arch}.tar.xz" \
      | sudo tar -xJ -C /usr/local/bin postgrest
    # 1 GB VPS: shared_buffers 256MB; the corpus tables still mostly sit in the OS page cache.
    # On a 2015 MacBook Pro with Linux (8-16 GB), use the macOS block's values instead.
    sudo tee /etc/postgresql/17/main/conf.d/kosh.conf >/dev/null <<'EOF'
listen_addresses = 'localhost'
shared_buffers = 256MB
effective_cache_size = 768MB
work_mem = 8MB
maintenance_work_mem = 128MB
max_wal_size = 2GB
EOF
    # Caddy's apt package starts its own service on :80 with a default config; ours replaces it.
    sudo systemctl disable --now caddy || true
    sudo systemctl restart postgresql
  fi
  psql --version
  postgrest --version
  caddy version
}

cmd_init() {
  mkdir -p "$PREFIX/etc" "$PREFIX/log"
  chmod 700 "$PREFIX/etc"
  if [[ ! -f "$SECRETS" ]]; then
    log "generating secrets in $SECRETS"
    local pw jwt
    pw="$(openssl rand -hex 24)"
    jwt="$(openssl rand -hex 32)"
    {
      echo "AUTHENTICATOR_PASSWORD=$pw"
      echo "JWT_SECRET=$jwt"
      JWT_SECRET="$jwt" node "$HERE/mint-jwt.mjs"
    } > "$SECRETS"
    chmod 600 "$SECRETS"
  fi
  load_secrets

  log "creating database $DB_NAME"
  if [[ "$(os)" == macos ]]; then
    createdb -h "$DB_HOST" "$DB_NAME" 2>/dev/null || true
  else
    # A superuser role for this login user, so psql, pg_restore and the copy script work over the
    # local socket (peer auth) without sudo, as on macOS.
    sudo -u postgres createuser --superuser "$USER" 2>/dev/null || true
    sudo -u postgres createdb "$DB_NAME" 2>/dev/null || true
  fi

  log "roles, schemas, extensions (bootstrap.sql)"
  su_psql -q -v authenticator_password="'$AUTHENTICATOR_PASSWORD'" -f - < "$HERE/bootstrap.sql"

  log "writing $PREFIX/etc/postgrest.conf and Caddyfile"
  sed -e "s|@@AUTHENTICATOR_PASSWORD@@|$AUTHENTICATOR_PASSWORD|" -e "s|@@DB_HOST@@|$DB_HOST|" \
      -e "s|@@DB_NAME@@|$DB_NAME|" -e "s|@@JWT_SECRET@@|$JWT_SECRET|" \
      "$HERE/postgrest.conf.template" > "$PREFIX/etc/postgrest.conf"
  chmod 600 "$PREFIX/etc/postgrest.conf"
  cp "$HERE/Caddyfile" "$PREFIX/etc/Caddyfile"

  cat <<EOF

The app's new environment (Vercel, or .env.local) — values are in $SECRETS:
  NEXT_PUBLIC_SUPABASE_URL=https://<your tunnel or VPS hostname>
  NEXT_PUBLIC_SUPABASE_ANON_KEY=\$ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY=\$SERVICE_ROLE_KEY
EOF
}

# Restore the weekly encrypted pg_dump (supabase/BACKUP.md) into the bootstrapped database.
cmd_restore() {
  local enc="${1:-}"
  [[ -f "$enc" ]] || die "usage: $0 restore kosh-YYYY-MM-DD.dump.gpg (download it from the backup workflow's artifacts)"
  local dump="$PREFIX/restore.dump"
  log "decrypting (asks for BACKUP_PASSPHRASE)"
  gpg --decrypt --output "$dump" "$enc"
  # The dump names Supabase-only roles in its grants and default privileges: supabase_admin (owner
  # of some objects and default ACLs) and akhar_writer (the akhar annotation tool's writer role).
  # Stub them as NOLOGIN so those statements apply instead of erroring. --no-owner makes the
  # restoring superuser own everything, as `postgres` does on Supabase.
  su_psql -q <<'EOF'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'akhar_writer') then create role akhar_writer nologin; end if;
end $$;
EOF
  log "pg_restore (several minutes on old hardware)"
  local target
  if [[ "$(os)" == macos ]]; then target=(-h "$DB_HOST"); else target=(); fi
  # pg_trgm already exists (bootstrap.sql), so the dump's CREATE EXTENSION reports an error that is
  # harmless; --exit-on-error is therefore off and the log is checked for anything else.
  pg_restore --no-owner "${target[@]}" --dbname "$DB_NAME" "$dump" 2> "$PREFIX/log/restore.log" || true
  grep -E 'error' "$PREFIX/log/restore.log" | grep -vE 'extension "pg_trgm" already exists|schema "public" already exists' || true
  rm -f "$dump"
  su_psql -c "analyze"
  su_psql -c "notify pgrst, 'reload schema'"
}

cmd_replay() {
  log "replaying supabase/migrations in ledger order"
  su_psql -q -f - < "$HERE/default-privileges.sql"
  (cd "$REPO" && npx tsx scripts/self-host/replay-order.ts) | while read -r f; do
    su_psql -q -f - < "$REPO/$f" > /dev/null
  done
  su_psql -c "notify pgrst, 'reload schema'"
}

cmd_copy() {
  : "${SRC_URL:?set SRC_URL=https://<ref>.supabase.co}"
  : "${SRC_KEY:?set SRC_KEY to the service-role key of the source project}"
  local env=(PGDATABASE="$DB_NAME")
  if [[ "$(os)" == macos ]]; then env+=(PGHOST="$DB_HOST"); fi
  (cd "$REPO" && env "${env[@]}" npx tsx scripts/self-host/copy-from-supabase.ts "$@")
}

cmd_refresh() {
  log "refreshing derived tables and materialized views"
  su_psql -f - < "$HERE/refresh.sql"
}

cmd_services() {
  load_secrets
  local pgrst caddy
  pgrst="$(command -v postgrest)"
  caddy="$(command -v caddy)"
  if [[ "$(os)" == macos ]]; then
    local agents="$HOME/Library/LaunchAgents"
    mkdir -p "$agents"
    for name in postgrest caddy; do
      sed -e "s|@@PREFIX@@|$PREFIX|g" -e "s|@@POSTGREST@@|$pgrst|g" -e "s|@@CADDY@@|$caddy|g" \
        "$HERE/services/org.gurmukhikosh.$name.plist" > "$agents/org.gurmukhikosh.$name.plist"
      launchctl bootout "gui/$(id -u)/org.gurmukhikosh.$name" 2>/dev/null || true
      launchctl bootstrap "gui/$(id -u)" "$agents/org.gurmukhikosh.$name.plist"
    done
    # LaunchAgents start at login: enable automatic login (System Settings > Users & Groups) so a
    # reboot after a power cut brings the API back unattended. brew services runs Postgres the same way.
    brew services start postgresql@17
  else
    for name in kosh-postgrest kosh-caddy; do
      sed -e "s|@@PREFIX@@|$PREFIX|g" -e "s|@@POSTGREST@@|$pgrst|g" -e "s|@@CADDY@@|$caddy|g" -e "s|@@USER@@|$USER|g" \
        "$HERE/services/$name.service" | sudo tee "/etc/systemd/system/$name.service" >/dev/null
    done
    sudo systemctl daemon-reload
    sudo systemctl enable --now postgresql kosh-postgrest kosh-caddy
  fi
}

cmd_check() {
  load_secrets
  local base="${BASE:-http://127.0.0.1:8000}"
  local q="sources?select=id,code&order=id"
  echo "anon:    $(curl -fsS "$base/rest/v1/$q" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | tr -d '\n ')"
  echo "service: $(curl -fsS "$base/rest/v1/$q" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" | tr -d '\n ')"
  echo "(anon must not list gur_sobha_iss; service must)"
}

case "${1:-}" in
  install) cmd_install ;;
  init) cmd_init ;;
  restore) shift; cmd_restore "$@" ;;
  replay) cmd_replay ;;
  copy) shift; cmd_copy "$@" ;;
  refresh) cmd_refresh ;;
  services) cmd_services ;;
  check) cmd_check ;;
  *) sed -n '2,35p' "$0"; exit 1 ;;
esac

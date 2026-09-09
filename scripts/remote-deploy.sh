#!/usr/bin/env bash
# Production deploy on the VPS. GitHub Actions builds dist/, then this script
# pulls code, installs server deps, unpacks dist, and restarts root-owned PM2 apps.
#
# Usage (on the server):
#   ./scripts/remote-deploy.sh
#   DIST_TARBALL=/tmp/canam-co-in-new/dist.tar.gz ./scripts/remote-deploy.sh
#
# PM2 processes run as root — always use sudo pm2.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/topteen77/canam-co-in-new.git}"
CRM_API_NAME="${CRM_API_NAME:-new-crm-api}"
CRM_WEB_NAME="${CRM_WEB_NAME:-new-crm-web}"
DIST_TARBALL="${DIST_TARBALL:-}"
SKIP_GIT="${SKIP_GIT:-0}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Root-owned PM2 (sudo pm2 status / restart / logs)
PM2=()
resolve_pm2() {
  local bin
  for bin in pm2 /usr/local/bin/pm2 /usr/bin/pm2; do
    if sudo -n "$bin" ping >/dev/null 2>&1; then
      PM2=(sudo -n "$bin")
      return 0
    fi
  done
  die "Cannot run 'sudo pm2' without a password. On the server, allow the deploy user to run pm2 as root (see DEPLOY.md)."
}

restart_pm2() {
  local name="$1"
  if "${PM2[@]}" describe "$name" >/dev/null 2>&1; then
    log "sudo pm2 restart $name"
    "${PM2[@]}" restart "$name"
  else
    die "PM2 process '$name' not found. Start it once as root, e.g. sudo pm2 start ecosystem.config.cjs --only $name"
  fi
}

[[ -d "$ROOT/.git" ]] || die "Not a git checkout: $ROOT"

if [[ "$SKIP_GIT" != "1" ]]; then
  log "Fetching $BRANCH from origin..."
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
  git fetch --prune origin
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

if [[ -n "$DIST_TARBALL" ]]; then
  [[ -f "$DIST_TARBALL" ]] || die "Dist archive not found: $DIST_TARBALL"
  log "Unpacking frontend build from $DIST_TARBALL"
  rm -rf "$ROOT/dist"
  mkdir -p "$ROOT/dist"
  tar -xzf "$DIST_TARBALL" -C "$ROOT"
  [[ -f "$ROOT/dist/index.html" ]] || die "dist/index.html missing after unpack — archive layout is wrong"
else
  log "No DIST_TARBALL set; keeping existing dist/ (GitHub Actions should upload a fresh build)"
  [[ -f "$ROOT/dist/index.html" ]] || die "dist/ is missing. Re-run the GitHub deploy workflow so it uploads the frontend build."
fi

log "Installing frontend dependencies (needed for vite preview)..."
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

log "Installing server dependencies..."
(
  cd "$ROOT/server"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
)

if [[ ! -e "$ROOT/server/.env" && -f "$ROOT/.env" ]]; then
  ln -sfn ../.env "$ROOT/server/.env"
  log "Linked server/.env -> ../.env"
fi

mkdir -p "$ROOT/logs"

resolve_pm2
log "Using: ${PM2[*]}"

restart_pm2 "$CRM_API_NAME"
restart_pm2 "$CRM_WEB_NAME"
"${PM2[@]}" save >/dev/null 2>&1 || true

log "PM2 status:"
"${PM2[@]}" list

log "Checking local ports..."
web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3001/ || true)"
api_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:5002/api/auth/me || true)"
log "Frontend :3001 HTTP $web_code (expect 200)"
log "Backend  :5002 HTTP $api_code (expect 401/200 — process is up)"

if [[ "$web_code" != "200" && "$web_code" != "304" ]]; then
  die "Frontend did not respond on port 3001 (HTTP $web_code). Check: sudo pm2 logs $CRM_WEB_NAME"
fi
if [[ -z "$api_code" || "$api_code" == "000" ]]; then
  die "Backend did not respond on port 5002. Check: sudo pm2 logs $CRM_API_NAME"
fi

log "Deploy complete"

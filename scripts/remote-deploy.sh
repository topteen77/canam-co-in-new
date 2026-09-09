#!/usr/bin/env bash
# Production deploy on the VPS. GitHub Actions builds dist/, then this script
# pulls code, installs server deps, unpacks dist, and restarts root-owned PM2 apps.
#
# Fail-safe: the live site (current dist/ + running PM2) is left untouched until
# the new frontend archive is valid AND npm ci succeeds. If a later step fails,
# this script rolls back git + dist and restarts PM2 so the previous site stays up.
#
# Usage (on the server, as user dev):
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

STAGING_ROOT="$ROOT/.deploy/staging"
BACKUP_DIST="$ROOT/.deploy/dist.prev"
PREV_SHA=""
CUTOVER=0
PM2=()

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

resolve_pm2() {
  local bin
  for bin in pm2 /usr/local/bin/pm2 /usr/bin/pm2; do
    if sudo -n "$bin" ping >/dev/null 2>&1; then
      PM2=(sudo -n "$bin")
      return 0
    fi
  done
  die "Cannot run 'sudo pm2' without a password. On the server, allow user dev to run pm2 as root (see DEPLOY.md)."
}

restart_pm2() {
  local name="$1"
  if "${PM2[@]}" describe "$name" >/dev/null 2>&1; then
    log "sudo pm2 restart $name"
    "${PM2[@]}" restart "$name"
  else
    log "PM2 process '$name' not found"
    return 1
  fi
}

restart_all_pm2() {
  restart_pm2 "$CRM_API_NAME"
  restart_pm2 "$CRM_WEB_NAME"
  "${PM2[@]}" save >/dev/null 2>&1 || true
}

restore_previous_dist() {
  if [[ -d "$BACKUP_DIST" ]]; then
    log "Restoring previous dist/"
    rm -rf "$ROOT/dist"
    mv "$BACKUP_DIST" "$ROOT/dist"
  fi
}

rollback_keep_live_site() {
  local reason="${1:-deploy failed}"
  log "KEEPING LIVE SITE. Rollback: $reason"

  if [[ -n "$PREV_SHA" ]]; then
    git reset --hard "$PREV_SHA" || true
  fi
  restore_previous_dist

  if [[ "$CUTOVER" -eq 1 && ${#PM2[@]} -gt 0 ]]; then
    log "Restarting PM2 on previous release"
    restart_pm2 "$CRM_API_NAME" || true
    restart_pm2 "$CRM_WEB_NAME" || true
  fi

  die "$reason — previous site restored"
}

[[ -d "$ROOT/.git" ]] || die "Not a git checkout: $ROOT"

PREV_SHA="$(git rev-parse HEAD)"
log "Current live commit: $PREV_SHA"
mkdir -p "$ROOT/.deploy"

NEW_DIST=""
if [[ -n "$DIST_TARBALL" ]]; then
  [[ -f "$DIST_TARBALL" ]] || die "Dist archive not found: $DIST_TARBALL — live site unchanged"

  log "Validating frontend build at $DIST_TARBALL (live dist/ not touched yet)"
  rm -rf "$STAGING_ROOT"
  mkdir -p "$STAGING_ROOT"
  tar -xzf "$DIST_TARBALL" -C "$STAGING_ROOT"

  if [[ -f "$STAGING_ROOT/dist/index.html" ]]; then
    NEW_DIST="$STAGING_ROOT/dist"
  elif [[ -f "$STAGING_ROOT/index.html" ]]; then
    NEW_DIST="$STAGING_ROOT"
  else
    rm -rf "$STAGING_ROOT"
    die "dist/index.html missing in archive — live site unchanged"
  fi
  log "New frontend build looks valid"
else
  log "No DIST_TARBALL set; keeping existing dist/"
  [[ -f "$ROOT/dist/index.html" ]] || die "dist/ is missing. Re-run the GitHub deploy workflow so it uploads the frontend build."
fi

if [[ "$SKIP_GIT" != "1" ]]; then
  log "Fetching $BRANCH from origin..."
  git remote set-url origin "$REPO_URL" 2>/dev/null || git remote add origin "$REPO_URL"
  git fetch --prune origin
  git checkout "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

log "Installing frontend dependencies (needed for vite preview)..."
if ! {
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
}; then
  rollback_keep_live_site "frontend npm install failed"
fi

log "Installing server dependencies..."
if ! (
  cd "$ROOT/server"
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
); then
  rollback_keep_live_site "server npm install failed"
fi

if [[ ! -e "$ROOT/server/.env" && -f "$ROOT/.env" ]]; then
  ln -sfn ../.env "$ROOT/server/.env"
  log "Linked server/.env -> ../.env"
fi

mkdir -p "$ROOT/logs"

resolve_pm2
log "Using: ${PM2[*]}"

if [[ -n "$NEW_DIST" ]]; then
  log "Activating new dist/ (previous build kept at .deploy/dist.prev)"
  rm -rf "$BACKUP_DIST"
  if [[ -d "$ROOT/dist" ]]; then
    mv "$ROOT/dist" "$BACKUP_DIST"
  fi
  if ! mv "$NEW_DIST" "$ROOT/dist"; then
    restore_previous_dist
    rollback_keep_live_site "failed to move new dist into place"
  fi
  rm -rf "$STAGING_ROOT"
fi

CUTOVER=1
if ! restart_all_pm2; then
  rollback_keep_live_site "PM2 restart failed"
fi

log "PM2 status:"
"${PM2[@]}" list

log "Checking local ports..."
web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3001/ || true)"
api_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:5002/api/auth/me || true)"
log "Frontend :3001 HTTP $web_code (expect 200)"
log "Backend  :5002 HTTP $api_code (expect 401/200 — process is up)"

if [[ "$web_code" != "200" && "$web_code" != "304" ]]; then
  rollback_keep_live_site "frontend did not respond on port 3001 (HTTP $web_code)"
fi
if [[ -z "$api_code" || "$api_code" == "000" ]]; then
  rollback_keep_live_site "backend did not respond on port 5002"
fi

rm -rf "$BACKUP_DIST"
log "Deploy complete — live site updated"

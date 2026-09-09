#!/usr/bin/env bash
# Manual production deploy — same steps GitHub Actions runs over SSH as user dev.
#
#   cd /var/www/canam-co-in-new
#   sudo npm run build
#   sudo pm2 start server/index.js --name new-crm-api
#   sudo pm2 serve dist 3001 --spa --name new-crm-web
#
# If npm run build fails, previous dist/ is restored and PM2 is not restarted.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CRM_API_NAME="${CRM_API_NAME:-new-crm-api}"
CRM_WEB_NAME="${CRM_WEB_NAME:-new-crm-web}"
BACKUP="/tmp/canam-dist.prev"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

git_cmd() {
  if git -c "safe.directory=*" "$@"; then
    return 0
  fi
  log "git $* failed as $(whoami); retrying with sudo -n"
  sudo -n git -c "safe.directory=*" "$@"
}

npm_cmd() {
  if sudo -n npm --version >/dev/null 2>&1; then
    sudo -n npm "$@"
  else
    npm "$@"
  fi
}

restore_dist() {
  if [[ -d "$BACKUP" ]]; then
    log "Restoring previous dist/ — live site kept"
    rm -rf "$ROOT/dist"
    cp -a "$BACKUP" "$ROOT/dist"
  fi
}

[[ -d "$ROOT/.git" ]] || die "Not a git checkout: $ROOT"
[[ -f "$ROOT/dist/index.html" ]] || die "live dist/index.html missing; refusing to deploy"

rm -rf "$BACKUP"
cp -a dist "$BACKUP"
log "Live dist backed up to $BACKUP"

log "git fetch/reset origin/main"
git_cmd fetch origin main
git_cmd checkout main
git_cmd reset --hard origin/main

log "npm ci (app)"
npm_cmd ci
log "npm ci (server)"
(cd server && npm_cmd ci)

log "sudo npm run build"
if ! npm_cmd run build; then
  restore_dist
  die "npm run build failed — previous site restored, PM2 not restarted"
fi

[[ -f dist/index.html ]] || { restore_dist; die "dist/index.html missing after build"; }

if sudo -n pm2 describe "$CRM_API_NAME" >/dev/null 2>&1; then
  sudo -n pm2 restart "$CRM_API_NAME" --update-env
else
  sudo -n pm2 start server/index.js --name "$CRM_API_NAME"
fi

if sudo -n pm2 describe "$CRM_WEB_NAME" >/dev/null 2>&1; then
  sudo -n pm2 restart "$CRM_WEB_NAME"
else
  sudo -n pm2 serve dist 3001 --spa --name "$CRM_WEB_NAME"
fi
sudo -n pm2 save || true
sudo -n pm2 list

web_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:3001/ || true)"
log "Frontend :3001 HTTP $web_code"
if [[ "$web_code" != "200" && "$web_code" != "304" ]]; then
  restore_dist
  sudo -n pm2 restart "$CRM_WEB_NAME" || true
  die "frontend check failed — previous dist restored"
fi

rm -rf "$BACKUP"
log "Deploy complete"

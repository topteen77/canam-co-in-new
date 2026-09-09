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
SUCCESS=0

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if [[ -x /usr/bin/npm ]]; then
  NPM=/usr/bin/npm
elif [[ -x /usr/local/bin/npm ]]; then
  NPM=/usr/local/bin/npm
else
  die "/usr/bin/npm not found"
fi

sudo_npm() {
  sudo -n "$NPM" "$@"
}

restore_dist() {
  if [[ -d "$BACKUP" ]]; then
    log "Restoring previous dist/ — live site kept"
    sudo -n rm -rf "$ROOT/dist"
    sudo -n cp -a "$BACKUP" "$ROOT/dist"
  fi
}

trap 'if [[ "$SUCCESS" != 1 ]]; then restore_dist; fi' EXIT

[[ -d "$ROOT/.git" ]] || die "Not a git checkout: $ROOT"
[[ -f "$ROOT/dist/index.html" ]] || die "live dist/index.html missing; refusing to deploy"

sudo -n rm -rf "$BACKUP"
sudo -n cp -a dist "$BACKUP"
log "Live dist backed up to $BACKUP"

log "git fetch/reset origin/main"
git -c "safe.directory=*" fetch origin main
git -c "safe.directory=*" checkout main
git -c "safe.directory=*" reset --hard origin/main

log "sudo npm ci (server)"
(cd server && sudo_npm ci)

log "sudo npm run build"
sudo_npm run build

[[ -f dist/index.html ]] || die "dist/index.html missing after build"

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
  sudo -n pm2 restart "$CRM_WEB_NAME" || true
  die "frontend check failed"
fi

SUCCESS=1
trap - EXIT
sudo -n rm -rf "$BACKUP"
log "Deploy complete"
